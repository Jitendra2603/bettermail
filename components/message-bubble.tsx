import { cn } from "@/lib/utils";
import { Message, ReactionType, Reaction, Attachment } from "../types";
import { Conversation } from "../types";
import { useCallback, useState, useRef, useEffect, Fragment } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTheme } from "next-themes";
import Image from "next/image";
import { soundEffects } from "@/lib/sound-effects";
import { Icons } from "@/components/icons";
import DOMPurify from 'isomorphic-dompurify';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import { Textarea } from "@/components/ui/textarea";
import "@/styles/ai-message.css";
import { FeedbackEditor } from "./feedback-editor";
import { submitFeedback, logFeedbackLocally } from "@/lib/feedback-service";
import { marked } from 'marked';

// Add Document interface at the top
interface Document {
  id: string;
  filename: string;
  mimeType?: string;
  url?: string;
  text: string;
  metadata?: {
    title?: string;
    author?: string;
    createdAt?: string;
    pageCount?: number;
    wordCount?: number;
    summary?: string;
  };
  hasEmbedding?: boolean;
  hasAnalysis?: boolean;
  createdAt: Date | string;
}

// Props for the MessageBubble component
interface MessageBubbleProps {
  message: Message;
  isLastUserMessage?: boolean;
  conversation?: Conversation;
  isTyping?: boolean;
  onReaction?: (messageId: string, reaction: Reaction) => void;
  onOpenChange?: (isOpen: boolean) => void;
  onReactionComplete?: () => void;
  justSent?: boolean;
  isMobileView?: boolean;
}

const typingAnimation = `
@keyframes blink {
  0% { opacity: 0.3; }
  20% { opacity: 1; }
  100% { opacity: 0.3; }
}
`;

// Add EditModal component
function EditModal({ 
  isOpen, 
  onClose, 
  content, 
  onSave 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  content: string;
  onSave: (content: string) => void;
}) {
  const [editedContent, setEditedContent] = useState(content);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await onSave(editedContent);
      onClose();
    } catch (error) {
      console.error('Error saving edit:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] h-[80vh]">
        <DialogHeader>
          <DialogTitle>Edit AI Response</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 h-full">
          <div className="flex-1 min-h-0">
            <Textarea
              value={editedContent}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditedContent(e.target.value)}
              className="h-full resize-none font-mono"
              placeholder="Edit the response..."
            />
          </div>
          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              Supports Markdown formatting
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Update MessageContent component to use EditModal
const MessageContent = ({ message, conversation, isEditing, onEdit, onSaveEdit, onRemoveAttachment }: { message: Message, conversation?: Conversation, isEditing: boolean, onEdit: () => void, onSaveEdit: (newContent: string) => void, onRemoveAttachment: (index: number) => void }) => {
  const [imageLoadErrors, setImageLoadErrors] = useState<{[key: string]: boolean}>({});
  const [editedContent, setEditedContent] = useState(message.content);
  const isAiSuggestion = message.type === "suggestion";

  // Debug logging only in development mode
  if (process.env.NODE_ENV === 'development') {
    console.log('MessageContent rendering message:', {
      id: message.id,
      type: message.type,
      content: message.content ? (message.content.substring(0, 50) + (message.content.length > 50 ? '...' : '')) : '[No content]',
      htmlContent: message.htmlContent ? (message.htmlContent.substring(0, 50) + (message.htmlContent.length > 50 ? '...' : '')) : '[No HTML]',
      sender: message.sender,
      hasAttachments: !!message.attachments?.length
    });
  }

  const handleSaveEdit = async (newContent: string) => {
    try {
      // TODO: Update message content through parent component
      onSaveEdit(newContent);
    } catch (error) {
      console.error('Error saving edit:', error);
    }
  };

  // Handle AI suggestions
  if (message.type === 'suggestion') {
    return (
      <>
        <div className="flex flex-col gap-2">
          {/* AI Badge */}
          <div className="flex items-center gap-2 mb-2">
            <div className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent hover:bg-secondary/80 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
              <Icons.sparkles className="w-3 h-3 mr-1" />
              AI Suggestion
            </div>
            {message.suggestion?.status && (
              <Badge 
                variant="secondary" 
                className={cn(
                  "text-xs",
                  message.suggestion.status === "approved" && "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300",
                  message.suggestion.status === "rejected" && "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300",
                  message.suggestion.status === "pending" && "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300"
                )}
              >
                {message.suggestion.status.charAt(0).toUpperCase() + message.suggestion.status.slice(1)}
              </Badge>
            )}
          </div>

          {/* Message Content */}
          <div className="text-[14px] prose dark:prose-invert max-w-none break-words overflow-wrap-anywhere word-break-break-word [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_tr]:border [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_blockquote]:border-l-4 [&_blockquote]:border-muted [&_blockquote]:pl-4 [&_blockquote]:italic [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-4">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex, rehypeRaw]}
            >
              {message.content}
            </ReactMarkdown>
          </div>

          {/* Attachments Grid */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              {message.attachments.map((attachment, index) => {
                if (attachment.mimeType?.startsWith('image/')) {
                  if (imageLoadErrors[attachment.url]) {
                    return (
                      <div key={index} className="flex items-center gap-2 p-2 rounded-lg bg-background/10">
                        <Icons.imageOff size={24} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {attachment.filename}
                          </div>
                          <div className="text-xs opacity-70">Failed to load image</div>
                        </div>
                        <button
                          onClick={() => {
                            onRemoveAttachment(index);
                          }}
                          className="p-1 hover:bg-background/20 rounded-full"
                        >
                          <Icons.close className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div key={index} className="relative w-full max-w-[300px] aspect-square group">
                      {attachment.url.startsWith('cid:') ? (
                        // Fallback for cid: URLs which aren't supported in browsers
                        <div className="absolute inset-0 rounded-lg overflow-hidden bg-background/10 flex flex-col items-center justify-center p-4">
                          <Icons.imageOff size={36} className="text-muted-foreground mb-2" />
                          <div className="text-sm text-center text-muted-foreground">
                            <p>Email attachment</p>
                            <p className="text-xs mt-1">{attachment.filename}</p>
                          </div>
                        </div>
                      ) : (
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block absolute inset-0 rounded-lg overflow-hidden bg-background/10 hover:bg-background/20 transition-colors"
                        >
                          <Image
                            src={attachment.url}
                            alt={attachment.filename}
                            fill
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                            className="object-cover"
                            onError={() => {
                              setImageLoadErrors(prev => ({
                                ...prev,
                                [attachment.url]: true
                              }));
                            }}
                            unoptimized={attachment.url.startsWith('https://storage.googleapis.com/') || attachment.url.startsWith('/api/emails/')}
                          />
                        </a>
                      )}
                      <button
                        onClick={() => {
                          onRemoveAttachment(index);
                        }}
                        className="absolute top-1 right-1 p-1 bg-background/50 hover:bg-background/70 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Icons.close className="h-4 w-4" />
                      </button>
                    </div>
                  );
                }

                if (attachment.mimeType === "application/pdf") {
                  return (
                    <div key={index} className="group relative">
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 rounded-lg bg-background/10 hover:bg-background/20 transition-colors"
                      >
                        <Icons.pdf size={24} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {attachment.filename}
                          </div>
                          <div className="text-xs opacity-70">PDF Document</div>
                        </div>
                      </a>
                      <button
                        onClick={() => {
                          onRemoveAttachment(index);
                        }}
                        className="absolute top-1 right-1 p-1 bg-background/50 hover:bg-background/70 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Icons.close className="h-4 w-4" />
                      </button>
                    </div>
                  );
                }

                return (
                  <div key={index} className="group relative">
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 rounded-lg bg-background/10 hover:bg-background/20 transition-colors"
                    >
                      <Icons.file size={24} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {attachment.filename}
                        </div>
                        <div className="text-xs opacity-70">
                          {attachment.mimeType.split("/")[1].toUpperCase()}
                        </div>
                      </div>
                    </a>
                    <button
                      onClick={() => {
                        onRemoveAttachment(index);
                      }}
                      className="absolute top-1 right-1 p-1 bg-background/50 hover:bg-background/70 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Icons.close className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Show relevant documents if available */}
          {message.suggestion?.relevantDocs && message.suggestion.relevantDocs.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="text-xs text-muted-foreground mb-1">
                Referenced documents:
              </div>
              <div className="flex flex-wrap gap-2">
                {message.suggestion.relevantDocs.map((doc, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900 text-xs"
                  >
                    <Icons.file className="w-3 h-3" />
                    <span className="truncate max-w-[150px]">{doc.title}</span>
                    <span className="text-muted-foreground">
                      {Math.round(doc.similarity * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Edit Button */}
          <div className="flex items-center gap-2 mt-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={onEdit}
            >
              <Icons.edit className="h-3 w-3 mr-1" />
              Edit Response
            </Button>
          </div>
        </div>
      </>
    );
  }

  // Handle regular messages (including those with undefined type)
  return (
    <>
      <div className="flex flex-col gap-2">
        {/* AI Suggestion Badge */}
        {isAiSuggestion && (
          <div className="flex items-center gap-2 mb-2">
            <div className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent hover:bg-secondary/80 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
              <Icons.sparkles className="w-3 h-3 mr-1" />
              AI Suggestion
            </div>
          </div>
        )}
        
        {/* Regular Message Content */}
        {message.htmlContent ? (
          <div 
            className="text-[14px] prose dark:prose-invert max-w-none break-words overflow-wrap-anywhere word-break-break-word [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_tr]:border [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_blockquote]:border-l-4 [&_blockquote]:border-muted [&_blockquote]:pl-4 [&_blockquote]:italic [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-4"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(message.htmlContent) }}
          />
        ) : message.content ? (
          message.content.startsWith('<') && (message.content.includes('</') || message.content.includes('/>')) ? (
            // If content contains HTML tags, sanitize and render as HTML
            <div 
              className="text-[14px] prose dark:prose-invert max-w-none break-words overflow-wrap-anywhere word-break-break-word [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_tr]:border [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_blockquote]:border-l-4 [&_blockquote]:border-muted [&_blockquote]:pl-4 [&_blockquote]:italic [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-4"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(message.content) }}
            />
          ) : (
            // Regular plain text content - preserve whitespace and line breaks
            <div className="text-[14px] whitespace-pre-wrap break-words overflow-wrap-anywhere word-break-break-word">
              {message.content}
            </div>
          )
        ) : (
          <div className="text-[14px] text-muted-foreground italic">[No content]</div>
        )}

        {/* Attachments Grid */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            {message.attachments.map((attachment, index) => {
              // Show loading state if attachment is uploading
              if (attachment.uploading) {
                return (
                  <div key={index} className="flex items-center gap-2 p-2 rounded-lg bg-background/10">
                    <Icons.loader className="animate-spin" size={24} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {attachment.filename}
                      </div>
                      <div className="text-xs opacity-70">Uploading...</div>
                    </div>
                  </div>
                );
              }

              // Show image preview
              if (attachment.mimeType?.startsWith('image/')) {
                if (imageLoadErrors[attachment.url]) {
                  return (
                    <div key={index} className="flex items-center gap-2 p-2 rounded-lg bg-background/10">
                      <Icons.imageOff size={24} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {attachment.filename}
                        </div>
                        <div className="text-xs opacity-70">Failed to load image</div>
                      </div>
                      <button
                        onClick={() => {
                          onRemoveAttachment(index);
                        }}
                        className="p-1 hover:bg-background/20 rounded-full"
                      >
                        <Icons.close className="h-4 w-4" />
                      </button>
                    </div>
                  );
                }

                return (
                  <div key={index} className="relative w-full max-w-[300px] aspect-square group">
                    {attachment.url.startsWith('cid:') ? (
                      // Fallback for cid: URLs which aren't supported in browsers
                      <div className="absolute inset-0 rounded-lg overflow-hidden bg-background/10 flex flex-col items-center justify-center p-4">
                        <Icons.imageOff size={36} className="text-muted-foreground mb-2" />
                        <div className="text-sm text-center text-muted-foreground">
                          <p>Email attachment</p>
                          <p className="text-xs mt-1">{attachment.filename}</p>
                        </div>
                      </div>
                    ) : (
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block absolute inset-0 rounded-lg overflow-hidden bg-background/10 hover:bg-background/20 transition-colors"
                      >
                        <Image
                          src={attachment.url}
                          alt={attachment.filename}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          className="object-cover"
                          onError={() => {
                            setImageLoadErrors(prev => ({
                              ...prev,
                              [attachment.url]: true
                            }));
                          }}
                          unoptimized={attachment.url.startsWith('https://storage.googleapis.com/') || attachment.url.startsWith('/api/emails/')}
                        />
                      </a>
                    )}
                    <button
                      onClick={() => {
                        onRemoveAttachment(index);
                      }}
                      className="absolute top-1 right-1 p-1 bg-background/50 hover:bg-background/70 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Icons.close className="h-4 w-4" />
                    </button>
                  </div>
                );
              }

              // Show PDF preview
              if (attachment.mimeType === "application/pdf") {
                return (
                  <a
                    key={index}
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2 rounded-lg bg-background/10 hover:bg-background/20 transition-colors"
                  >
                    <Icons.pdf size={24} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {attachment.filename}
                      </div>
                      <div className="text-xs opacity-70">PDF Document</div>
                    </div>
                  </a>
                );
              }

              // Show other file types
              return (
                <a
                  key={index}
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-2 rounded-lg bg-background/10 hover:bg-background/20 transition-colors"
                >
                  <Icons.file size={24} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {attachment.filename}
                    </div>
                    <div className="text-xs opacity-70">
                      {attachment.mimeType.split("/")[1].toUpperCase()}
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

function formatFileSize(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function MessageBubble({
  message,
  isLastUserMessage,
  conversation,
  isTyping,
  onReaction,
  onOpenChange,
  onReactionComplete,
  justSent = false,
  isMobileView = false,
}: MessageBubbleProps) {
  // Debug logging only in development mode
  if (process.env.NODE_ENV === 'development') {
    console.log('MessageBubble rendering message:', {
      id: message.id,
      type: message.type,
      content: message.content?.substring(0, 30) + (message.content?.length > 30 ? '...' : ''),
      sender: message.sender,
      hasAttachments: !!message.attachments?.length
    });
  }

  // Determine message sender type and display name
  const isMe = message.sender === "me" || (message.type === "suggestion" && message.sender === "ai");
  const isSystemMessage = message.sender === "system";
  const isAiSuggestion = message.type === "suggestion";
  const recipientName = !isMe && !isSystemMessage ? message.sender : null;

  // Map of reaction types to their SVG paths for the menu
  const { theme, systemTheme } = useTheme();
  const effectiveTheme = theme === "system" ? systemTheme : theme;

  const menuReactionIcons = {
    heart: "reactions/heart-gray.svg",
    like: "reactions/like-gray.svg",
    dislike: "reactions/dislike-gray.svg",
    laugh: "reactions/laugh-gray.svg",
    emphasize: "reactions/emphasize-gray.svg",
    question: "reactions/question-gray.svg",
  };

  // State to control the Popover open state and animation
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isFeedbackEditorOpen, setIsFeedbackEditorOpen] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);
  const [editedAttachments, setEditedAttachments] = useState(message.attachments || []);
  const openTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  // Handler for menu state changes
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        // Menu is closing
        setIsOpen(false);
        onOpenChange?.(false);
      } else {
        // Only open if we're not in a closing state
        if (openTimeoutRef.current) {
          clearTimeout(openTimeoutRef.current);
        }
        openTimeoutRef.current = setTimeout(() => {
          setIsOpen(true);
          onOpenChange?.(true);
        }, 10);
      }
    },
    [onOpenChange]
  );

  // Handler for saving edited content
  const handleSaveEdit = async (newContent: string) => {
    try {
      // Update local state
      setEditedContent(newContent);
      setIsEditing(false);

      // If this is a suggestion, we don't send it yet - wait for thumbs up
      if (message.type === 'suggestion') {
        message.content = newContent;
        toast({
          description: "Changes saved. React with thumbs up to send.",
        });
      }
    } catch (error) {
      console.error('Error saving edit:', error);
      toast({
        title: "Error",
        description: "Failed to save changes",
        variant: "destructive",
      });
    }
  };

  // Handler for removing attachments
  const handleRemoveAttachment = (index: number) => {
    if (message.attachments) {
      const newAttachments = [...editedAttachments];
      newAttachments.splice(index, 1);
      setEditedAttachments(newAttachments);
      
      // Update the message's attachments
      message.attachments = newAttachments;
      
      toast({
        description: "Attachment removed",
      });
    }
  };

  // Handler for when a reaction is clicked
  const handleReaction = useCallback(
    (type: ReactionType) => {
      if (onReaction) {
        // Create reaction with current timestamp
        const reaction: Reaction = {
          type,
          sender: "me",
          timestamp: new Date().toISOString(),
        };

        // Play sound for any reaction action
        soundEffects.playReactionSound();

        // If this is an AI suggestion and it's a thumbs down, open the feedback editor
        if (isAiSuggestion && type === 'dislike') {
          setIsFeedbackEditorOpen(true);
          // Still send the reaction to parent
          onReaction(message.id, reaction);
          
          // Close menu and focus input with delay
          setTimeout(() => {
            setIsOpen(false);
            onOpenChange?.(false);
          }, 500);
          
          return;
        }

        // If this is an AI suggestion and it's being approved
        if (isAiSuggestion && type === 'like') {
          try {
            // If we already have HTML content, use it directly
            if (!message.htmlContent) {
              // Convert markdown to HTML for email
              const markdownContent = message.content;
              
              // Use marked to convert markdown to HTML
              const convertedHtml = marked(markdownContent, {
                gfm: true,
                breaks: true
              });
              
              // Wrap the converted HTML in a proper email template
              const htmlContent = `
                <!DOCTYPE html>
                <html>
                  <head>
                    <meta charset="utf-8">
                    <style>
                      body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                        line-height: 1.6;
                        color: #333;
                        max-width: 800px;
                        margin: 0 auto;
                        padding: 20px;
                      }
                      pre {
                        background-color: #f5f5f5;
                        padding: 12px;
                        border-radius: 4px;
                        overflow-x: auto;
                      }
                      code {
                        font-family: SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace;
                        font-size: 0.9em;
                        background-color: #f5f5f5;
                        padding: 2px 4px;
                        border-radius: 3px;
                      }
                      blockquote {
                        border-left: 4px solid #ddd;
                        padding-left: 16px;
                        margin-left: 0;
                        color: #666;
                      }
                      img {
                        max-width: 100%;
                        height: auto;
                      }
                      table {
                        border-collapse: collapse;
                        width: 100%;
                      }
                      table, th, td {
                        border: 1px solid #ddd;
                      }
                      th, td {
                        padding: 8px;
                        text-align: left;
                      }
                      th {
                        background-color: #f5f5f5;
                      }
                      ul, ol {
                        padding-left: 20px;
                      }
                      a {
                        color: #0366d6;
                        text-decoration: none;
                      }
                      a:hover {
                        text-decoration: underline;
                      }
                    </style>
                  </head>
                  <body>
                    ${convertedHtml}
                  </body>
                </html>
              `;

              // Store the HTML content for later use
              message.htmlContent = htmlContent;
            }
            
            // Make sure attachments are properly included
            if (message.attachments && message.attachments.length > 0) {
              console.log('[Reaction] Including attachments:', {
                count: message.attachments.length,
                files: message.attachments.map(a => ({ name: a.filename, type: a.mimeType }))
              });
            }
          } catch (error) {
            console.error('[Reaction] Error converting markdown to HTML:', error);
            // Fallback to original content if conversion fails
            if (!message.htmlContent) {
              message.htmlContent = message.content;
            }
          }
        }

        // Send reaction to parent
        onReaction(message.id, reaction);

        // Close menu and focus input with delay
        setTimeout(() => {
          setIsOpen(false);
          onOpenChange?.(false);
          onReactionComplete?.();
        }, 500);
      }
    },
    [message, onReaction, onOpenChange, onReactionComplete, isAiSuggestion]
  );

  // Handler for saving feedback from the editor
  const handleSaveFeedback = async (newContent: string, attachments: Attachment[]) => {
    try {
      // Update local state
      setEditedContent(newContent);
      
      // Filter out any attachments with blob URLs
      const validAttachments = attachments.filter(a => !a.url.startsWith('blob:'));
      
      // Check if we lost any attachments in the filtering
      if (validAttachments.length < attachments.length) {
        console.warn('[Feedback] Some attachments were filtered out due to invalid URLs:', 
          attachments.filter(a => a.url.startsWith('blob:'))
            .map(a => ({ name: a.filename, url: a.url }))
        );
      }
      
      setEditedAttachments(validAttachments);
      
      // Update the message content and attachments
      const originalContent = message.content;
      message.content = newContent;
      message.attachments = validAttachments;
      
      // Pre-convert markdown to HTML for later use
      try {
        const convertedHtml = marked(newContent, {
          gfm: true,
          breaks: true
        });
        
        // Wrap the converted HTML in a proper email template
        const htmlContent = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                  line-height: 1.6;
                  color: #333;
                  max-width: 800px;
                  margin: 0 auto;
                  padding: 20px;
                }
                pre {
                  background-color: #f5f5f5;
                  padding: 12px;
                  border-radius: 4px;
                  overflow-x: auto;
                }
                code {
                  font-family: SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace;
                  font-size: 0.9em;
                  background-color: #f5f5f5;
                  padding: 2px 4px;
                  border-radius: 3px;
                }
                blockquote {
                  border-left: 4px solid #ddd;
                  padding-left: 16px;
                  margin-left: 0;
                  color: #666;
                }
                img {
                  max-width: 100%;
                  height: auto;
                }
                table {
                  border-collapse: collapse;
                  width: 100%;
                }
                table, th, td {
                  border: 1px solid #ddd;
                }
                th, td {
                  padding: 8px;
                  text-align: left;
                }
                th {
                  background-color: #f5f5f5;
                }
                ul, ol {
                  padding-left: 20px;
                }
                a {
                  color: #0366d6;
                  text-decoration: none;
                }
                a:hover {
                  text-decoration: underline;
                }
              </style>
            </head>
            <body>
              ${convertedHtml}
            </body>
          </html>
        `;
        
        // Store the HTML content for later use
        message.htmlContent = htmlContent;
      } catch (error) {
        console.error('[Feedback] Error converting markdown to HTML:', error);
        // If conversion fails, we'll just use the plain text content
      }
      
      // Try to submit feedback to the server
      try {
        await submitFeedback(
          message.id,
          originalContent,
          newContent,
          validAttachments,
          conversation?.id,
          'dislike'
        );
      } catch (error) {
        // If server submission fails, log locally as fallback
        console.error('Error submitting feedback to server:', error);
        logFeedbackLocally(
          message.id,
          originalContent,
          newContent,
          validAttachments,
          conversation?.id,
          'dislike'
        );
      }
      
      toast({
        description: "Feedback saved. Thank you for your input.",
      });
      
      // Log the attachments for debugging
      if (validAttachments.length > 0) {
        console.log('[Feedback] Saved with attachments:', {
          count: validAttachments.length,
          files: validAttachments.map(a => ({ name: a.filename, type: a.mimeType, url: a.url.substring(0, 30) + '...' }))
        });
      }
      
      // Close the feedback editor
      setIsFeedbackEditorOpen(false);
    } catch (error) {
      console.error('Error saving feedback:', error);
      toast({
        title: "Error",
        description: "Failed to save feedback",
        variant: "destructive",
      });
    }
  };

  // Check if a specific reaction type is already active for the current user
  const isReactionActive = (type: ReactionType) => {
    return (
      message.reactions?.some((r) => r.type === type && r.sender === "me") ??
      false
    );
  };

  // Helper function to get reaction verb
  const getReactionVerb = (type: ReactionType) => {
    switch (type) {
      case "heart":
        return "loved";
      case "like":
        return "liked";
      case "dislike":
        return "disliked";
      case "laugh":
        return "laughed at";
      case "emphasize":
        return "emphasized";
      case "question":
        return "questioned";
      default:
        return "reacted to";
    }
  };

  // Helper function to format reactions into a sentence
  const formatReactions = (reactions: Reaction[]) => {
    const sortedReactions = [...reactions].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return sortedReactions
      .map((reaction, index) => {
        const name = reaction.sender === "me" ? "You" : reaction.sender;
        const verb = getReactionVerb(reaction.type);

        if (index === 0) {
          return `${name} ${verb} this message`;
        }
        if (index === sortedReactions.length - 1) {
          return ` ${name} ${verb} this message`;
        }
        return `${name} ${verb} this message`;
      })
      .join(", ");
  };

  const rightBubbleSvg =
    effectiveTheme === "dark"
      ? "/message-bubbles/right-bubble-dark.svg"
      : "/message-bubbles/right-bubble-light.svg";
  const leftBubbleSvg =
    effectiveTheme === "dark"
      ? "/message-bubbles/left-bubble-dark.svg"
      : "/message-bubbles/left-bubble-light.svg";
  const typingIndicatorSvg =
    effectiveTheme === "dark"
      ? "/typing-bubbles/chat-typing-dark.svg"
      : "/typing-bubbles/chat-typing-light.svg";

  const getReactionIconSvg = (
    reactionFromMe: boolean,
    messageFromMe: boolean,
    reactionType: ReactionType,
    isMobileView: boolean,
    overlay?: boolean
  ) => {
    const orientation = messageFromMe ? "left" : "right";
    const baseVariant = effectiveTheme === "dark" ? "dark" : "light";

    // If overlay is true, always use the base variant without "-blue"
    if (overlay) {
      return `reactions/${orientation}-${baseVariant}-${reactionType}-overlay.svg`;
    }

    // Otherwise, if the reaction is from me and we're in mobile view, use the blue variant
    const variant =
      reactionFromMe && isMobileView ? `${baseVariant}-blue` : baseVariant;

    return `reactions/${orientation}-${variant}-${reactionType}.svg`;
  };

  const getReactionStyle = (reaction: Reaction, isMe: boolean, isMobileView: boolean) => {
    const iconUrl = getReactionIconSvg(
      reaction.sender === "me",
      isMe,
      reaction.type,
      isMobileView
    );

    const mobileStyle = {
      backgroundImage: `url('${iconUrl}')`,
      backgroundSize: "contain",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
    };

    if (isMobileView || reaction.sender !== "me") {
      return mobileStyle;
    }

    return {
      WebkitMaskImage: `url('${iconUrl}')`,
      maskImage: `url('${iconUrl}')`,
      WebkitMaskSize: "contain",
      maskSize: "contain",
      WebkitMaskRepeat: "no-repeat",
      maskRepeat: "no-repeat",
      WebkitMaskPosition: "center",
      maskPosition: "center",
      background: "linear-gradient(to bottom, #47B5FF, #0A7CFF)",
      backgroundAttachment: "fixed",
    };
  };

  return (
    <div className={cn(
      "flex w-full flex-col relative z-10",
      isAiSuggestion && "message-bubble-ai-suggestion"
    )}>
      {/* Spacer before messages */}
      <div className="h-1 bg-background" />
      {/* Extra space between messages with reactions */}
      <div
        className={`overflow-hidden transition-[height] duration-500 ease-in-out ${
          message.reactions && message.reactions.length > 0
            ? message.sender === "me"
              ? "h-4"
              : "h-2"
            : "h-0"
        } bg-background`}
      />

      {/* Show recipient name for messages from others */}
      {recipientName && (
        <div className="text-xs text-muted-foreground mb-1 ml-12">
          {recipientName}
        </div>
      )}

      {/* Message container */}
      <div
        className={cn(
          "flex w-full",
          isMe ? "justify-end" : "justify-start",
          isSystemMessage && "justify-center"
        )}
      >
        {/* Message bubble */}
        <div
          className={cn(
            "relative max-w-[85%] rounded-lg p-3 shadow-sm",
            isMe
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground",
            isSystemMessage && "bg-transparent text-muted-foreground shadow-none text-sm py-1",
            message.type === "silenced" && "bg-muted/50 text-muted-foreground"
          )}
        >
          {/* Only show recipient name inside bubble if it wasn't already shown above and it's not an email thread */}
          {recipientName && !isAiSuggestion && !message.isEmailThread && (
            <div className="text-[10px] text-muted-foreground pl-4 pb-0.5 bg-background">
              {recipientName}
            </div>
          )}

          <div className="flex">
            {/* Left spacer for blue messages */}
            {isMe && <div className="flex-1 bg-background" />}
            {/* Message bubble container */}
            {isSystemMessage ? (
              <div
                className={cn(
                  "w-full flex justify-center py-2 px-3",
                  isSystemMessage && "bg-background"
                )}
              >
                <div
                  className={cn(
                    "text-[12px] text-muted-foreground text-center whitespace-pre-line max-w-[80%]",
                    message.type === "silenced" &&
                      "text-[#7978DF] flex items-center gap-1"
                  )}
                >
                  {message.type === "silenced" && <Icons.silencedMoon />}
                  {message.content}
                </div>
              </div>
            ) : isAiSuggestion ? (
              <div
                className={cn(
                  "group relative max-w-[75%] break-words flex-none",
                  isSystemMessage
                    ? "bg-muted/50 rounded-lg text-center"
                    : isTyping
                    ? "border-[17px] border-solid border-l-[22px] bg-blue-50 dark:bg-blue-900/20 text-gray-900 dark:text-gray-100"
                    : isMe
                    ? cn(
                        "border-[17px] border-solid border-r-[22px] text-white",
                        isMobileView
                          ? "bg-[#0A7CFF]"
                          : "bg-[linear-gradient(#47B5FF,#0A7CFF)] bg-fixed"
                      )
                    : isAiSuggestion
                    ? "border-[17px] border-solid border-l-[22px] bg-green-50 dark:bg-green-900/20 text-gray-900 dark:text-gray-100"
                    : "border-[17px] border-solid border-l-[22px] bg-gray-100 dark:bg-[#404040] text-gray-900 dark:text-gray-100"
                )}
                style={
                  !isSystemMessage
                    ? {
                        borderImageSlice: isMe ? "31 43 31 31" : "31 31 31 43",
                        borderImageSource: `url('${
                          isMe
                            ? rightBubbleSvg
                            : isTyping
                            ? typingIndicatorSvg
                            : leftBubbleSvg
                        }')`,
                        ...(isAiSuggestion ? { background: 'transparent' } : {})
                      }
                    : undefined
                }
              >
                <div className={cn(!isTyping && "-my-2.5 -mx-1")}>
                  {/* Message content or typing indicator */}
                  {isTyping ? (
                    <div className="flex flex-col">
                      {/* Add this to cover up the right border */}
                      <div
                        className={cn(
                          "absolute border-r-[0.5px] border-background",
                          !isMe || isTyping ? "inset-[-17px]" : "inset-[-22px]"
                        )}
                      />
                      <div className="text-[14px] flex items-center">
                        <div className="flex items-center justify-center gap-[4px] bg-gray-100 dark:bg-[#404040]">
                          <style>{typingAnimation}</style>
                          <div
                            className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-gray-300"
                            style={{ animation: "blink 1.4s infinite linear" }}
                          />
                          <div
                            className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-gray-300"
                            style={{
                              animation: "blink 1.4s infinite linear 0.2s",
                            }}
                          />
                          <div
                            className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-gray-300"
                            style={{
                              animation: "blink 1.4s infinite linear 0.4s",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <Popover
                      open={isOpen}
                      modal={true}
                      onOpenChange={handleOpenChange}
                    >
                      <PopoverTrigger asChild>
                        <div className="flex flex-col cursor-pointer">
                          {/* Add this to cover up the right border */}
                          <div
                            className={cn(
                              "absolute border-r-[0.5px] border-background",
                              !isMe ? "inset-[-17px]" : "inset-[-22px]"
                            )}
                          />
                          <div className="text-[14px] flex items-center">
                            <MessageContent 
                              message={{
                                ...message,
                                content: editedContent,
                                attachments: editedAttachments
                              }}
                              conversation={conversation}
                              isEditing={isEditing}
                              onEdit={() => setIsEditing(true)}
                              onSaveEdit={handleSaveEdit}
                              onRemoveAttachment={handleRemoveAttachment}
                            />
                          </div>
                        </div>
                      </PopoverTrigger>

                      {/* Reaction menu */}
                      <PopoverContent
                        className="flex p-2 gap-2 w-fit rounded-full bg-gray-100 dark:bg-[#404040] z-50 reaction-menu"
                        align={isMe ? "end" : "start"}
                        alignOffset={-8}
                        side="top"
                        sideOffset={20}
                      >
                        {/* Reaction buttons */}
                        {Object.entries(menuReactionIcons).map(([type, icon]) => (
                          <button
                            key={type}
                            onClick={() => {
                              handleReaction(type as ReactionType);
                            }}
                            className={cn(
                              "inline-flex items-center justify-center rounded-full w-8 h-8 aspect-square p-0 cursor-pointer text-base transition-all duration-200 ease-out text-gray-500 hover:scale-125 flex-shrink-0",
                              isReactionActive(type as ReactionType)
                                ? "bg-[#0A7CFF] text-white scale-110"
                                : ""
                            )}
                          >
                            <Image
                              src={
                                isReactionActive(type as ReactionType)
                                  ? icon
                                      .replace("-gray", "-white")
                                      .replace("-dark", "-white")
                                  : icon
                              }
                              width={24}
                              height={24}
                              alt={`${type} reaction`}
                              className="w-6 h-6"
                            />
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                  )}
                  {/* Display existing reactions */}
                  {message.reactions && message.reactions.length > 0 && (
                    <div
                      className={cn(
                        "absolute -top-8 flex",
                        isMe ? "-left-8" : "-right-8",
                        isMe ? "flex-row" : "flex-row-reverse"
                      )}
                    >
                      {[...message.reactions]
                        .sort(
                          (a, b) =>
                            new Date(a.timestamp).getTime() -
                            new Date(b.timestamp).getTime()
                        )
                        .map((reaction, index, array) => (
                          <Popover key={`${reaction.type}-${reaction.timestamp}`}>
                            <PopoverTrigger>
                              <div
                                key={`${reaction.type}-${reaction.timestamp}`}
                                className={cn(
                                  "w-8 h-8 flex items-center justify-center text-sm relative cursor-pointer",
                                  index !== array.length - 1 &&
                                    (isMe ? "-mr-7" : "-ml-7"),
                                  `z-[${array.length - index}]`
                                )}
                                style={getReactionStyle(reaction, isMe, isMobileView)}
                              >
                                {reaction.sender === "me" && !isMobileView && (
                                  <Image
                                    src={getReactionIconSvg(
                                      reaction.sender === "me",
                                      isMe,
                                      reaction.type,
                                      isMobileView,
                                      true
                                    )}
                                    width={32}
                                    height={32}
                                    alt={`${reaction.type} reaction`}
                                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-8 h-8"
                                    unoptimized
                                  />
                                )}
                              </div>
                            </PopoverTrigger>
                            <PopoverContent className="w-fit max-w-[200px] break-words px-3 py-1.5 bg-gray-100 dark:bg-[#404040] border-gray-100 dark:border-[#404040]">
                              <p className="text-sm">
                                {formatReactions(message.reactions || [])}
                              </p>
                            </PopoverContent>
                          </Popover>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div
                className={cn(
                  "group relative max-w-[75%] break-words flex-none",
                  isSystemMessage
                    ? "bg-muted/50 rounded-lg text-center"
                    : isTyping
                    ? "border-[17px] border-solid border-l-[22px] bg-gray-100 dark:bg-[#404040] text-gray-900 dark:text-gray-100"
                    : isMe
                    ? cn(
                        "border-[17px] border-solid border-r-[22px] text-white",
                        isMobileView
                          ? "bg-[#0A7CFF]"
                          : "bg-[linear-gradient(#47B5FF,#0A7CFF)] bg-fixed"
                      )
                    : isAiSuggestion
                    ? "border-[17px] border-solid border-l-[22px] bg-green-50 dark:bg-green-900/20 text-gray-900 dark:text-gray-100"
                    : "border-[17px] border-solid border-l-[22px] bg-gray-100 dark:bg-[#404040] text-gray-900 dark:text-gray-100"
                )}
                style={
                  !isSystemMessage
                    ? {
                        borderImageSlice: isMe ? "31 43 31 31" : "31 31 31 43",
                        borderImageSource: `url('${
                          isMe
                            ? rightBubbleSvg
                            : isTyping
                            ? typingIndicatorSvg
                            : leftBubbleSvg
                        }')`,
                        ...(isAiSuggestion ? { background: 'transparent' } : {})
                      }
                    : undefined
                }
              >
                <div className={cn(!isTyping && "-my-2.5 -mx-1")}>
                  {/* Message content or typing indicator */}
                  {isTyping ? (
                    <div className="flex flex-col">
                      {/* Add this to cover up the right border */}
                      <div
                        className={cn(
                          "absolute border-r-[0.5px] border-background",
                          !isMe || isTyping ? "inset-[-17px]" : "inset-[-22px]"
                        )}
                      />
                      <div className="text-[14px] flex items-center">
                        <div className="flex items-center justify-center gap-[4px] bg-gray-100 dark:bg-[#404040]">
                          <style>{typingAnimation}</style>
                          <div
                            className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-gray-300"
                            style={{ animation: "blink 1.4s infinite linear" }}
                          />
                          <div
                            className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-gray-300"
                            style={{
                              animation: "blink 1.4s infinite linear 0.2s",
                            }}
                          />
                          <div
                            className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-gray-300"
                            style={{
                              animation: "blink 1.4s infinite linear 0.4s",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <Popover
                      open={isOpen}
                      modal={true}
                      onOpenChange={handleOpenChange}
                    >
                      <PopoverTrigger asChild>
                        <div className="flex flex-col cursor-pointer">
                          {/* Add this to cover up the right border */}
                          <div
                            className={cn(
                              "absolute border-r-[0.5px] border-background",
                              !isMe ? "inset-[-17px]" : "inset-[-22px]"
                            )}
                          />
                          <div className="text-[14px] flex items-center">
                            <MessageContent 
                              message={{
                                ...message,
                                content: editedContent,
                                attachments: editedAttachments
                              }}
                              conversation={conversation}
                              isEditing={isEditing}
                              onEdit={() => setIsEditing(true)}
                              onSaveEdit={handleSaveEdit}
                              onRemoveAttachment={handleRemoveAttachment}
                            />
                          </div>
                        </div>
                      </PopoverTrigger>

                      {/* Reaction menu */}
                      <PopoverContent
                        className="flex p-2 gap-2 w-fit rounded-full bg-gray-100 dark:bg-[#404040] z-50 reaction-menu"
                        align={isMe ? "end" : "start"}
                        alignOffset={-8}
                        side="top"
                        sideOffset={20}
                      >
                        {/* Reaction buttons */}
                        {Object.entries(menuReactionIcons).map(([type, icon]) => (
                          <button
                            key={type}
                            onClick={() => {
                              handleReaction(type as ReactionType);
                            }}
                            className={cn(
                              "inline-flex items-center justify-center rounded-full w-8 h-8 aspect-square p-0 cursor-pointer text-base transition-all duration-200 ease-out text-gray-500 hover:scale-125 flex-shrink-0",
                              isReactionActive(type as ReactionType)
                                ? "bg-[#0A7CFF] text-white scale-110"
                                : ""
                            )}
                          >
                            <Image
                              src={
                                isReactionActive(type as ReactionType)
                                  ? icon
                                      .replace("-gray", "-white")
                                      .replace("-dark", "-white")
                                  : icon
                              }
                              width={24}
                              height={24}
                              alt={`${type} reaction`}
                              className="w-6 h-6"
                            />
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                  )}
                  {/* Display existing reactions */}
                  {message.reactions && message.reactions.length > 0 && (
                    <div
                      className={cn(
                        "absolute -top-8 flex",
                        isMe ? "-left-8" : "-right-8",
                        isMe ? "flex-row" : "flex-row-reverse"
                      )}
                    >
                      {[...message.reactions]
                        .sort(
                          (a, b) =>
                            new Date(a.timestamp).getTime() -
                            new Date(b.timestamp).getTime()
                        )
                        .map((reaction, index, array) => (
                          <Popover key={`${reaction.type}-${reaction.timestamp}`}>
                            <PopoverTrigger>
                              <div
                                key={`${reaction.type}-${reaction.timestamp}`}
                                className={cn(
                                  "w-8 h-8 flex items-center justify-center text-sm relative cursor-pointer",
                                  index !== array.length - 1 &&
                                    (isMe ? "-mr-7" : "-ml-7"),
                                  `z-[${array.length - index}]`
                                )}
                                style={getReactionStyle(reaction, isMe, isMobileView)}
                              >
                                {reaction.sender === "me" && !isMobileView && (
                                  <Image
                                    src={getReactionIconSvg(
                                      reaction.sender === "me",
                                      isMe,
                                      reaction.type,
                                      isMobileView,
                                      true
                                    )}
                                    width={32}
                                    height={32}
                                    alt={`${reaction.type} reaction`}
                                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-8 h-8"
                                    unoptimized
                                  />
                                )}
                              </div>
                            </PopoverTrigger>
                            <PopoverContent className="w-fit max-w-[200px] break-words px-3 py-1.5 bg-gray-100 dark:bg-[#404040] border-gray-100 dark:border-[#404040]">
                              <p className="text-sm">
                                {formatReactions(message.reactions || [])}
                              </p>
                            </PopoverContent>
                          </Popover>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* Right spacer for gray messages */}
            {!isSystemMessage && !isMe && <div className="flex-1 bg-background" />}
          </div>

          {/* Show "Delivered" for last message from current user */}
          {isMe && isLastUserMessage && !isTyping && (
            <div className="text-[10px] text-gray-500 pt-1 pr-1 bg-background text-right">
              <span className={cn(justSent && "animate-scale-in")}>Delivered</span>
            </div>
          )}
          {/* Spacer after messages */}
          <div className="h-1 bg-background" />

          {/* Edit Modal */}
          <EditModal
            isOpen={isEditing}
            onClose={() => setIsEditing(false)}
            content={message.content}
            onSave={(newContent) => handleSaveEdit(newContent)}
          />

          {/* Feedback Editor */}
          <FeedbackEditor
            isOpen={isFeedbackEditorOpen}
            onClose={() => setIsFeedbackEditorOpen(false)}
            initialContent={message.content}
            initialAttachments={message.attachments || []}
            onSave={handleSaveFeedback}
          />
        </div>
      </div>
    </div>
  );
}

function DocumentViewModal({ doc, isOpen, onClose }: { doc: Document; isOpen: boolean; onClose: () => void }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      const response = await fetch(`/api/context/document/${doc.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete document');
      }

      toast({
        description: "Document deleted successfully",
      });
      onClose();
      window.location.reload();
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        title: "Error",
        description: "Failed to delete document",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className={cn(
          "sm:max-w-3xl transition-all duration-300",
          isExpanded ? "h-screen" : "h-[80vh]"
        )}
        aria-describedby="document-content"
      >
        <DialogHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <DialogTitle className="flex items-center gap-2">
              <span className="truncate">{doc.metadata?.title || doc.filename}</span>
              <div className="flex gap-1">
                {doc.hasEmbedding && (
                  <Badge variant="secondary">
                    <Icons.search className="h-3 w-3 mr-1" />
                    Vector
                  </Badge>
                )}
                {doc.hasAnalysis && (
                  <Badge variant="secondary">
                    <Icons.smile className="h-3 w-3 mr-1" />
                    AI
                  </Badge>
                )}
              </div>
            </DialogTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(!isExpanded)}
              className="shrink-0"
            >
              <Icons.expand className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              disabled={isDeleting}
              className="shrink-0"
            >
              {isDeleting ? (
                <Icons.arrowUp className="h-4 w-4 animate-spin" />
              ) : (
                <Icons.close className="h-4 w-4 text-red-500" />
              )}
            </Button>
          </div>
        </DialogHeader>
        
        <div id="document-content" className="flex flex-col md:flex-row gap-6 h-full overflow-hidden">
          {/* Preview */}
          <div className="flex-1 min-w-0">
            {doc.mimeType?.startsWith('image/') ? (
              <div className="relative h-full">
                {!imageError && doc.url && !doc.url.startsWith('cid:') ? (
                  <Image
                    src={doc.url}
                    alt={doc.filename}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className="object-contain"
                    onError={() => setImageError(true)}
                    unoptimized={doc.url?.startsWith('https://storage.googleapis.com/')}
                  />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center">
                    <Icons.imageOff size={48} className="text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground mt-2">
                      {doc.url?.startsWith('cid:') ? 'Email attachment cannot be displayed' : 'Failed to load image'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{doc.filename}</p>
                  </div>
                )}
              </div>
            ) : (
              <iframe
                src={doc.url}
                className="w-full h-full rounded-lg"
                title={doc.filename}
              />
            )}
          </div>

          {/* Details */}
          <div className="w-full md:w-80 flex-shrink-0 overflow-y-auto">
            <DocumentDetails doc={doc} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DocumentDetails({ doc }: { doc: Document }) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium mb-2">Metadata</h4>
        <div className="text-sm text-muted-foreground space-y-2">
          {doc.metadata?.createdAt && (
            <div>
              <span className="font-medium">Created:</span>{" "}
              {new Date(doc.metadata.createdAt).toLocaleDateString()}
            </div>
          )}
          {doc.metadata?.pageCount && (
            <div>
              <span className="font-medium">Pages:</span> {doc.metadata.pageCount}
            </div>
          )}
          {doc.metadata?.wordCount && (
            <div>
              <span className="font-medium">Words:</span> {doc.metadata.wordCount}
            </div>
          )}
          {doc.metadata?.author && (
            <div>
              <span className="font-medium">Author:</span> {doc.metadata.author}
            </div>
          )}
        </div>
      </div>

      {doc.metadata?.summary && (
        <div>
          <h4 className="text-sm font-medium mb-2">Summary</h4>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {doc.metadata.summary}
          </p>
        </div>
      )}

      {doc.text && (
        <div>
          <h4 className="text-sm font-medium mb-2">Content</h4>
          <div className="text-sm text-muted-foreground max-h-[400px] overflow-y-auto whitespace-pre-wrap">
            {doc.text}
          </div>
        </div>
      )}
    </div>
  );
}

// Add this component for the reaction menu
function ReactionMenu({
  isOpen,
  onOpenChange,
  position,
  onReaction,
  isMe,
  isAiSuggestion,
  activeReactions,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  position: { x: number; y: number };
  onReaction: (type: ReactionType) => void;
  isMe: boolean;
  isAiSuggestion: boolean;
  activeReactions: ReactionType[];
}) {
  const reactions: { type: ReactionType; icon: JSX.Element }[] = [
    { type: 'like', icon: <Icons.thumbsUp className="h-4 w-4" /> },
    { type: 'heart', icon: <Icons.heart className="h-4 w-4" /> },
    { type: 'laugh', icon: <Icons.laugh className="h-4 w-4" /> },
    { type: 'emphasize', icon: <Icons.exclamation className="h-4 w-4" /> },
    { type: 'question', icon: <Icons.question className="h-4 w-4" /> },
  ];

  // For AI suggestions, only show thumbs up
  const availableReactions = isAiSuggestion ? reactions.slice(0, 1) : reactions;

  return (
    <div
      className={cn(
        "absolute z-50 flex items-center gap-1 p-1 rounded-full bg-white dark:bg-[#404040] shadow-lg transition-all duration-200",
        isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
      )}
      style={{
        left: position.x,
        top: position.y - 50,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {availableReactions.map(({ type, icon }) => (
        <button
          key={type}
          onClick={() => onReaction(type)}
          className={cn(
            "p-2 rounded-full hover:bg-gray-100 dark:hover:bg-[#505050] transition-colors",
            activeReactions.includes(type) && "text-blue-500"
          )}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
