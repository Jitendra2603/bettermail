import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth-options";
import { OpenAIService } from "@/lib/openai";
import { adminDb } from "@/lib/firebase-admin";
import { GmailService } from "@/lib/gmail";
import { Message } from "@/types";

// Define interface for attachment data
interface DocumentAttachment {
  id: string;
  filename: string;
  summary: string;
  mimeType: string;
  url: string;
  timestamp: Date;
  size: number;
}

// Define enhanced Attachment interface with id and summary
interface EnhancedAttachment {
  id: string;
  filename: string;
  mimeType: string;
  url: string;
  summary?: string;
  size?: number;
  uploading?: boolean;
  attachmentId?: string;
}

// Define EmailMessage interface to match OpenAIService expectations
interface EmailMessage {
  id: string;
  content: string;
  sender: string;
  recipients: string[];
  subject?: string;
  timestamp: string;
  attachments?: EnhancedAttachment[];
}

// Define EmailThread interface
interface EmailThread {
  id: string;
  messages: EmailMessage[];
  historyId?: string;
}

export async function POST(
  request: Request,
  { params }: { params: { threadId: string } }
) {
  try {
    // Get threadId from params
    const threadId = params.threadId;
    console.log('[SuggestAPI] Received request for thread:', threadId);
    
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || !session?.user?.email || !session?.accessToken) {
      console.error('[SuggestAPI] Unauthorized request - no user session');
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    let messageId: string;
    try {
      const body = await request.json();
      messageId = body.messageId;
    } catch (error) {
      console.error('[SuggestAPI] Error parsing request body:', error);
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    console.log('[SuggestAPI] Processing message:', {
      messageId,
      threadId,
      userId: session.user.id
    });

    // Initialize services
    const openAIService = new OpenAIService(session.user.id);
    const gmailService = new GmailService(session.accessToken);

    // Get email thread from Gmail
    let rawEmailThread;
    let emailThread: EmailThread = { id: threadId, messages: [] };
    
    try {
      rawEmailThread = await gmailService.getThread(threadId);
      if (!rawEmailThread || !rawEmailThread.messages || rawEmailThread.messages.length === 0) {
        console.error('[SuggestAPI] Thread not found or empty:', threadId);
        return NextResponse.json({ error: "Thread not found or empty" }, { status: 404 });
      }
      
      // Convert Gmail messages to EmailMessage format
      const formattedMessages: EmailMessage[] = rawEmailThread.messages.map(message => {
        // Format attachments to include id
        const formattedAttachments = message.attachments ? 
          message.attachments.map(att => ({
            id: att.attachmentId || crypto.randomUUID(), // Use attachmentId as id or generate a new one
            filename: att.filename,
            mimeType: att.mimeType,
            url: att.url,
            attachmentId: att.attachmentId
          })) : [];
          
        return {
          id: message.id || message.messageId || '',
          content: message.content || '',
          sender: message.sender || message.from || '',
          recipients: Array.isArray(message.to) ? message.to : [message.to].filter(Boolean),
          subject: message.subject || '',
          timestamp: message.timestamp || new Date().toISOString(),
          attachments: formattedAttachments,
        };
      });
      
      emailThread = {
        id: threadId,
        messages: formattedMessages,
        historyId: rawEmailThread.historyId?.toString() || undefined
      };
      
    } catch (error) {
      console.error('[SuggestAPI] Error getting thread:', error);
      return NextResponse.json({ error: "Failed to retrieve email thread" }, { status: 500 });
    }

    // Get user messages from this conversation if they exist
    let userMessages: Message[] = [];
    try {
      const conversationRef = adminDb
        .collection('users')
        .doc(session.user.id)
        .collection('conversations')
        .where('threadId', '==', threadId);
      
      const conversationSnapshot = await conversationRef.get();
      
      if (!conversationSnapshot.empty) {
        const conversationDoc = conversationSnapshot.docs[0];
        const conversationData = conversationDoc.data();
        
        if (conversationData.messages && Array.isArray(conversationData.messages)) {
          userMessages = conversationData.messages as Message[];
        }
      }
    } catch (error) {
      console.error('[SuggestAPI] Error getting user messages:', error);
      // Continue without user messages
    }

    // Get user's custom AI instructions
    let customInstructions = '';
    try {
      const userRef = adminDb.collection('users').doc(session.user.id);
      const userDoc = await userRef.get();
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        customInstructions = userData?.aiInstructions || '';
      }
    } catch (error) {
      console.error('[SuggestAPI] Error getting AI instructions:', error);
      // Continue with default instructions
    }

    // Get relevant attachments
    let attachments: DocumentAttachment[] = [];
    try {
      // Get documents from the user's context collection
      const documentsRef = adminDb
        .collection('users')
        .doc(session.user.id)
        .collection('documents');
      
      // Get the most recent documents first, limited to 10
      const documentsSnapshot = await documentsRef
        .orderBy('timestamp', 'desc')
        .limit(10)
        .get();
      
      if (!documentsSnapshot.empty) {
        console.log(`[SuggestAPI] Found ${documentsSnapshot.size} documents in context`);
        
        attachments = documentsSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            filename: data.metadata?.title || data.metadata?.originalName || 'Untitled',
            summary: data.summary || 'No summary available',
            mimeType: data.metadata?.contentType || 'application/octet-stream',
            url: data.url || '',
            timestamp: data.timestamp?.toDate?.() || new Date(),
            size: data.metadata?.size || 0,
          };
        });
        
        console.log('[SuggestAPI] Processed attachments:', attachments.map(a => ({
          id: a.id,
          filename: a.filename,
          summaryLength: a.summary.length,
        })));
      } else {
        console.log('[SuggestAPI] No documents found in context');
      }
    } catch (error) {
      console.error('[SuggestAPI] Error getting attachments:', error);
      // Continue without attachments
    }

    // Generate AI response
    let content: string, attachmentIds: string[];
    try {
      console.log('[SuggestAPI] Generating AI response with context:', {
        threadId,
        messageCount: emailThread.messages.length,
        userMessagesCount: userMessages.length,
        attachmentsCount: attachments.length,
        hasCustomInstructions: !!customInstructions,
        customInstructionsLength: customInstructions?.length || 0,
        emailSubjects: emailThread.messages.map(m => m.subject).filter(Boolean),
      });
      
      const result = await openAIService.generateAnswerWithContext(
        emailThread.messages,
        userMessages,
        attachments,
        customInstructions
      );
      content = result.content;
      attachmentIds = result.attachmentIds;
      
      console.log('[SuggestAPI] AI response generated successfully:', {
        contentLength: content.length,
        contentPreview: content.substring(0, 100) + '...',
        attachmentIds,
        attachmentCount: attachmentIds.length
      });
    } catch (error) {
      console.error('[SuggestAPI] Error generating AI response:', error);
      return NextResponse.json({ error: "Failed to generate AI response" }, { status: 500 });
    }

    // Process attachment IDs from AI response
    const referencedAttachments: EnhancedAttachment[] = [];
    
    if (attachmentIds.length > 0) {
      console.log('[SuggestAPI] Processing attachment IDs:', attachmentIds);
      
      // First, check if any of the attachment IDs match existing attachments
      const matchingAttachments = attachments.filter(a => 
        attachmentIds.includes(a.id)
      );
      
      if (matchingAttachments.length > 0) {
        console.log('[SuggestAPI] Found matching attachments:', 
          matchingAttachments.map(a => ({ id: a.id, filename: a.filename }))
        );
        
        // Add matching attachments to referenced attachments
        matchingAttachments.forEach(attachment => {
          // Validate URL before adding
          if (attachment.url && (
              attachment.url.startsWith('http') || 
              attachment.url.startsWith('/api/') ||
              attachment.url.startsWith('/')
          )) {
            // Use the attachment proxy endpoint instead of the direct URL
            const proxyUrl = `/api/attachments/${attachment.id}`;
            
            referencedAttachments.push({
              id: attachment.id,
              filename: attachment.filename,
              mimeType: attachment.mimeType,
              url: proxyUrl,
              summary: attachment.summary,
              size: attachment.size,
            });
          } else {
            console.error('[SuggestAPI] Attachment has invalid URL:', attachment.url);
          }
        });
      }
      
      // Find missing attachment IDs
      const missingAttachmentIds = attachmentIds.filter(id => 
        !attachments.some(a => a.id === id)
      );
      
      if (missingAttachmentIds.length > 0) {
        console.log('[SuggestAPI] Warning: AI referenced non-existent attachments:', missingAttachmentIds);
        
        try {
          // First, try to find documents with similar content to what was requested
          const documentsRef = adminDb
            .collection('users')
            .doc(session.user.id)
            .collection('documents');
          
          const documentsSnapshot = await documentsRef.get();
          
          if (!documentsSnapshot.empty) {
            // Extract keywords from missing attachment IDs and content
            const keywords = [...missingAttachmentIds];
            
            // Add keywords from the email content
            const emailContent = emailThread.messages.map(m => m.content).join(' ').toLowerCase();
            
            // Common document types that might be requested
            const documentTypes = ['invoice', 'receipt', 'contract', 'report', 'proposal', 'pdf', 'document'];
            
            // Extract document type keywords from the email content
            documentTypes.forEach(type => {
              if (emailContent.includes(type)) {
                keywords.push(type);
              }
            });
            
            // Look for documents that match any of the keywords
            const matchingDocs = documentsSnapshot.docs.filter(doc => {
              const data = doc.data();
              const filename = (data.metadata?.title || data.metadata?.originalName || '').toLowerCase();
              const summary = (data.summary || '').toLowerCase();
              
              // Check if any keyword is contained in the filename or summary
              return keywords.some(keyword => 
                filename.includes(keyword) || summary.includes(keyword)
              );
            }).map(doc => {
              const data = doc.data();
              return {
                id: doc.id,
                filename: data.metadata?.title || data.metadata?.originalName || 'Untitled',
                summary: data.summary || 'No summary available',
                mimeType: data.metadata?.contentType || 'application/octet-stream',
                url: data.url || '',
                size: data.metadata?.size || 0,
              };
            });
            
            if (matchingDocs.length > 0) {
              console.log('[SuggestAPI] Found matching documents for requested attachments:', 
                matchingDocs.map(a => ({ id: a.id, filename: a.filename }))
              );
              
              // Sort matching documents by relevance
              // For invoice requests, prioritize documents with "invoice" in the filename
              const sortedDocs = [...matchingDocs].sort((a, b) => {
                const aFilename = a.filename.toLowerCase();
                const bFilename = b.filename.toLowerCase();
                
                // If looking for an invoice, prioritize invoice files
                if (keywords.includes('invoice')) {
                  const aHasInvoice = aFilename.includes('invoice');
                  const bHasInvoice = bFilename.includes('invoice');
                  
                  if (aHasInvoice && !bHasInvoice) return -1;
                  if (!aHasInvoice && bHasInvoice) return 1;
                }
                
                // Otherwise, prioritize by keyword match count
                const aKeywordMatches = keywords.filter(k => aFilename.includes(k)).length;
                const bKeywordMatches = keywords.filter(k => bFilename.includes(k)).length;
                
                return bKeywordMatches - aKeywordMatches;
              });
              
              // Only add the most relevant document to avoid attaching too many files
              const mostRelevantDoc = sortedDocs[0];
              
              // Validate the URL before adding
              if (mostRelevantDoc.url && (
                  mostRelevantDoc.url.startsWith('http') || 
                  mostRelevantDoc.url.startsWith('/api/')
              )) {
                console.log('[SuggestAPI] Adding most relevant document:', {
                  id: mostRelevantDoc.id,
                  filename: mostRelevantDoc.filename,
                  url: mostRelevantDoc.url
                });
                
                // Use the attachment proxy endpoint instead of the direct URL
                const proxyUrl = `/api/attachments/${mostRelevantDoc.id}`;
                
                referencedAttachments.push({
                  id: mostRelevantDoc.id,
                  filename: mostRelevantDoc.filename,
                  mimeType: mostRelevantDoc.mimeType,
                  url: proxyUrl,
                  summary: mostRelevantDoc.summary,
                  size: mostRelevantDoc.size,
                });
              } else {
                console.error('[SuggestAPI] Most relevant document has invalid URL:', mostRelevantDoc.url);
              }
            } else {
              console.log('[SuggestAPI] No matching documents found for requested attachments');
            }
          }
        } catch (error) {
          console.error('[SuggestAPI] Error searching for matching documents:', error);
        }
      }
    }

    // Process the content to remove any "Re:" prefix that might have been added by the AI
    if (content.startsWith('Subject: Re:')) {
      // Replace "Subject: Re:" with just "Subject:"
      content = content.replace(/^Subject: Re:/, 'Subject:');
    } else if (content.startsWith('Re:')) {
      // Remove the "Re:" prefix entirely
      content = content.replace(/^Re:/, '');
    }

    // Create a suggestion ID
    const suggestionId = crypto.randomUUID();

    // Store the suggestion in Firestore with attachment details
    try {
      await adminDb
        .collection('users')
        .doc(session.user.id)
        .collection('suggestions')
        .doc(suggestionId)
        .set({
          id: suggestionId,
          content,
          threadId,
          messageId,
          attachmentIds: referencedAttachments.map(att => att.id), // Use the actual attachment IDs we found
          attachments: referencedAttachments, // Store full attachment details
          timestamp: new Date(),
          status: 'pending',
        });
    } catch (error) {
      console.error('[SuggestAPI] Error storing suggestion:', error);
      // Continue without storing
    }

    // Format the response
    const suggestion = {
      id: suggestionId,
      content,
      sender: 'ai',
      type: 'suggestion',
      timestamp: new Date().toISOString(),
      suggestion: {
        id: suggestionId,
        status: 'pending',
      },
      attachments: referencedAttachments,
    };

    console.log('[SuggestAPI] Generated suggestion:', {
      id: suggestion.id,
      contentPreview: suggestion.content.substring(0, 100) + '...',
      attachmentsCount: referencedAttachments.length
    });

    // Add thread context to the response
    const response = {
      success: true,
      suggestion: {
        ...suggestion,
        threadId,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[SuggestAPI] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestion" },
      { status: 500 }
    );
  }
} 