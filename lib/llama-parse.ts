import { adminDb, adminStorage } from './firebase-admin';
import { OpenAIService } from './openai';

interface ParsedDocument {
  text: string;
  metadata: {
    title: string;
    author?: string;
    createdAt?: string;
    pageCount?: number;
    wordCount?: number;
    summary?: string;
  };
  embedding?: number[];
}

export class LlamaParseService {
  private userId: string;
  private apiKey: string;
  private openAIService?: OpenAIService;

  constructor(apiKey: string, userId: string, openAIService?: OpenAIService) {
    this.userId = userId;
    this.apiKey = apiKey;
    this.openAIService = openAIService;
  }

  private async uploadToFirebase(parsedDoc: ParsedDocument, filename: string) {
    try {
      // Store the parsed content and metadata
      const docRef = adminDb
        .collection('users')
        .doc(this.userId)
        .collection('documents')
        .doc();

      await docRef.set({
        ...parsedDoc,
        filename,
        userId: this.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return docRef.id;
    } catch (error) {
      console.error('Error uploading to Firebase:', error);
      throw new Error('Failed to store parsed document');
    }
  }

  private async generateSummary(text: string): Promise<string> {
    try {
      const response = await fetch('https://api.cloud.llamaindex.ai/api/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          text,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.summary;
    } catch (error) {
      console.error('Error generating summary:', error);
      throw new Error('Failed to generate document summary');
    }
  }

  async parseDocument(fileUrl: string, filename: string): Promise<string> {
    try {
      // Check if document was already parsed
      const existingDocs = await adminDb
        .collection('users')
        .doc(this.userId)
        .collection('documents')
        .where('filename', '==', filename)
        .limit(1)
        .get();

      if (!existingDocs.empty) {
        return existingDocs.docs[0].id;
      }

      // Download file from Firebase Storage
      const bucket = adminStorage.bucket();
      const file = bucket.file(fileUrl);
      const [metadata] = await file.getMetadata();
      
      // Check file size (metadata.size is in bytes)
      const fileSizeInMB = Number(metadata.size || 0) / (1024 * 1024);
      if (fileSizeInMB > 50) {
        throw new Error('File size exceeds 50MB limit');
      }

      // Download the file content
      const [fileContent] = await file.download();

      // Create form data with proper headers
      const formData = new FormData();
      const blob = new Blob([fileContent], { type: metadata.contentType || 'application/pdf' });
      formData.append('file', blob, filename);

      // Parse document using LlamaParse
      const response = await fetch('https://api.cloud.llamaindex.ai/api/parsing/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json',
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('LlamaParse API error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        throw new Error(`LlamaParse API error: ${response.status} ${response.statusText}`);
      }

      const jobData = await response.json();
      const jobId = jobData.job_id;

      // Poll for job completion with exponential backoff
      let delay = 1000; // Start with 1 second
      const maxDelay = 5000; // Max 5 seconds
      const maxAttempts = 30;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const statusResponse = await fetch(`https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}`, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Accept': 'application/json',
          }
        });

        if (!statusResponse.ok) {
          console.error('Job status check failed:', {
            attempt,
            status: statusResponse.status,
            statusText: statusResponse.statusText
          });
          throw new Error(`Failed to check job status: ${statusResponse.status}`);
        }

        const status = await statusResponse.json();
        
        if (status.status === 'completed') {
          // Get the results in markdown format
          const resultResponse = await fetch(
            `https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}/result/markdown`,
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

          // Generate summary using LlamaParse's built-in summarization
          const summaryResponse = await fetch('https://api.cloud.llamaindex.ai/api/summarize', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify({
              text: parsedData.text,
              max_tokens: 500,
            }),
          });

          if (!summaryResponse.ok) {
            console.error('Summary generation failed:', await summaryResponse.text());
            throw new Error(`Failed to generate summary: ${summaryResponse.status}`);
          }

          const summaryData = await summaryResponse.json();

          // Generate embedding if OpenAI service is available
          let embedding;
          if (this.openAIService) {
            try {
              embedding = await this.openAIService.generateEmbedding(
                `${parsedData.metadata?.title || filename}\n${summaryData.summary}\n${parsedData.text.substring(0, 8000)}`
              );
            } catch (error) {
              console.error('Error generating embedding:', error);
            }
          }

          const parsedDoc: ParsedDocument = {
            text: parsedData.text,
            metadata: {
              title: parsedData.metadata?.title || filename,
              author: parsedData.metadata?.author,
              createdAt: parsedData.metadata?.createdAt,
              pageCount: parsedData.metadata?.pageCount || 1,
              wordCount: parsedData.text.split(/\s+/).length,
              summary: summaryData.summary,
            },
            embedding,
          };

          // Store in Firebase
          const docId = await this.uploadToFirebase(parsedDoc, filename);

          // Log successful parsing
          await adminDb.collection('logs').add({
            userId: this.userId,
            action: 'parse_document',
            filename,
            timestamp: new Date(),
            success: true,
          });

          return docId;
        } else if (status.status === 'failed') {
          throw new Error('Parsing job failed');
        }

        // Exponential backoff with max delay
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 1.5, maxDelay);
      }

      throw new Error('Parsing timed out');

    } catch (error: any) {
      console.error('Error parsing document:', error);

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