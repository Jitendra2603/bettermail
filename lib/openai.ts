import OpenAI from 'openai';
import { adminDb } from './firebase-admin';
import { Message } from '@/types';
import { createHash } from 'crypto';
import { RateLimiter } from 'limiter';

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
  'embedding': 0.0001  // per 1k tokens
} as const;

export class OpenAIService {
  private userId: string;
  private rateLimiter: RateLimiter;

  constructor(userId: string) {
    this.userId = userId;
    
    // Get or create rate limiter for this user
    if (!rateLimiters.has(userId)) {
      rateLimiters.set(userId, new RateLimiter({
        tokensPerInterval: 50,
        interval: 'minute'
      }));
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
          usage: {
            totalCost: cost,
            totalTokens: inputTokens + outputTokens,
            lastUsed: new Date()
          }
        });
        return;
      }

      // Get current usage data
      const userData = userDoc.data();
      const currentUsage = userData?.usage || {
        totalCost: 0,
        totalTokens: 0
      };

      // Update usage with new values
      await userRef.update({
        'usage.totalCost': currentUsage.totalCost + cost,
        'usage.totalTokens': currentUsage.totalTokens + inputTokens + outputTokens,
        'usage.lastUsed': new Date()
      });

      // Log individual usage
      await userRef.collection('usage').add({
        timestamp: new Date(),
        model,
        inputTokens,
        outputTokens,
        cost
      });

    } catch (error) {
      console.error('[OpenAI] Error tracking cost:', error);
      // Don't throw error - allow operation to continue even if tracking fails
    }
  }

  private async checkRateLimit() {
    const hasTokens = await this.rateLimiter.tryRemoveTokens(1);
    if (!hasTokens) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
  }

  private async getCacheKey(messages: any[], model: string): Promise<string> {
    const hash = createHash('sha256');
    hash.update(JSON.stringify({ messages, model }));
    return hash.digest('hex');
  }

  private async getCachedResponse(cacheKey: string) {
    const cacheRef = adminDb.collection('cache').doc(cacheKey);
    const cache = await cacheRef.get();
    return cache.exists ? cache.data() : null;
  }

  private async setCachedResponse(cacheKey: string, response: any) {
    await adminDb.collection('cache').doc(cacheKey).set({
      response,
      timestamp: new Date(),
      userId: this.userId
    });
  }

  async generateEmailResponse(emailThread: Message[], attachments: any[] = []): Promise<string> {
    try {
      await this.checkRateLimit();

      // Prepare system message
      const systemMessage = {
        role: 'system',
        content: `You are an AI assistant helping to draft email responses. 
                 Analyze the email thread and generate a professional, contextually appropriate response.
                 Keep the tone consistent with previous communications.
                 Be concise but thorough in addressing all points.`
      };

      // Prepare email thread context
      const threadMessages = emailThread.map(email => ({
        role: 'user',
        content: `From: ${email.sender}\nContent: ${email.content}`
      }));

      // Add attachment context if any
      const attachmentContext = attachments.length > 0 ? [{
        role: 'user',
        content: `Relevant attachments:\n${attachments.map(a => 
          `- ${a.filename}: ${a.content}`).join('\n')}`
      }] : [];

      const messages = [systemMessage, ...threadMessages, ...attachmentContext];
      
      // Check cache
      const cacheKey = await this.getCacheKey(messages, 'gpt-4');
      const cached = await this.getCachedResponse(cacheKey);
      if (cached) {
        return cached.response;
      }

      // Generate response
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages,
        temperature: 0.7,
        max_tokens: 1000,
      });

      const response = completion.choices[0]?.message?.content || '';

      // Track costs
      await this.trackCost(
        'gpt-4',
        completion.usage?.prompt_tokens || 0,
        completion.usage?.completion_tokens || 0
      );

      // Cache response
      await this.setCachedResponse(cacheKey, response);

      return response;

    } catch (error: any) {
      console.error('Error generating email response:', error);
      
      // Log error for monitoring
      await adminDb.collection('errors').add({
        userId: this.userId,
        service: 'openai',
        error: error.message,
        timestamp: new Date()
      });

      throw new Error('Failed to generate response. Please try again later.');
    }
  }

  async analyzeImage(imageUrl: string): Promise<string> {
    try {
      await this.checkRateLimit();

      const response = await openai.chat.completions.create({
        model: 'gpt-4-vision-preview',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analyze this image and provide a detailed description.' },
              { type: 'image_url', image_url: imageUrl }
            ],
          },
        ],
        max_tokens: 500,
      });

      const analysis = response.choices[0]?.message?.content || '';

      // Track costs (approximate as actual token count isn't provided for vision)
      await this.trackCost('gpt-4-vision-preview', 500, response.usage?.completion_tokens || 0);

      return analysis;

    } catch (error: any) {
      console.error('Error analyzing image:', error);
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
} 