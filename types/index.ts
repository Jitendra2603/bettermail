export interface Message {
  id: string;
  content: string;
  htmlContent?: string;  
  sender: "me" | "system" | "ai" | string;
  timestamp: string;
  type?: "silenced" | "suggestion";
  mentions?: { id: string; name: string; }[];
  reactions?: Reaction[];
  isEmailThread?: boolean;
  attachments?: {
    url: string;
    filename: string;
    mimeType: string;
    content?: string;
    uploading?: boolean;
  }[];
  suggestion?: {
    id: string;
    status: "pending" | "approved" | "rejected";
    enhancedAt?: string;
    relevantDocs?: {
      title: string;
      similarity: number;
    }[];
  };
}

export interface Conversation {
  id: string;
  name?: string;
  recipients: Recipient[];
  messages: Message[];
  lastMessage?: string;
  unreadCount?: number;
  hideAlerts?: boolean;
  pinned?: boolean;
  createdAt: string;
  updatedAt: string;
  isEmailThread?: boolean;
  threadId?: string | null;
}

export interface Recipient {
  id: string;
  name: string;
  avatar?: string;
  bio?: string;
  title?: string;
}

export type ReactionType = "heart" | "like" | "dislike" | "laugh" | "emphasize" | "question";

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

export interface ParsedDocument {
  id: string;
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
  filename: string;
  url?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  sender: string;
}

export interface UserContext {
  id: string;
  userId: string;
  documents: ParsedDocument[];
  createdAt: string;
  updatedAt: string;
}

export interface Usage {
  totalCost: number;
  totalTokens: number;
  lastUsed: string;
}

export interface ErrorLog {
  userId: string;
  service: string;
  error: string;
  timestamp: string;
}

export interface Cache {
  response: any;
  timestamp: string;
  userId: string;
}

export interface IconProps {
  size?: number;
  className?: string;
}

export interface Icons {
  file: (props: IconProps) => JSX.Element;
  pdf: (props: IconProps) => JSX.Element;
  document: (props: IconProps) => JSX.Element;
  imageOff: (props: IconProps) => JSX.Element;
  loader: (props: IconProps) => JSX.Element;
  silencedMoon: (props: IconProps) => JSX.Element;
  [key: string]: (props: IconProps) => JSX.Element;
}