export interface Message {
  id: string;
  content: string;
  htmlContent?: string;
  sender: 'me' | 'ai' | 'system';
  type?: 'message' | 'suggestion' | 'error';
  timestamp: string;
  attachments?: Attachment[];
  suggestion?: {
    id: string;
    status: 'pending' | 'approved' | 'rejected';
    relevantDocs?: {
      title: string;
      similarity: number;
    }[];
  };
}

export interface Attachment {
  filename: string;
  mimeType: string;
  url: string;
  uploading?: boolean;
} 