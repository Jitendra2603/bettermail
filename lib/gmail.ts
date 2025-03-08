import { google } from 'googleapis';
import { adminDb } from './firebase-admin';
import { gmail_v1 } from 'googleapis';
import { adminStorage } from './firebase-admin';

export class GmailService {
  private gmail: gmail_v1.Gmail;

  constructor(accessToken: string) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    
    this.gmail = google.gmail({
      version: 'v1',
      auth
    });
  }

  private decodeMessage(message: any) {
    try {
      console.log('Decoding message:', message.id);
      const payload = message.payload;
      const headers = payload.headers;

      const subject = headers.find((h: any) => h.name === 'Subject')?.value;
      const from = headers.find((h: any) => h.name === 'From')?.value;
      const to = headers.find((h: any) => h.name === 'To')?.value?.split(',').map((e: string) => e.trim());
      
      // Check if this is a sent message
      const isSentMessage = message.labelIds?.includes('SENT');
      
      // For sent messages, use 'me' as sender
      // For received messages, extract the email from the From header
      const effectiveSender = isSentMessage 
        ? 'me'
        : from.includes('<') 
          ? from.match(/<(.+?)>/)?.[1] || from 
          : from;

      let textBody = '';
      let htmlBody = '';
      const attachments: { filename: string; mimeType: string; url: string; attachmentId: string; part: any }[] = [];
      
      // Helper function to decode parts recursively
      const decodeParts = (parts: any[]) => {
        for (const part of parts) {
          if (part.mimeType === 'text/plain') {
            textBody = Buffer.from(part.body.data, 'base64').toString();
          } else if (part.mimeType === 'text/html') {
            htmlBody = Buffer.from(part.body.data, 'base64').toString();
          } else if (part.filename && part.body?.attachmentId) {
            // Store the entire part object for later use
            attachments.push({
              filename: part.filename,
              mimeType: part.mimeType,
              url: `/api/emails/${message.id}/attachments/${part.body.attachmentId}`,
              attachmentId: part.body.attachmentId,
              part: part
            });
            
            console.log('[GmailService] Found attachment:', {
              filename: part.filename,
              mimeType: part.mimeType,
              attachmentId: part.body.attachmentId,
              from: effectiveSender
            });
          }
          
          // Handle nested parts
          if (part.parts) {
            decodeParts(part.parts);
          }
        }
      };

      if (payload.parts) {
        decodeParts(payload.parts);
      } else if (payload.body.data) {
        // Handle single part messages
        if (payload.mimeType === 'text/html') {
          htmlBody = Buffer.from(payload.body.data, 'base64').toString();
        } else {
          textBody = Buffer.from(payload.body.data, 'base64').toString();
        }
      }

      // Clean up the text content
      if (textBody) {
        // Remove email quotes and signatures
        textBody = textBody.split(/On .+wrote:|\r?\n\s*>[^\n]*/)[0].trim();
        // Remove any trailing "--" signature markers
        textBody = textBody.split(/\r?\n\s*--\s*\r?\n/)[0].trim();
      }

      // Clean up HTML content
      if (htmlBody) {
        // Remove quoted content
        htmlBody = htmlBody.replace(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi, '');
        // Remove email signatures
        htmlBody = htmlBody.replace(/<div[^>]*class="(?:[^"]*\s)?gmail_signature[^>]*>[\s\S]*?<\/div>/gi, '');
        // Remove "On [date] [person] wrote:" patterns
        htmlBody = htmlBody.replace(/<div[^>]*>On .+wrote:[\s\S]*?<\/div>/gi, '');
      }

      console.log('Successfully decoded message:', {
        messageId: message.id,
        threadId: message.threadId,
        subject,
        from: effectiveSender,
        to: to?.length,
        attachments: attachments.length,
        isSentMessage
      });

      return {
        messageId: message.id,
        threadId: message.threadId,
        from: effectiveSender,
        to,
        subject,
        content: textBody || htmlBody,
        htmlContent: htmlBody,
        attachments,
        receivedAt: new Date(parseInt(message.internalDate)),
        labels: message.labelIds || [],
        isRead: !message.labelIds?.includes('UNREAD'),
        type: 'message', // Set explicit message type
        sender: effectiveSender, // Use consistent sender format
        timestamp: new Date(parseInt(message.internalDate)).toISOString(),
        id: message.id, // Add id field for consistency
      };
    } catch (error) {
      console.error('Error decoding message:', message.id, error);
      throw error;
    }
  }

  private async handleAuthError(error: any) {
    console.error('[GmailService] Auth error:', error);
    if (error.code === 401 || (error.response?.status === 401)) {
      throw new Error('AUTH_REFRESH_NEEDED');
    }
    throw error;
  }

  private async processAttachment(
    userId: string,
    messageId: string,
    attachment: { filename: string; mimeType: string; attachmentId: string; part: any },
    sender: string,
    isSentMessage: boolean = false
  ) {
    try {
      // Clean up sender format - extract just the email or name
      // For sent messages, use 'You' as the sender
      const cleanSender = isSentMessage 
        ? 'You'
        : sender.includes('<') 
          ? sender.match(/<(.+?)>/)?.[1] || sender 
          : sender === 'me' || sender === 'You' 
            ? 'You' 
            : sender;

      console.log('[GmailService] Processing attachment:', {
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        from: cleanSender,
        isSentMessage
      });

      // Get the attachment data
      const attachmentData = await this.getAttachment(messageId, attachment);
      if (!attachmentData) {
        throw new Error('Failed to get attachment data');
      }

      // Upload to Firebase Storage
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `users/${userId}/emails/${timestamp}-${attachment.filename}`;
      const bucket = adminStorage.bucket();
      const fileRef = bucket.file(fileName);

      await fileRef.save(attachmentData.data, {
        metadata: {
          contentType: attachment.mimeType,
          metadata: {
            originalName: attachment.filename,
            size: attachmentData.data.length,
            uploadedBy: cleanSender,
            uploadedAt: new Date().toISOString(),
          },
        },
      });

      // Make the file publicly accessible
      await fileRef.makePublic();
      const publicUrl = fileRef.publicUrl();

      // Check if we already have this document - check by filename only
      const existingDocs = await adminDb
        .collection('users')
        .doc(userId)
        .collection('documents')
        .where('filename', '==', attachment.filename)
        .get();

      // Check if any existing document has the same content length
      const hasDuplicate = existingDocs.docs.some(doc => {
        const metadata = doc.data().metadata;
        return metadata?.size === attachmentData.data.length;
      });

      if (hasDuplicate) {
        console.log('[GmailService] Document already exists (same name and size):', {
          filename: attachment.filename,
          sender: cleanSender
        });
        return;
      }

      // Initialize services
      let openAIService;
      let llamaParseService;

      if (process.env.OPENAI_API_KEY) {
        const { OpenAIService } = await import('./openai');
        openAIService = new OpenAIService(userId);
      }

      if (process.env.LLAMA_PARSE_API_KEY) {
        const { LlamaParseService } = await import('./llama-parse');
        llamaParseService = new LlamaParseService(
          process.env.LLAMA_PARSE_API_KEY,
          userId,
          openAIService
        );
      }

      // Process based on type
      if (attachment.mimeType.startsWith('image/') && openAIService) {
        try {
          // Process image with GPT-4o
          console.log('[GmailService] Analyzing image attachment:', attachment.filename);
          const analysis = await openAIService.analyzeImage(publicUrl);
          
          // Store the analysis in Firestore with metadata
          await adminDb
            .collection('users')
            .doc(userId)
            .collection('documents')
            .add({
              filename: attachment.filename,
              mimeType: attachment.mimeType,
              url: publicUrl,
              text: analysis,
              sender: 'You',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              userId,
              metadata: {
                title: `Image: ${attachment.filename}`,
                size: attachmentData.data.length,
                uploadedAt: new Date().toISOString(),
                summary: analysis.substring(0, 200) + (analysis.length > 200 ? '...' : ''),
                oneLineSummary: analysis.split('.')[0] + '.',
                imageAnalysis: true
              },
              hasEmbedding: false,
              hasAnalysis: true
            });
          
          console.log('[GmailService] Successfully analyzed image:', attachment.filename);
        } catch (error) {
          // Log the error but continue with the email sending process
          console.error('[GmailService] Error analyzing image, continuing without analysis:', error);
          
          // Still store the attachment in Firestore without analysis
          await adminDb
            .collection('users')
            .doc(userId)
            .collection('documents')
            .add({
              filename: attachment.filename,
              mimeType: attachment.mimeType,
              url: publicUrl,
              text: 'Image attachment (analysis not available)',
              sender: 'You',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              userId,
              metadata: {
                title: `Image: ${attachment.filename}`,
                size: attachmentData.data.length,
                uploadedAt: new Date().toISOString(),
                summary: 'Image analysis not available',
                oneLineSummary: 'Image attachment without analysis',
                imageAnalysis: false
              },
              hasEmbedding: false,
              hasAnalysis: false
            });
        }
      } else if (attachment.mimeType === 'application/pdf' && llamaParseService) {
        // Process PDF with LlamaParse
        await llamaParseService.parseDocument(fileName, attachment.filename, cleanSender);
      }

      console.log('[GmailService] Successfully processed attachment:', {
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        from: cleanSender,
        size: attachmentData.data.length
      });

    } catch (error) {
      console.error('[GmailService] Error processing attachment:', {
        filename: attachment.filename,
        error
      });
      // Continue with other attachments even if one fails
    }
  }

  async syncEmails(userId: string) {
    try {
      console.log('[GmailService] Starting email sync for user:', userId);
      
      // Get or create processing lock
      const userRef = adminDb.collection('users').doc(userId);
      const lockRef = userRef.collection('locks').doc('emailSync');
      
      // Try to acquire lock
      const lockDoc = await lockRef.get();
      const now = new Date();
      const lockExpiry = lockDoc.exists ? lockDoc.data()?.expiresAt?.toDate() : null;
      
      if (lockDoc.exists && lockExpiry && lockExpiry > now) {
        console.log('[GmailService] Sync already in progress, skipping');
        return true;
      }

      // Set lock for 5 minutes
      await lockRef.set({
        startedAt: now,
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000)
      });
      
      // Get the last sync timestamp from Firestore
      const userDoc = await userRef.get();
      const lastSyncTime = userDoc.data()?.lastEmailSync?.toDate() || new Date(0);
      
      console.log('[GmailService] Last sync time:', lastSyncTime);

      // Query for both inbox and sent messages after last sync
      const query = `in:inbox OR in:sent after:${Math.floor(lastSyncTime.getTime() / 1000)}`;
      let pageToken: string | undefined;
      const emailsRef = adminDb.collection('users').doc(userId).collection('emails');
      let totalProcessed = 0;

      do {
        const response = await this.gmail.users.messages.list({
          userId: 'me',
          maxResults: 25, // Process in smaller batches
          pageToken,
          q: query,
        });

        console.log('[GmailService] Gmail API response:', {
          hasMessages: !!response.data.messages,
          messageCount: response.data.messages?.length || 0,
          hasNextPage: !!response.data.nextPageToken
        });

        const messages = response.data.messages || [];
        
        // Process messages in parallel with a concurrency limit
        const batchPromises = messages.map(async (message) => {
          try {
            if (!message.id) return false;
            
            // Check if message already processed
            const existingEmail = await emailsRef.doc(message.id).get();
            if (existingEmail.exists) {
              console.log('[GmailService] Message already processed:', message.id);
              return true;
            }
            
            console.log('[GmailService] Fetching full message:', message.id);
            const fullMessage = await this.gmail.users.messages.get({
              userId: 'me',
              id: message.id,
              format: 'full'
            });

            if (!fullMessage.data) return false;

            const emailData = this.decodeMessage(fullMessage.data);
            
            // Store email in Firestore
            await emailsRef.doc(emailData.messageId).set({
              ...emailData,
              userId,
              updatedAt: new Date(),
            }, { merge: true });

            // Process attachments if any
            if (emailData.attachments?.length) {
              for (const attachment of emailData.attachments) {
                await this.processAttachment(
                  userId,
                  emailData.messageId,
                  attachment,
                  emailData.from,
                  emailData.labels?.includes('SENT')
                );
              }
            }

            return true;
          } catch (error) {
            console.error('[GmailService] Error processing message:', message.id, error);
            return false;
          }
        });

        // Process 5 messages at a time
        for (let i = 0; i < batchPromises.length; i += 5) {
          const batch = batchPromises.slice(i, i + 5);
          await Promise.all(batch);
          totalProcessed += batch.length;
          
          console.log('[GmailService] Processed batch:', {
            processed: totalProcessed,
            total: messages.length
          });
        }

        pageToken = response.data.nextPageToken || undefined;
      } while (pageToken && totalProcessed < 100); // Limit total emails per sync

      // Update last sync time and release lock
      await userRef.update({
        lastEmailSync: new Date(),
      });
      await lockRef.delete();

      console.log('[GmailService] Email sync completed successfully');
      return true;
    } catch (error) {
      console.error('[GmailService] Error syncing emails:', error);
      await this.handleAuthError(error);
      throw error;
    }
  }

  async markAsRead(userId: string, messageId: string) {
    try {
      console.log('Marking message as read:', messageId);
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD'],
        },
      });

      const emailRef = adminDb.collection('users').doc(userId).collection('emails').doc(messageId);
      await emailRef.update({
        isRead: true,
        updatedAt: new Date(),
      });
      console.log('Successfully marked message as read:', messageId);

      return true;
    } catch (error) {
      console.error('Error marking email as read:', error);
      throw error;
    }
  }

  async sendReply(
    userId: string, 
    threadId: string, 
    to: string[], 
    content: string, 
    attachments?: { url: string; filename: string; mimeType: string; }[], 
    skipAttachments: boolean = false
  ): Promise<{
    id: string | null;
    threadId: string | null;
    labelIds: string[] | null;
    successfulAttachments: string[];
    failedAttachments: string[];
  }> {
    try {
      console.log('[GmailService] Starting to send reply:', { 
        threadId, 
        to, 
        contentLength: content?.length,
        hasAttachments: !!attachments?.length,
        skipAttachments
      });

      // If skipAttachments is true, ignore any attachments
      const effectiveAttachments = skipAttachments ? [] : attachments;
      
      // Get attachment data before sending email
      const attachmentBuffers: { [key: string]: Buffer } = {};
      const failedAttachments: string[] = [];
      const successfulAttachments: string[] = [];
      
      if (effectiveAttachments?.length) {
        for (const attachment of effectiveAttachments) {
          try {
            console.log('[GmailService] Processing attachment:', attachment.filename, 'URL:', attachment.url);
            
            // Skip attachments with invalid URLs
            if (!attachment.url) {
              console.warn('[GmailService] Skipping attachment with missing URL:', attachment.filename);
              failedAttachments.push(attachment.filename);
              continue;
            }
            
            // Handle local file URLs differently
            let buffer: Buffer;
            if (attachment.url.startsWith('/api/')) {
              // For API endpoints, fetch from the local server
              try {
                // Construct the full URL for the API endpoint
                const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
                const apiUrl = `${baseUrl}${attachment.url}`;
                
                console.log('[GmailService] Fetching from API endpoint:', apiUrl);
                
                const response = await fetch(apiUrl);
                if (!response.ok) {
                  console.error(`[GmailService] Failed to fetch from API endpoint: ${response.statusText}`, {
                    status: response.status,
                    url: apiUrl
                  });
                  failedAttachments.push(attachment.filename);
                  continue;
                }
                
                buffer = Buffer.from(await response.arrayBuffer());
              } catch (apiError) {
                console.error('[GmailService] Error fetching from API endpoint:', apiError);
                failedAttachments.push(attachment.filename);
                continue;
              }
            } else if (attachment.url.startsWith('/')) {
              // For local files, read directly from storage
              try {
                const bucket = adminStorage.bucket();
                const filePath = attachment.url.replace(/^\//, ''); // Remove leading slash
                console.log('[GmailService] Fetching file from storage:', filePath);
                const [fileContent] = await bucket.file(filePath).download();
                buffer = fileContent;
              } catch (storageError) {
                console.error('[GmailService] Error downloading from storage:', storageError);
                failedAttachments.push(attachment.filename);
                continue;
              }
            } else {
              // For remote URLs, fetch the content
              try {
                console.log('[GmailService] Fetching from URL:', attachment.url);
                const response = await fetch(attachment.url);
                if (!response.ok) {
                  console.error(`[GmailService] Failed to fetch attachment: ${response.statusText}`, {
                    status: response.status,
                    url: attachment.url
                  });
                  failedAttachments.push(attachment.filename);
                  continue;
                }
                buffer = Buffer.from(await response.arrayBuffer());
              } catch (fetchError) {
                console.error('[GmailService] Error fetching attachment:', fetchError);
                failedAttachments.push(attachment.filename);
                continue;
              }
            }
            
            // Store buffer for later use
            attachmentBuffers[attachment.filename] = buffer;
            successfulAttachments.push(attachment.filename);
            console.log('[GmailService] Successfully processed attachment:', attachment.filename, 'Size:', buffer.length);
          } catch (attachmentError) {
            console.error('[GmailService] Error processing attachment:', attachment.filename, attachmentError);
            failedAttachments.push(attachment.filename);
          }
        }
      }

      // Log any failed attachments
      if (failedAttachments.length > 0) {
        console.warn('[GmailService] Some attachments could not be processed:', failedAttachments);
      }
      
      // If all attachments failed and we wanted to include attachments, try again without attachments
      if (effectiveAttachments?.length && successfulAttachments.length === 0 && failedAttachments.length > 0) {
        if (skipAttachments) {
          // We're already trying without attachments, so this is a real error
          throw new Error('Failed to send email even without attachments.');
        } else {
          // Try again without attachments
          console.log('[GmailService] All attachments failed, retrying without attachments');
          return this.sendReply(userId, threadId, to, content, [], true);
        }
      }

      // Get the original message to get subject and message IDs
      const thread = await this.gmail.users.threads.get({
        userId: 'me',
        id: threadId,
      });

      const originalMessage = thread.data.messages?.[0];
      if (!originalMessage) {
        throw new Error('Could not find original message');
      }

      // Get the subject and headers from the original message
      const originalHeaders = originalMessage.payload?.headers || [];
      const subject = originalHeaders.find(h => h?.name?.toLowerCase() === 'subject')?.value || 'Re: No Subject';
      const messageId = originalHeaders.find(h => h?.name?.toLowerCase() === 'message-id')?.value;
      const references = originalHeaders.find(h => h?.name?.toLowerCase() === 'references')?.value;

      // Build the References header
      const newReferences = [
        ...(references ? [references] : []),
        messageId
      ].filter(Boolean).join(' ');

      // Generate unique boundary strings
      const mixedBoundary = `mixed_${Math.random().toString(36).substring(2)}`;
      const altBoundary = `alt_${Math.random().toString(36).substring(2)}`;

      // Start building email parts
      const emailParts = [
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
        'From: me',
        'To: ' + to.join(', '),
        'Subject: ' + (subject.toLowerCase().startsWith('re:') ? subject : 'Re: ' + subject),
        messageId ? 'In-Reply-To: ' + messageId : '',
        newReferences ? 'References: ' + newReferences : '',
        '',
        `--${mixedBoundary}`,
        `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
        '',
        `--${altBoundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(content.replace(/<[^>]*>/g, '')).toString('base64').replace(/(.{76})/g, '$1\r\n'),
        '',
        `--${altBoundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(content).toString('base64').replace(/(.{76})/g, '$1\r\n'),
        '',
        `--${altBoundary}--`
      ];

      // Add attachments if any
      if (effectiveAttachments?.length) {
        for (const attachment of effectiveAttachments) {
          // Only include attachments that were successfully processed
          if (successfulAttachments.includes(attachment.filename)) {
            const buffer = attachmentBuffers[attachment.filename];
            
            emailParts.push(
              '',
              `--${mixedBoundary}`,
              `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
              'Content-Transfer-Encoding: base64',
              `Content-Disposition: attachment; filename="${attachment.filename}"`,
              '',
              buffer.toString('base64').replace(/(.{76})/g, '$1\r\n')
            );
          }
        }
      }

      // Add final boundary
      emailParts.push('', `--${mixedBoundary}--`, '');

      // Join all parts with proper line endings
      const email = emailParts.join('\r\n');

      // Encode the email in base64 format (NOT base64url)
      const encodedEmail = Buffer.from(email).toString('base64');

      console.log('[GmailService] Sending email:', {
        length: encodedEmail.length,
        threadId,
        hasAttachments: !!attachments?.length,
        firstFewChars: encodedEmail.substring(0, 50) + '...'
      });

      // Send the reply
      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedEmail,
          threadId,
        },
      });

      console.log('[GmailService] Reply sent successfully:', response.data);

      // Get the sent message to get attachment IDs
      const sentMessage = await this.gmail.users.messages.get({
        userId: 'me',
        id: response.data.id!,
      });

      // Extract attachment IDs from the sent message
      interface SentAttachment {
        filename: string;
        mimeType: string;
        url: string;
        attachmentId: string;
      }
      
      const sentAttachments: SentAttachment[] = [];
      const findAttachments = (parts: any[]) => {
        for (const part of parts) {
          if (part.filename && part.body?.attachmentId) {
            sentAttachments.push({
              filename: part.filename,
              mimeType: part.mimeType,
              url: `/api/emails/${response.data.id}/attachments/${part.body.attachmentId}`,
              attachmentId: part.body.attachmentId
            });
          }
          if (part.parts) {
            findAttachments(part.parts);
          }
        }
      };

      if (sentMessage.data.payload?.parts) {
        findAttachments(sentMessage.data.payload.parts);
      }

      // Add the sent message to Firestore
      const messageData = {
        messageId: response.data.id!,
        threadId,
        from: 'me',
        to,
        body: content,
        htmlBody: content,
        receivedAt: new Date(),
        labels: response.data.labelIds || [],
        isRead: true,
        userId,
        updatedAt: new Date(),
        attachments: sentAttachments
      };

      await adminDb
        .collection('users')
        .doc(userId)
        .collection('emails')
        .doc(response.data.id!)
        .set(messageData);

      // After successful send, process the attachments for indexing using the data we already have
      if (effectiveAttachments?.length && response.data.id) {
        for (const attachment of effectiveAttachments) {
          const buffer = attachmentBuffers[attachment.filename];
          
          // Upload to Firebase Storage
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const fileName = `users/${userId}/emails/${timestamp}-${attachment.filename}`;
          const bucket = adminStorage.bucket();
          const fileRef = bucket.file(fileName);

          await fileRef.save(buffer, {
            metadata: {
              contentType: attachment.mimeType,
              metadata: {
                originalName: attachment.filename,
                size: buffer.length,
                uploadedBy: 'You',
                uploadedAt: new Date().toISOString(),
              },
            },
          });

          // Make the file publicly accessible
          await fileRef.makePublic();
          const publicUrl = fileRef.publicUrl();

          // Check for duplicates
          const existingDocs = await adminDb
            .collection('users')
            .doc(userId)
            .collection('documents')
            .where('filename', '==', attachment.filename)
            .get();

          // Check if any existing document has the same content length
          const hasDuplicate = existingDocs.docs.some(doc => {
            const metadata = doc.data().metadata;
            return metadata?.size === buffer.length;
          });

          if (hasDuplicate) {
            console.log('[GmailService] Document already exists (same name and size):', {
              filename: attachment.filename,
              sender: 'You'
            });
            continue;
          }

          // Initialize services
          let openAIService;
          let llamaParseService;

          if (process.env.OPENAI_API_KEY) {
            const { OpenAIService } = await import('./openai');
            openAIService = new OpenAIService(userId);
          }

          if (process.env.LLAMA_PARSE_API_KEY) {
            const { LlamaParseService } = await import('./llama-parse');
            llamaParseService = new LlamaParseService(
              process.env.LLAMA_PARSE_API_KEY,
              userId,
              openAIService
            );
          }

          // Process based on type
          if (attachment.mimeType.startsWith('image/') && openAIService) {
            try {
              // Process image with GPT-4o
              console.log('[GmailService] Analyzing image attachment:', attachment.filename);
              const analysis = await openAIService.analyzeImage(publicUrl);
              
              // Store the analysis in Firestore with metadata
              await adminDb
                .collection('users')
                .doc(userId)
                .collection('documents')
                .add({
                  filename: attachment.filename,
                  mimeType: attachment.mimeType,
                  url: publicUrl,
                  text: analysis,
                  sender: 'You',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  userId,
                  metadata: {
                    title: `Image: ${attachment.filename}`,
                    size: buffer.length,
                    uploadedAt: new Date().toISOString(),
                    summary: analysis.substring(0, 200) + (analysis.length > 200 ? '...' : ''),
                    oneLineSummary: analysis.split('.')[0] + '.',
                    imageAnalysis: true
                  },
                  hasEmbedding: false,
                  hasAnalysis: true
                });
              
              console.log('[GmailService] Successfully analyzed image:', attachment.filename);
            } catch (error) {
              // Log the error but continue with the email sending process
              console.error('[GmailService] Error analyzing image, continuing without analysis:', error);
              
              // Still store the attachment in Firestore without analysis
              await adminDb
                .collection('users')
                .doc(userId)
                .collection('documents')
                .add({
                  filename: attachment.filename,
                  mimeType: attachment.mimeType,
                  url: publicUrl,
                  text: 'Image attachment (analysis not available)',
                  sender: 'You',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  userId,
                  metadata: {
                    title: `Image: ${attachment.filename}`,
                    size: buffer.length,
                    uploadedAt: new Date().toISOString(),
                    summary: 'Image analysis not available',
                    oneLineSummary: 'Image attachment without analysis',
                    imageAnalysis: false
                  },
                  hasEmbedding: false,
                  hasAnalysis: false
                });
            }
          } else if (attachment.mimeType === 'application/pdf' && llamaParseService) {
            // Process PDF with LlamaParse
            await llamaParseService.parseDocument(fileName, attachment.filename, 'You');
          }

          console.log('[GmailService] Successfully processed sent attachment:', {
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            size: buffer.length
          });
        }
      }

      // Return response with information about which attachments were included
      return {
        id: response.data.id || null,
        threadId: response.data.threadId || null,
        labelIds: response.data.labelIds || null,
        successfulAttachments,
        failedAttachments
      };
    } catch (error) {
      console.error('[GmailService] Error sending reply:', error);
      throw error;
    }
  }

  async stopWatch() {
    try {
      console.log('[GmailService] Stopping email watch');
      await this.gmail.users.stop({
        userId: 'me'
      });
      console.log('[GmailService] Successfully stopped email watch');
    } catch (error) {
      console.error('[GmailService] Error stopping watch:', error);
      // Don't throw error here as we want to continue with setting up new watch
    }
  }

  async watchMailbox(userId: string) {
    try {
      console.log('[GmailService] Setting up email watch for user:', userId);
      
      // Stop any existing watch first
      await this.stopWatch();
      
      // Set up Gmail push notifications
      const response = await this.gmail.users.watch({
        userId: 'me',
        requestBody: {
          labelIds: ['INBOX'],
          topicName: `projects/${process.env.FIREBASE_ADMIN_PROJECT_ID}/topics/gmail-notifications`,
        },
      });

      console.log('[GmailService] Watch response:', response.data);

      // Store the watch expiration
      await adminDb
        .collection('users')
        .doc(userId)
        .update({
          gmailWatchExpiration: new Date(parseInt(response.data.expiration!)),
        });

      return response.data;
    } catch (error) {
      console.error('[GmailService] Error setting up watch:', error);
      throw error;
    }
  }

  async getAttachment(messageId: string, attachment: { attachmentId: string; part: any }) {
    try {
      console.log('[GmailService] Getting attachment:', {
        messageId,
        attachmentId: attachment.attachmentId,
        filename: attachment.part.filename
      });

      // Get the attachment data using the original attachment ID from the part
      const response = await this.gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: attachment.attachmentId
      });

      if (!response.data.data) {
        throw new Error('No attachment data found');
      }

      console.log('[GmailService] Got attachment data:', {
        size: response.data.data.length,
        estimatedSizeBytes: Math.ceil(response.data.data.length * 0.75) // base64 to bytes estimation
      });

      // Convert from base64url to regular base64 if needed
      const base64Data = response.data.data.replace(/-/g, '+').replace(/_/g, '/');
      const buffer = Buffer.from(base64Data, 'base64');

      return {
        data: buffer,
        mimeType: attachment.part.mimeType || 'application/octet-stream',
        filename: attachment.part.filename || 'attachment'
      };
    } catch (error: any) {
      console.error('[GmailService] Error fetching attachment:', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status
      });

      if (error.response?.status === 401) {
        throw new Error('AUTH_REFRESH_NEEDED');
      }

      throw error;
    }
  }

  async getThread(threadId: string) {
    try {
      console.log('[GmailService] Getting thread:', threadId);
      
      const response = await this.gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full',
      });
      
      if (!response.data || !response.data.messages || response.data.messages.length === 0) {
        console.error('[GmailService] Thread not found or empty:', threadId);
        return null;
      }
      
      // Decode each message in the thread
      const messages = response.data.messages.map(message => this.decodeMessage(message));
      
      // Sort messages by date (oldest first)
      messages.sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateA - dateB;
      });
      
      console.log('[GmailService] Successfully retrieved thread:', {
        threadId,
        messageCount: messages.length
      });
      
      return {
        id: threadId,
        messages,
        historyId: response.data.historyId,
      };
    } catch (error) {
      console.error('[GmailService] Error getting thread:', error);
      return this.handleAuthError(error);
    }
  }

  async sendNewEmail(
    userId: string, 
    to: string[], 
    subject: string, 
    content: string, 
    attachments?: { url: string; filename: string; mimeType: string; }[]
  ): Promise<{
    id: string | null;
    threadId: string | null;
    labelIds: string[] | null;
    successfulAttachments: string[];
    failedAttachments: string[];
  }> {
    try {
      console.log('[GmailService] Starting to send new email:', { 
        to, 
        subject,
        contentLength: content?.length,
        hasAttachments: !!attachments?.length 
      });

      // Get attachment data before sending email
      const attachmentBuffers: { [key: string]: Buffer } = {};
      const failedAttachments: string[] = [];
      const successfulAttachments: string[] = [];
      
      if (attachments?.length) {
        for (const attachment of attachments) {
          try {
            console.log('[GmailService] Processing attachment:', attachment.filename, 'URL:', attachment.url);
            
            // Skip attachments with invalid URLs
            if (!attachment.url) {
              console.warn('[GmailService] Skipping attachment with missing URL:', attachment.filename);
              failedAttachments.push(attachment.filename);
              continue;
            }
            
            // Handle local file URLs differently
            let buffer: Buffer;
            if (attachment.url.startsWith('/api/')) {
              // For API endpoints, fetch from the local server
              try {
                // Construct the full URL for the API endpoint
                const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
                const apiUrl = `${baseUrl}${attachment.url}`;
                
                console.log('[GmailService] Fetching from API endpoint:', apiUrl);
                
                const response = await fetch(apiUrl);
                if (!response.ok) {
                  console.error(`[GmailService] Failed to fetch from API endpoint: ${response.statusText}`, {
                    status: response.status,
                    url: apiUrl
                  });
                  failedAttachments.push(attachment.filename);
                  continue;
                }
                
                buffer = Buffer.from(await response.arrayBuffer());
              } catch (apiError) {
                console.error('[GmailService] Error fetching from API endpoint:', apiError);
                failedAttachments.push(attachment.filename);
                continue;
              }
            } else if (attachment.url.startsWith('/')) {
              // For local files, read directly from storage
              try {
                const bucket = adminStorage.bucket();
                const filePath = attachment.url.replace(/^\//, ''); // Remove leading slash
                console.log('[GmailService] Fetching file from storage:', filePath);
                const [fileContent] = await bucket.file(filePath).download();
                buffer = fileContent;
              } catch (storageError) {
                console.error('[GmailService] Error downloading from storage:', storageError);
                failedAttachments.push(attachment.filename);
                continue;
              }
            } else {
              // For remote URLs, fetch the content
              try {
                console.log('[GmailService] Fetching from URL:', attachment.url);
                const response = await fetch(attachment.url);
                if (!response.ok) {
                  console.error(`[GmailService] Failed to fetch attachment: ${response.statusText}`, {
                    status: response.status,
                    url: attachment.url
                  });
                  failedAttachments.push(attachment.filename);
                  continue;
                }
                buffer = Buffer.from(await response.arrayBuffer());
              } catch (fetchError) {
                console.error('[GmailService] Error fetching attachment:', fetchError);
                failedAttachments.push(attachment.filename);
                continue;
              }
            }
            
            // Store buffer for later use
            attachmentBuffers[attachment.filename] = buffer;
            successfulAttachments.push(attachment.filename);
            console.log('[GmailService] Successfully processed attachment:', attachment.filename, 'Size:', buffer.length);
          } catch (attachmentError) {
            console.error('[GmailService] Error processing attachment:', attachment.filename, attachmentError);
            failedAttachments.push(attachment.filename);
          }
        }
      }

      // Log any failed attachments
      if (failedAttachments.length > 0) {
        console.warn('[GmailService] Some attachments could not be processed:', failedAttachments);
      }
      
      // If all attachments failed and we wanted to include attachments, throw an error
      if (attachments?.length && successfulAttachments.length === 0 && failedAttachments.length > 0) {
        throw new Error('All attachments failed to process. Cannot send email with attachments.');
      }

      // Create the email content
      const mixedBoundary = `mixed_${Date.now().toString(16)}`;
      const altBoundary = `alt_${Date.now().toString(16)}`;
      
      // Create email headers
      const emailParts = [
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary=${mixedBoundary}`,
        'From: me',
        `To: ${to.join(', ')}`,
        `Subject: ${subject}`,
        '',
        `--${mixedBoundary}`,
        `Content-Type: multipart/alternative; boundary=${altBoundary}`,
        '',
        `--${altBoundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(content.replace(/<[^>]*>/g, '')).toString('base64').replace(/(.{76})/g, '$1\r\n'),
        '',
        `--${altBoundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(content).toString('base64').replace(/(.{76})/g, '$1\r\n'),
        '',
        `--${altBoundary}--`
      ];

      // Add attachments if any
      if (attachments?.length) {
        for (const attachment of attachments) {
          // Only include attachments that were successfully processed
          if (successfulAttachments.includes(attachment.filename)) {
            const buffer = attachmentBuffers[attachment.filename];
            
            emailParts.push(
              '',
              `--${mixedBoundary}`,
              `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
              'Content-Transfer-Encoding: base64',
              `Content-Disposition: attachment; filename="${attachment.filename}"`,
              '',
              buffer.toString('base64').replace(/(.{76})/g, '$1\r\n')
            );
          }
        }
      }

      // Add final boundary
      emailParts.push('', `--${mixedBoundary}--`, '');

      // Join all parts with proper line endings
      const email = emailParts.join('\r\n');

      // Encode the email in base64 format (NOT base64url)
      const encodedEmail = Buffer.from(email).toString('base64');

      console.log('[GmailService] Sending email:', {
        length: encodedEmail.length,
        hasAttachments: !!attachments?.length,
        firstFewChars: encodedEmail.substring(0, 50) + '...'
      });

      // Send the email
      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedEmail,
        },
      });

      console.log('[GmailService] Email sent successfully:', response.data);

      // Return response with information about which attachments were included
      return {
        id: response.data.id || null,
        threadId: response.data.threadId || null,
        labelIds: response.data.labelIds || null,
        successfulAttachments,
        failedAttachments
      };
    } catch (error) {
      console.error('[GmailService] Error sending email:', error);
      throw error;
    }
  }
} 