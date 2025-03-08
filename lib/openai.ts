import OpenAI from 'openai';
import { adminDb } from './firebase-admin';
import { Message } from '@/types';
import { createHash } from 'crypto';
import { RateLimiter } from 'limiter';
import { FieldValue } from 'firebase-admin/firestore';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Rate limiter: 50 requests per minute per user
const rateLimiters = new Map<string, RateLimiter>();

// Cost tracking constants
const COSTS = {
  'gpt-4': { input: 0.03, output: 0.06 },  // per 1k tokens
  'gpt-4-vision-preview': { input: 0.03, output: 0.06 },
  'gpt-4o': { input: 0.03, output: 0.06 },  // Same pricing as gpt-4
  'embedding': 0.0001  // per 1k tokens
} as const;

// Define email message interface to match the expected structure
interface EmailMessage extends Message {
  recipients: string[];
  subject?: string;
  timestamp: string;
}

export class OpenAIService {
  private userId: string;
  private rateLimiter: RateLimiter;

  constructor(userId: string) {
    this.userId = userId;
    
    // Get or create rate limiter for this user
    if (!rateLimiters.has(userId)) {
      // Create a new rate limiter with the correct arguments
      const limiter = new RateLimiter(50, 'minute', true);
      rateLimiters.set(userId, limiter);
    }
    this.rateLimiter = rateLimiters.get(userId)!;
  }

  private async trackCost(model: keyof typeof COSTS, inputTokens: number, outputTokens: number = 0) {
    try {
      const cost = model === 'embedding' 
        ? COSTS[model] * (inputTokens / 1000)
        : (COSTS[model].input * (inputTokens / 1000)) + (COSTS[model].output * (outputTokens / 1000));

      // Get user reference
      const userRef = adminDb.collection('users').doc(this.userId);
      
      // Get or create user document with usage data
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        await userRef.set({
          email: '',
          createdAt: new Date(),
          usage: {
            totalCost: 0,
            totalTokens: 0
          }
        });
      }
      
      // Update usage data
      await userRef.update({
        'usage.totalCost': FieldValue.increment(cost),
        'usage.totalTokens': FieldValue.increment(inputTokens + outputTokens),
        'usage.lastUsed': new Date()
      });
      
      // Log usage for monitoring
      await adminDb.collection('usage').add({
        userId: this.userId,
        model,
        inputTokens,
        outputTokens,
        cost,
        timestamp: new Date()
      });
      
    } catch (error) {
      console.error('Error tracking cost:', error);
      // Don't throw - this is a non-critical operation
    }
  }

  private async checkRateLimit() {
    // Use tryRemoveTokens which returns a boolean
    const hasTokens = await this.rateLimiter.tryRemoveTokens(1);
    if (!hasTokens) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
  }

  private async getCacheKey(messages: any[], model: string): Promise<string> {
    const input = JSON.stringify({ messages, model });
    return createHash('md5').update(input).digest('hex');
  }

  private async getCachedResponse(cacheKey: string): Promise<string | null> {
    try {
      const cacheRef = adminDb.collection('cache').doc(cacheKey);
      const cacheDoc = await cacheRef.get();
      
      if (cacheDoc.exists) {
        const data = cacheDoc.data();
        if (data && data.response && typeof data.response === 'string') {
          return data.response;
        }
      }
      return null;
    } catch (error) {
      console.error('Error getting cached response:', error);
      return null;
    }
  }

  private async setCachedResponse(cacheKey: string, response: string) {
    try {
      await adminDb.collection('cache').doc(cacheKey).set({
        response,
        timestamp: new Date(),
        userId: this.userId
      });
    } catch (error) {
      console.error('Error setting cached response:', error);
      // Don't throw - this is a non-critical operation
    }
  }

  async generateEmailResponse(emailThread: EmailMessage[], attachments: any[] = []): Promise<string> {
    try {
      await this.checkRateLimit();

      // Format the email thread for the prompt
      const formattedThread = emailThread.map(message => {
        return `From: ${message.sender}
To: ${message.recipients.join(', ')}
Subject: ${message.subject || 'No Subject'}
Date: ${new Date(message.timestamp).toLocaleString()}

${message.content}

${message.attachments && message.attachments.length > 0 
  ? `[Attachments: ${message.attachments.map(a => a.filename).join(', ')}]` 
  : ''}
-------------------`;
      }).join('\n\n');

      // Create the messages array for the API
      const messages = [
        {
          role: 'system',
          content: `You are an AI assistant that helps draft email replies. 
          Provide a professional, helpful, and concise response to the email thread.
          If there are attachments mentioned, acknowledge them appropriately.
          Format your response as plain text suitable for an email.`
        },
        {
          role: 'user',
          content: `Here is the email thread. Please draft a reply to the most recent email:\n\n${formattedThread}`
        }
      ] as any; // Type assertion to bypass TypeScript errors

      // Check cache first
      const cacheKey = await this.getCacheKey(messages, 'gpt-4');
      const cachedResponse = await this.getCachedResponse(cacheKey);
      
      if (cachedResponse) {
        console.log('[OpenAI] Using cached response');
        return cachedResponse;
      }

      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages,
        temperature: 0.7,
        max_tokens: 1000,
      });

      const response = completion.choices[0]?.message?.content || '';
      
      // Cache the response
      await this.setCachedResponse(cacheKey, response);
      
      // Track costs
      await this.trackCost('gpt-4', 
        completion.usage?.prompt_tokens || 0, 
        completion.usage?.completion_tokens || 0
      );

      return response;
    } catch (error: any) {
      console.error('[OpenAI] Error generating email response:', error);
      throw new Error('Failed to generate response. Please try again later.');
    }
  }

  async analyzeImage(imageUrl: string): Promise<string> {
    try {
      await this.checkRateLimit();

      console.log('[OpenAI] Analyzing image with GPT-4o');
      
      // Use proper type assertions for the OpenAI API
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this image and provide a detailed description of what you see. Include any relevant details about objects, people, scenery, text, or other elements visible in the image."
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ] as any, // Type assertion to bypass TypeScript errors
        max_tokens: 500
      });

      const analysis = response.choices[0]?.message?.content || '';
      console.log('[OpenAI] Image analysis complete:', analysis.substring(0, 100) + '...');

      // Track costs (approximate as actual token count isn't provided for vision)
      await this.trackCost('gpt-4o', 500, response.usage?.completion_tokens || 0);

      return analysis;

    } catch (error: any) {
      console.error('[OpenAI] Error analyzing image:', error);
      
      // Check if it's a model-related error and provide more specific error message
      if (error.code === 'model_not_found' || 
          (error.message && error.message.includes('model'))) {
        throw new Error(`Image analysis model error: ${error.message || 'Model not available'}`);
      }
      
      throw new Error('Failed to analyze image. Please try again later.');
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      await this.checkRateLimit();

      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
        encoding_format: 'float',
      });

      const embedding = response.data[0].embedding;

      // Track costs
      await this.trackCost('embedding', text.length / 4); // Approximate token count

      return embedding;

    } catch (error: any) {
      console.error('Error generating embedding:', error);
      throw new Error('Failed to generate embedding. Please try again later.');
    }
  }

  // Generate a concise 2-3 line summary of document content
  async generateConciseSummary(content: string, title: string = ''): Promise<string> {
    try {
      // Check rate limit
      await this.checkRateLimit();

      // Prepare the prompt
      const prompt = `
Document Title: ${title}
Document Content:
${content.substring(0, 8000)}

Task: Generate a concise 2-3 line summary (maximum 200 characters) that gives a detailed overview of what this document is about. 
Focus on the key information that would help someone understand the document's purpose and main content without reading it.
`;

      // Call OpenAI API
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that creates concise, informative summaries of documents.'
          },
          {
            role: 'user',
            content: prompt
          }
        ] as any, // Type assertion to bypass strict typing
        max_tokens: 150,
        temperature: 0.3,
      });

      // Extract and return the summary
      const summary = response.choices[0]?.message?.content?.trim() || '';
      
      // Track usage
      const inputTokens = response.usage?.prompt_tokens || 0;
      const outputTokens = response.usage?.completion_tokens || 0;
      
      // Use the correct model name for cost tracking
      const modelForCost = 'gpt-4' as keyof typeof COSTS;
      await this.trackCost(modelForCost, inputTokens, outputTokens);
      
      return summary;
    } catch (error) {
      console.error('[OpenAI] Error generating concise summary:', error);
      throw error;
    }
  }

  async generateAnswerWithContext(
    emailThread: EmailMessage[], 
    userMessages: Message[] = [], 
    attachments: any[] = [],
    customInstructions?: string
  ): Promise<{ content: string; attachmentIds: string[] }> {
    try {
      await this.checkRateLimit();

      // Get user's custom instructions or use default
      let systemPrompt = customInstructions || 
        `You are an AI assistant that helps draft email replies. 
        Provide a professional, helpful, and concise response to the email thread.
        If there are attachments mentioned, acknowledge them appropriately.
        Format your response as plain text suitable for an email.`;

      // Format the email thread for the prompt
      const formattedThread = emailThread.map(message => {
        return `From: ${message.sender}
To: ${message.recipients.join(', ')}
Subject: ${message.subject || 'No Subject'}
Date: ${new Date(message.timestamp).toLocaleString()}

${message.content}

${message.attachments && message.attachments.length > 0 
  ? `[Attachments: ${message.attachments.map(a => a.filename).join(', ')}]` 
  : ''}
-------------------`;
      }).join('\n\n');

      // Format user messages if they exist
      const formattedUserMessages = userMessages.length > 0 
        ? "\n\nPrevious messages in this conversation:\n" + userMessages.map(msg => 
            `${msg.sender === 'me' ? 'Me' : msg.sender}: ${msg.content}`
          ).join('\n')
        : '';

      // Format attachments with their summaries and IDs
      let formattedAttachments = '';
      if (attachments && attachments.length > 0) {
        formattedAttachments = "\n\nAvailable documents that may be relevant:\n";
        
        // Sort attachments by most recent first
        const sortedAttachments = [...attachments].sort((a, b) => {
          const dateA = a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp);
          const dateB = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
          return dateB.getTime() - dateA.getTime();
        });
        
        formattedAttachments += sortedAttachments.map((attachment, index) => {
          const date = attachment.timestamp instanceof Date 
            ? attachment.timestamp.toLocaleDateString() 
            : new Date(attachment.timestamp).toLocaleDateString();
            
          return `[${index + 1}] ID: ${attachment.id}
Filename: ${attachment.filename}
Date: ${date}
Type: ${attachment.mimeType}
Summary: ${attachment.summary || 'No summary available'}
`;
        }).join('\n');
        
        formattedAttachments += "\n\nIf any of these documents are relevant to your response, include them by referencing their IDs.";
      }

      // Create the system prompt with detailed instructions
      const systemContent = `${systemPrompt}
          
You have access to documents that may be relevant to the email thread. If any of these documents would be helpful to include in your response, reference them by including their IDs in the following format at the end of your message:

[ATTACHMENT_IDS: id1, id2, ...]

For example: "I've attached the document you requested. [ATTACHMENT_IDS: doc123]"

Only include this format if you're specifically referencing documents that should be attached with your response. Don't include this format if no documents are relevant.

When deciding which documents to include:
1. Only include documents that are directly relevant to the conversation
2. Prioritize documents that were specifically requested in the email
3. Don't include documents just because they exist - they must add value to your response
4. Briefly mention the attached documents in your response text
5. ONLY INCLUDE ONE ATTACHMENT unless multiple different documents are explicitly requested
6. If you're not sure which document to include, choose the most recent one that matches the request

IMPORTANT FORMATTING GUIDELINES:
1. DO NOT add "Re:" to the subject line - the system will handle this automatically
2. If you include a subject line, format it as "Subject: [Subject Text]" without "Re:"
3. If the original email has a subject, use that as a basis for your subject line, but remove any "Re:" prefix
4. If the user is asking for a specific document type (like an invoice, contract, report, etc.) and you don't see an exact match in the available documents, you can still reference a document ID that describes what they're looking for (e.g., "invoice", "contract", etc.). The system will try to find the most relevant document.
5. DO NOT reference attachments that don't exist in your response text. Only mention attachments that you've included in the [ATTACHMENT_IDS] section.
6. DO NOT include or quote the original message in your response. Write only your own response.
7. DO NOT use phrases like "In response to your message" or "You wrote" or similar phrases that reference the original message.`;

      // Create the user prompt with all context
      const userContent = `Here is the email thread. Please draft a reply to the most recent email:
${formattedThread}${formattedUserMessages}${formattedAttachments}`;

      // Create the messages array for the API
      const messages = [
        {
          role: 'system',
          content: systemContent
        },
        {
          role: 'user',
          content: userContent
        }
      ] as any; // Type assertion to bypass TypeScript errors

      // Log what we're sending to GPT (with some truncation for readability)
      console.log('[OpenAI] Sending to GPT:', {
        model: 'gpt-4o',
        threadLength: emailThread.length,
        userMessagesLength: userMessages.length,
        attachmentsLength: attachments.length,
        systemPromptPreview: systemContent.substring(0, 100) + '...',
        userPromptPreview: userContent,
        totalPromptLength: JSON.stringify(messages).length,
        emailSubjects: emailThread.map(m => m.subject).filter(Boolean),
        attachmentNames: attachments.map(a => a.filename),
      });

      // Check cache first
      const cacheKey = await this.getCacheKey(messages, 'gpt-4o');
      const cachedResponse = await this.getCachedResponse(cacheKey);
      
      if (cachedResponse) {
        console.log('[OpenAI] Using cached response');
        // Parse attachment IDs from cached response
        const attachmentIds = this.extractAttachmentIds(cachedResponse);
        return { content: this.processEmailResponse(cachedResponse), attachmentIds };
      }

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        temperature: 0.7,
        max_tokens: 1000,
      });

      const response = completion.choices[0]?.message?.content || '';
      
      // Cache the response
      await this.setCachedResponse(cacheKey, response);
      
      // Track costs
      await this.trackCost('gpt-4o', 
        completion.usage?.prompt_tokens || 0, 
        completion.usage?.completion_tokens || 0
      );

      // Extract attachment IDs from response
      const attachmentIds = this.extractAttachmentIds(response);
      
      // Process the response to remove attachment IDs and subject line
      const processedContent = this.processEmailResponse(response);
      
      console.log('[OpenAI] Generated response with attachments:', {
        responseLength: response.length,
        responsePreview: response.substring(0, 100) + '...',
        processedLength: processedContent.length,
        processedPreview: processedContent.substring(0, 100) + '...',
        attachmentIds,
        promptTokens: completion.usage?.prompt_tokens || 0,
        completionTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0
      });

      return { content: processedContent, attachmentIds };
    } catch (error: any) {
      console.error('[OpenAI] Error generating answer with context:', error);
      throw new Error('Failed to generate response. Please try again later.');
    }
  }

  // Helper method to extract attachment IDs from response
  private extractAttachmentIds(response: string): string[] {
    const match = response.match(/\[ATTACHMENT_IDS:\s*(.*?)\]/);
    if (!match || !match[1]) return [];
    
    return match[1].split(',').map(id => id.trim()).filter(id => id);
  }

  // Helper method to remove attachment IDs format from response
  private removeAttachmentIdsFormat(response: string): string {
    // Remove the attachment IDs format from the response
    return response.replace(/\[ATTACHMENT_IDS:.*?\]/g, '').trim();
  }
  
  private processEmailResponse(response: string): string {
    // Remove the attachment IDs format
    let processedResponse = this.removeAttachmentIdsFormat(response);
    
    // Remove the Subject line if present (without using 's' flag)
    const subjectRegex = /^Subject:.*\n\n/;
    processedResponse = processedResponse.replace(subjectRegex, '');
    
    // Remove any quoted content from the original email
    // This pattern matches content that looks like quoted text:
    // > Original message
    // or
    // On [date], [sender] wrote:
    // or
    // [sender] wrote:
    const quotedContentRegex = /(\n>.*(\n>.*)*)|(\nOn .*wrote:(\n.*)*)|(\n.*wrote:(\n.*)*)/g;
    processedResponse = processedResponse.replace(quotedContentRegex, '');
    
    // Remove any Gmail quote containers
    const gmailQuoteRegex = /<div class="gmail_quote.*?<\/div>/g;
    processedResponse = processedResponse.replace(gmailQuoteRegex, '');
    
    // Remove any content after a line with just "---" or "___" (common in email replies)
    const separatorRegex = /\n-{3,}[\s\S]*|\n_{3,}[\s\S]*/;
    processedResponse = processedResponse.replace(separatorRegex, '');
    
    // Remove any content after lines that look like original message indicators
    const originalMessageRegex = /\n.*Original Message.*[\s\S]*|\n.*Forwarded Message.*[\s\S]*/i;
    processedResponse = processedResponse.replace(originalMessageRegex, '');
    
    // Remove any HTML tags that might have slipped through
    processedResponse = processedResponse.replace(/<[^>]*>/g, '');
    
    // Remove any trailing quoted lines (lines starting with >)
    const trailingQuotesRegex = /\n>.*$/gm;
    processedResponse = processedResponse.replace(trailingQuotesRegex, '');
    
    // Clean up any excessive newlines
    processedResponse = processedResponse.replace(/\n{3,}/g, '\n\n');
    
    return processedResponse.trim();
  }
} 