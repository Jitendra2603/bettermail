import { adminDb, adminStorage } from './firebase-admin';
import { OpenAIService } from './openai';
import { ParsedDocument } from '@/types';
import FormData from 'form-data';
import fetch from 'node-fetch';

export class LlamaParseService {
  private userId: string;
  private apiKey: string;
  private openAIService?: OpenAIService;

  constructor(apiKey: string, userId: string, openAIService?: OpenAIService) {
    this.userId = userId;
    this.apiKey = apiKey;
    this.openAIService = openAIService;
  }

  private cleanUndefinedValues(obj: any): any {
    if (obj === null || obj === undefined) {
      return null;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.cleanUndefinedValues(item));
    }
    
    if (typeof obj === 'object') {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const cleanedValue = this.cleanUndefinedValues(value);
        if (cleanedValue !== undefined && cleanedValue !== null) {
          cleaned[key] = cleanedValue;
        }
      }
      return cleaned;
    }
    
    return obj;
  }

  private async uploadToFirebase(parsedDoc: Omit<ParsedDocument, 'id'>, filename: string) {
    try {
      // Store the parsed content and metadata
      const docRef = adminDb
        .collection('users')
        .doc(this.userId)
        .collection('documents')
        .doc();

      // Clean undefined values before storing
      const cleanedDoc = this.cleanUndefinedValues({
        ...parsedDoc,
        id: docRef.id,
      });

      console.log('[LlamaParse] Storing cleaned document:', cleanedDoc);

      await docRef.set(cleanedDoc);

      return docRef.id;
    } catch (error) {
      console.error('[LlamaParse] Error uploading to Firebase:', error);
      throw new Error('Failed to store parsed document');
    }
  }

  async parseDocument(
    fileUrl: string, 
    filename: string,
    sender: string = 'You'
  ): Promise<string> {
    try {
      // Check if document was already parsed
      const existingDocs = await adminDb
        .collection('users')
        .doc(this.userId)
        .collection('documents')
        .where('filename', '==', filename)
        .where('sender', '==', sender)
        .limit(1)
        .get();

      if (!existingDocs.empty) {
        console.log('[LlamaParse] Document already exists:', {
          id: existingDocs.docs[0].id,
          filename,
          sender
        });
        return existingDocs.docs[0].id;
      }

      // Download file from Firebase Storage
      const bucket = adminStorage.bucket();
      const file = bucket.file(fileUrl);
      const [metadata] = await file.getMetadata();
      
      console.log('[LlamaParse] Processing file:', {
        filename,
        size: metadata.size,
        contentType: metadata.contentType
      });

      // Get the public URL for the file
      const [publicUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      // Check file size (metadata.size is in bytes)
      const fileSizeInMB = Number(metadata.size || 0) / (1024 * 1024);
      if (fileSizeInMB > 50) {
        throw new Error('File size exceeds 50MB limit');
      }

      // Download the file content
      const [fileContent] = await file.download();

      // Create form data with proper headers
      const formData = new FormData();
      formData.append('file', fileContent, {
        filename,
        contentType: metadata.contentType || 'application/pdf'
      });

      console.log('[LlamaParse] Uploading file to LlamaParse API');

      // Parse document using LlamaParse REST API
      const response = await fetch('https://api.cloud.llamaindex.ai/api/parsing/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json',
          ...formData.getHeaders()
        },
        body: formData
      });

      const responseData = await response.json();
      console.log('[LlamaParse] Upload response:', {
        status: response.status,
        statusText: response.statusText,
        data: responseData
      });

      if (!response.ok) {
        throw new Error(`LlamaParse API error: ${response.status} ${response.statusText}`);
      }

      const jobId = responseData.id;
      console.log('[LlamaParse] Job created:', { jobId });

      // Poll for job completion with exponential backoff
      let delay = 1000; // Start with 1 second
      const maxDelay = 5000; // Max 5 seconds
      const maxAttempts = 30;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        console.log('[LlamaParse] Checking job status:', { attempt, jobId });

        const statusResponse = await fetch(`https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}`, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Accept': 'application/json',
          }
        });

        const statusData = await statusResponse.json().catch(() => null);
        console.log('[LlamaParse] Job status response:', {
          attempt,
          status: statusResponse.status,
          statusText: statusResponse.statusText,
          data: statusData
        });

        if (!statusResponse.ok) {
          throw new Error(`Failed to check job status: ${statusResponse.status}`);
        }

        if (statusData.status === 'SUCCESS') {
          console.log('[LlamaParse] Job completed successfully, fetching results');

          // Get the results in markdown format
          const resultResponse = await fetch(
            `https://api.cloud.llamaindex.ai/api/v1/parsing/job/${jobId}/result/markdown`,
            {
              headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Accept': 'application/json',
              }
            }
          );

          if (!resultResponse.ok) {
            throw new Error(`Failed to get results: ${resultResponse.status}`);
          }

          const parsedData = await resultResponse.json();
          console.log('[LlamaParse] Parsed content:', {
            metadata: parsedData.job_metadata,
            textPreview: parsedData.markdown?.substring(0, 500) + '...',
            fullLength: parsedData.markdown?.length
          });

          // Try to generate summary, but don't fail if it doesn't work
          let summary = '';
          let oneLineSummary = '';
          let conciseSummary = '';
          
          // Define metadata interface
          interface DocumentMetadata {
            title: string;
            createdAt: string;
            pageCount: number;
            wordCount: number;
            author?: string;
            summary?: string;
            oneLineSummary?: string;
            conciseSummary?: string;
          }

          // Create base metadata without optional fields
          const metadata: DocumentMetadata = {
            title: parsedData.job_metadata?.title || filename,
            createdAt: new Date().toISOString(),
            pageCount: 1,
            wordCount: (parsedData.markdown?.split(/\s+/).length || 0)
          };
          
          try {
            console.log('[LlamaParse] Generating summary');
            const summaryResponse = await fetch('https://api.cloud.llamaindex.ai/api/v1/summarize', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
              body: JSON.stringify({
                text: parsedData.markdown,
                max_tokens: 500,
              }),
            });

            if (summaryResponse.ok) {
              const summaryData = await summaryResponse.json();
              summary = summaryData.summary;
              console.log('[LlamaParse] Summary generated:', {
                summary: summaryData.summary,
                length: summaryData.summary?.length
              });
              
              // Generate one-line summary from the full summary
              try {
                // Extract first sentence (up to 100 chars)
                const firstSentence = summary.split(/[.!?]/).filter(s => s.trim().length > 0)[0] || '';
                oneLineSummary = firstSentence.trim();
                
                // Truncate if too long and add ellipsis
                if (oneLineSummary.length > 100) {
                  oneLineSummary = oneLineSummary.substring(0, 97) + '...';
                }
                
                console.log('[LlamaParse] One-line summary generated from summary:', oneLineSummary);
              } catch (error) {
                console.error('[LlamaParse] Error generating one-line summary from summary:', error);
              }
              
              // Generate concise 2-3 line summary using OpenAI if available
              if (this.openAIService) {
                try {
                  console.log('[LlamaParse] Generating concise 2-3 line summary using OpenAI');
                  const title = metadata.title || '';
                  conciseSummary = await this.openAIService.generateConciseSummary(
                    parsedData.markdown || '',
                    title
                  );
                  console.log('[LlamaParse] Concise summary generated:', conciseSummary);
                } catch (error) {
                  console.error('[LlamaParse] Error generating concise summary with OpenAI:', error);
                }
              }
            } else {
              console.log('[LlamaParse] Summary generation skipped:', await summaryResponse.text());
              
              // Generate one-line summary directly from document content
              try {
                // Use the first few words of the document as a fallback
                const docContent = parsedData.markdown || '';
                const words = docContent.split(/\s+/).filter((w: string) => w.trim().length > 0);
                const firstFewWords = words.slice(0, 10).join(' ');
                
                oneLineSummary = firstFewWords;
                if (words.length > 10) {
                  oneLineSummary += '...';
                }
                
                console.log('[LlamaParse] One-line summary generated from content:', oneLineSummary);
                
                // Try to generate concise summary with OpenAI even if LlamaIndex summary failed
                if (this.openAIService) {
                  try {
                    console.log('[LlamaParse] Generating concise 2-3 line summary using OpenAI (fallback)');
                    const title = metadata.title || '';
                    conciseSummary = await this.openAIService.generateConciseSummary(
                      docContent,
                      title
                    );
                    console.log('[LlamaParse] Concise summary generated (fallback):', conciseSummary);
                  } catch (error) {
                    console.error('[LlamaParse] Error generating concise summary with OpenAI (fallback):', error);
                  }
                }
              } catch (error) {
                console.error('[LlamaParse] Error generating one-line summary from content:', error);
              }
            }
          } catch (error) {
            console.error('[LlamaParse] Error generating summary:', error);
            
            // Generate one-line summary directly from document content as fallback
            try {
              // Use the first few words of the document as a fallback
              const docContent = parsedData.markdown || '';
              const words = docContent.split(/\s+/).filter((w: string) => w.trim().length > 0);
              const firstFewWords = words.slice(0, 10).join(' ');
              
              oneLineSummary = firstFewWords;
              if (words.length > 10) {
                oneLineSummary += '...';
              }
              
              console.log('[LlamaParse] Fallback one-line summary generated:', oneLineSummary);
              
              // Try to generate concise summary with OpenAI as a last resort
              if (this.openAIService) {
                try {
                  console.log('[LlamaParse] Generating concise 2-3 line summary using OpenAI (last resort)');
                  const title = metadata.title || '';
                  conciseSummary = await this.openAIService.generateConciseSummary(
                    docContent,
                    title
                  );
                  console.log('[LlamaParse] Concise summary generated (last resort):', conciseSummary);
                } catch (error) {
                  console.error('[LlamaParse] Error generating concise summary with OpenAI (last resort):', error);
                }
              }
            } catch (fallbackError) {
              console.error('[LlamaParse] Error generating fallback one-line summary:', fallbackError);
            }
          }

          // Generate embedding if OpenAI service is available
          let embedding;
          if (this.openAIService) {
            try {
              console.log('[LlamaParse] Generating embedding');
              embedding = await this.openAIService.generateEmbedding(
                `${parsedData.job_metadata?.title || filename}\n${summary}\n${parsedData.markdown?.substring(0, 8000)}`
              );
              console.log('[LlamaParse] Embedding generated');
            } catch (error) {
              console.error('[LlamaParse] Error generating embedding:', error);
            }
          }

          // Add optional metadata fields only if they exist
          if (parsedData.job_metadata?.author) {
            metadata.author = parsedData.job_metadata.author;
          }
          if (parsedData.job_metadata?.createdAt) {
            metadata.createdAt = new Date(parsedData.job_metadata.createdAt).toISOString();
          }
          if (summary) {
            metadata.summary = summary;
          }
          if (oneLineSummary) {
            metadata.oneLineSummary = oneLineSummary;
          }
          if (conciseSummary) {
            metadata.conciseSummary = conciseSummary;
          }

          // Create base document without optional fields
          interface ParsedDocumentData {
            text: string;
            metadata: DocumentMetadata;
            filename: string;
            userId: string;
            createdAt: string;
            updatedAt: string;
            embedding?: number[];
            url: string;
            sender: string;
          }

          const parsedDoc: ParsedDocumentData = {
            text: parsedData.markdown || '',
            metadata,
            filename,
            userId: this.userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            url: publicUrl,
            sender,
          };

          // Add embedding only if it exists
          if (embedding) {
            parsedDoc.embedding = embedding;
          }

          // Store in Firebase
          const docId = await this.uploadToFirebase(parsedDoc, filename);
          console.log('[LlamaParse] Document stored in Firebase:', {
            docId,
            metadata: parsedDoc.metadata,
            url: publicUrl,
            sender
          });

          // Log successful parsing
          await adminDb.collection('logs').add({
            userId: this.userId,
            action: 'parse_document',
            filename,
            timestamp: new Date(),
            success: true,
          });

          return docId;
        } else if (statusData.status === 'FAILED') {
          throw new Error('Parsing job failed');
        }

        // Exponential backoff with max delay
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 1.5, maxDelay);
      }

      throw new Error('Parsing timed out');

    } catch (error: any) {
      console.error('[LlamaParse] Error parsing document:', {
        error: error.message,
        filename,
        stack: error.stack
      });

      // Log error
      await adminDb.collection('errors').add({
        userId: this.userId,
        service: 'llama_parse',
        filename,
        error: error.message,
        timestamp: new Date(),
      });

      throw new Error('Failed to parse document. Please try again later.');
    }
  }

  async getDocumentContent(docId: string): Promise<ParsedDocument> {
    try {
      const docRef = await adminDb
        .collection('users')
        .doc(this.userId)
        .collection('documents')
        .doc(docId)
        .get();

      if (!docRef.exists) {
        throw new Error('Document not found');
      }

      return docRef.data() as ParsedDocument;
    } catch (error) {
      console.error('Error retrieving document:', error);
      throw new Error('Failed to retrieve document content');
    }
  }
} 