export interface Message {
  id: string;
  content: string;
  htmlContent?: string;  
  sender: "me" | "system" | string;
  timestamp: string;
  type?: "silenced";
  mentions?: { id: string; name: string; }[];
  reactions?: Reaction[];
  isEmailThread?: boolean;
  attachments?: {
    url: string;
    filename: string;
    mimeType: string;
  }[];
}

export interface Conversation {
  id: string;
  name?: string;
  threadId?: string;
  recipients: Recipient[];
  messages: Message[];
  lastMessage?: string;
  lastMessageTime: string;
  unreadCount: number;
  pinned?: boolean;
  isTyping?: boolean;
  hideAlerts?: boolean;
  isEmailThread?: boolean;
}

export interface Recipient {
  id: string;
  name: string;
  avatar?: string;
  bio?: string;
  title?: string;
}

export type ReactionType = 'heart' | 'like' | 'dislike' | 'laugh' | 'emphasize' | 'question';

export interface Reaction {
  type: ReactionType;
  sender: string;
  timestamp: string;
}

export interface Email {
  id: string;
  messageId: string;
  threadId: string;
  from: string;
  to: string[];
  subject?: string;
  body?: string;
  htmlBody?: string;
  receivedAt: Date;
  isRead: boolean;
  labels: string[];
  userId: string;
  attachments?: {
    filename: string;
    mimeType: string;
    url: string;
  }[];
}

export interface EmailThread {
  id: string;
  messages: Email[];
  lastMessage: Email;
  participants: string[];
  subject?: string;
  unreadCount: number;
}

export interface Attachment {
  url: string;
  filename: string;
  mimeType: string;
  uploading?: boolean;
  attachmentId?: string;
}