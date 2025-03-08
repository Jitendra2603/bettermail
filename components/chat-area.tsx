import { Conversation, Message, Reaction, Recipient } from "../types";
import { useEffect, useRef, useState, useCallback } from "react";
import { ChatHeader } from "./chat-header";
import { MessageInput } from "./message-input";
import { MessageList } from "./message-list";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "@/lib/utils";
import { Icons } from "./icons";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Separator } from "./ui/separator";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useFileUpload } from "@/hooks/use-file-upload";
import "@/styles/ai-button.css";

interface ChatAreaProps {
  isNewChat: boolean;
  activeConversation?: Conversation;
  recipientInput: string;
  setRecipientInput: (value: string) => void;
  isMobileView?: boolean;
  onBack?: () => void;
  onSendMessage: (message: string, conversationId?: string, attachments?: { url: string; filename: string; mimeType: string }[]) => void;
  onReaction?: (messageId: string, reaction: Reaction) => void;
  typingStatus: { conversationId: string; recipient: string } | null;
  conversationId: string | null;
  onUpdateConversationRecipients?: (
    conversationId: string,
    recipients: Recipient[]
  ) => void;
  onCreateConversation?: (recipients: Recipient[]) => void;
  onUpdateConversationName?: (conversationId: string, name: string) => void;
  onHideAlertsChange?: (conversationId: string, hideAlerts: boolean) => void;
  messageDraft?: string;
  onMessageDraftChange?: (conversationId: string, message: string) => void;
  unreadCount?: number;
  onAddAiSuggestion?: () => void;
}

// Add this function to generate AI suggestions
async function generateAISuggestion(message: Message, conversation: Conversation) {
  try {
    console.log('[AI Suggestion] Generating suggestion for message:', {
      messageId: message.id,
      threadId: conversation.threadId,
      content: message.content.substring(0, 100) + '...'
    });

    // Call the suggest API
    const response = await fetch(`/api/emails/${conversation.threadId}/suggest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messageId: message.id,
        threadId: conversation.threadId,
      }),
    });

    // Log detailed response information for debugging
    console.log('[AI Suggestion] API response status:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      url: response.url
    });

    if (!response.ok) {
      // Try to get error details from response
      let errorDetails = '';
      try {
        const errorData = await response.json();
        errorDetails = errorData.error || 'Unknown error';
        console.error('[AI Suggestion] API error details:', errorData);
      } catch (parseError) {
        console.error('[AI Suggestion] Could not parse error response:', parseError);
      }
      
      throw new Error(`Failed to generate suggestion: ${response.status} ${response.statusText} - ${errorDetails}`);
    }

    // Parse the response data
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      console.error('[AI Suggestion] Error parsing response JSON:', parseError);
      throw new Error('Invalid response format from suggestion API');
    }

    console.log('[AI Suggestion] API response data:', {
      success: data.success,
      hasSuggestion: !!data.suggestion,
      suggestionPreview: data.suggestion?.content?.substring(0, 100) + '...',
      attachmentsCount: data.suggestion?.attachments?.length || 0
    });
    
    if (!data.suggestion) {
      throw new Error('No suggestion returned from API');
    }

    // Return the suggestion data directly - it will be formatted into a Message in the effect
    return {
      id: data.suggestion.id,
      content: data.suggestion.content,
      attachments: data.suggestion.attachments || [],
    };
  } catch (error) {
    console.error('[AI Suggestion] Error generating suggestion:', error);
    // Rethrow the error to be handled by the caller
    throw error;
  }
}

export function ChatArea({
  isNewChat,
  activeConversation,
  recipientInput,
  setRecipientInput,
  isMobileView,
  onBack,
  onSendMessage,
  onReaction,
  typingStatus,
  conversationId,
  onUpdateConversationRecipients,
  onCreateConversation,
  onUpdateConversationName,
  onHideAlertsChange,
  messageDraft = "",
  onMessageDraftChange,
  unreadCount = 0,
  onAddAiSuggestion,
}: ChatAreaProps) {
  const [showCompactNewChat, setShowCompactNewChat] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const messageInputRef = useRef<{ focus: () => void }>(null);
  const [messageInputKey, setMessageInputKey] = useState(0);
  const { theme } = useTheme();
  const router = useRouter();
  const isSmallScreen = useMediaQuery("(max-width: 640px)");
  const [pendingSuggestions, setPendingSuggestions] = useState<{[key: string]: boolean}>({});

  useEffect(() => {
    if (isNewChat) {
      setShowCompactNewChat(false);
    }
  }, [isNewChat]);

  const showRecipientInput = isNewChat && !activeConversation;

  useEffect(() => {
    if ("virtualKeyboard" in navigator) {
      // @ts-expect-error VirtualKeyboard API is not yet in TypeScript types
      navigator.virtualKeyboard.overlaysContent = true;
    }
  }, []);

  const conversationRecipients = activeConversation?.recipients || [];

  const handleMessageChange = (value: string) => {
    if (onMessageDraftChange) {
      onMessageDraftChange(conversationId || "new", value);
    }
  };

  // Watch for new messages from others and generate suggestions
  useEffect(() => {
    if (!activeConversation) {
      console.log('[AI Suggestion] No active conversation, skipping');
      return;
    }

    const messages = activeConversation.messages;
    if (!messages.length) {
      console.log('[AI Suggestion] No messages in conversation, skipping');
      return;
    }

    // Get the last message
    const lastMessage = messages[messages.length - 1];
    console.log('[AI Suggestion] Processing last message:', {
      id: lastMessage.id,
      sender: lastMessage.sender,
      type: lastMessage.type,
      isPending: pendingSuggestions[lastMessage.id],
      preview: lastMessage.content.substring(0, 100) + '...',
      isEmailThread: activeConversation.isEmailThread,
      threadId: activeConversation.threadId
    });

    // Only generate suggestions for email threads
    if (!activeConversation.isEmailThread || !activeConversation.threadId) {
      console.log('[AI Suggestion] Not an email thread or no threadId, skipping');
      return;
    }

    // Check if the message is from someone else (not me)
    const isFromOthers = lastMessage.sender !== 'me' && lastMessage.sender !== 'ai' && lastMessage.sender !== 'system';

    // Only generate suggestions when explicitly requested, not automatically
    // if (isFromOthers && !pendingSuggestions[lastMessage.id]) {
    //   console.log('[AI Suggestion] Generating suggestion for message:', lastMessage.id);
    //   setPendingSuggestions(prev => ({ ...prev, [lastMessage.id]: true }));

    //   // Generate suggestion
    //   generateAISuggestion(lastMessage, {
    //     ...activeConversation,
    //     threadId: activeConversation.threadId // Use the conversation's threadId
    //   }).then(suggestion => {
    //     if (suggestion) {
    //       console.log('[AI Suggestion] Creating suggestion message from:', suggestion);
          
    //       // Create a proper suggestion message
    //       const suggestionMessage: Message = {
    //         id: suggestion.id,
    //         content: suggestion.content,
    //         sender: "ai",
    //         type: "suggestion",
    //         timestamp: new Date().toISOString(),
    //         reactions: [],
    //         attachments: suggestion.attachments || [],
    //       };

    //       // Add the suggestion to the conversation
    //       onMessageGenerated(activeConversation.id, suggestionMessage);
    //     }
    //   }).catch(error => {
    //     console.error('[AI Suggestion] Error generating suggestion:', error);
    //   });
    // }
  }, [activeConversation?.messages, onUpdateConversationRecipients]);

  // Handle reactions (including suggestion approvals)
  const handleReaction = useCallback(async (messageId: string, reaction: Reaction) => {
    if (!activeConversation) return;

    // Find the message
    const message = activeConversation.messages.find(m => m.id === messageId);
    if (!message) {
      console.log('[Reaction] Message not found:', messageId);
      return;
    }

    console.log('[Reaction] Processing reaction:', {
      messageId,
      messageType: message.type,
      reactionType: reaction.type,
      hasAttachments: !!message.attachments?.length,
      attachmentCount: message.attachments?.length || 0
    });

    // If this is a suggestion and it's a thumbs up
    if (message.type === 'suggestion' && reaction.type === 'like') {
      try {
        // Log the message content and attachments
        console.log('[Reaction] Sending suggestion as message:', {
          content: message.content.substring(0, 100) + '...',
          hasAttachments: !!message.attachments?.length,
          attachmentCount: message.attachments?.length || 0,
          attachments: message.attachments?.map(a => ({ 
            name: a.filename, 
            type: a.mimeType,
            url: a.url.substring(0, 30) + '...'
          }))
        });

        // Ensure we have the attachments
        const attachments = message.attachments || [];
        
        // Send the suggestion as a reply
        await onSendMessage(
          message.htmlContent || message.content, // Use HTML content if available
          activeConversation.id,
          attachments
        );

        console.log('[Reaction] Suggestion sent, removing suggestion message');

        // Remove the suggestion message
        const updatedMessages = activeConversation.messages.filter(
          m => m.id !== messageId
        );

        // Update conversation
        const updatedConversation = {
          ...activeConversation,
          messages: updatedMessages,
        };

        onUpdateConversationRecipients?.(
          updatedConversation.id,
          updatedConversation.recipients
        );
      } catch (error) {
        console.error('[Reaction] Error sending suggestion:', error);
      }
    } 
    // If this is a suggestion and it's a thumbs down
    else if (message.type === 'suggestion' && reaction.type === 'dislike') {
      console.log('[Reaction] Received dislike for suggestion:', {
        messageId,
        content: message.content.substring(0, 100) + '...',
        hasAttachments: !!message.attachments?.length
      });
      
      // We don't remove the message here, as the user will provide feedback
      // The feedback editor is handled in the MessageBubble component
      
      // Just pass the reaction to the parent handler
      onReaction?.(messageId, reaction);
    } 
    else {
      // Handle normal reactions
      console.log('[Reaction] Processing normal reaction');
      onReaction?.(messageId, reaction);
    }
  }, [activeConversation, onSendMessage, onUpdateConversationRecipients, onReaction]);

  // Handle message sending
  const handleSend = async () => {
    if (messageDraft.trim() || attachments.length > 0) {
      try {
        // Show uploading state in UI
        const uploadingMessage = {
          id: crypto.randomUUID(),
          content: messageDraft,
          sender: 'me',
          timestamp: new Date().toISOString(),
          attachments: attachments.map(file => ({
            filename: file.name,
            mimeType: file.type,
            url: URL.createObjectURL(file),
            uploading: true
          })),
        };

        // Add temporary message to show uploading state
        if (activeConversation) {
          const updatedConversation = {
            ...activeConversation,
            messages: [...activeConversation.messages, uploadingMessage],
          };
          onUpdateConversationRecipients?.(
            updatedConversation.id,
            updatedConversation.recipients
          );
        }

        // First upload any attachments
        const uploadedAttachments = [];
        if (attachments.length > 0) {
          for (const file of attachments) {
            const formData = new FormData();
            formData.append("file", file);
            
            const response = await fetch("/api/upload", {
              method: "POST",
              body: formData,
            });
            
            if (!response.ok) {
              throw new Error("Failed to upload file");
            }
            
            const data = await response.json();
            uploadedAttachments.push({
              url: data.url,
              filename: file.name,
              mimeType: file.type,
            });
          }
        }

        // Send the message
        await onSendMessage(messageDraft, conversationId || undefined, uploadedAttachments);
        setAttachments([]);
        setMessageInputKey((prev) => prev + 1);

        // Remove the temporary uploading message
        if (activeConversation) {
          const updatedConversation = {
            ...activeConversation,
            messages: activeConversation.messages.filter(m => m.id !== uploadingMessage.id),
          };
          onUpdateConversationRecipients?.(
            updatedConversation.id,
            updatedConversation.recipients
          );
        }
      } catch (error) {
        console.error("Error sending message:", error);
        
        // Add error message to conversation
        const errorMessage = {
          id: crypto.randomUUID(),
          content: error instanceof Error 
            ? `Failed to send message: ${error.message}` 
            : 'Failed to send message. Please try again.',
          sender: 'system',
          type: 'error',
          timestamp: new Date().toISOString(),
        };
        
        if (activeConversation) {
          const updatedConversation = {
            ...activeConversation,
            messages: [...activeConversation.messages, errorMessage],
          };
          onUpdateConversationRecipients?.(
            updatedConversation.id,
            updatedConversation.recipients
          );
        }
      }
    }
  };

  const handleFileUpload = (files: File[]) => {
    setAttachments(files);
  };

  return (
    <div className="h-dvh relative">
      <div className="absolute top-0 left-0 right-0 z-50">
        <ChatHeader
          isNewChat={showRecipientInput}
          recipientInput={recipientInput}
          setRecipientInput={setRecipientInput}
          onBack={onBack}
          isMobileView={isMobileView}
          activeConversation={activeConversation}
          onUpdateRecipients={
            onUpdateConversationRecipients
              ? (recipients) =>
                  onUpdateConversationRecipients(conversationId!, recipients)
              : undefined
          }
          onCreateConversation={onCreateConversation}
          onUpdateConversationName={onUpdateConversationName}
          onHideAlertsChange={onHideAlertsChange}
          unreadCount={unreadCount}
          showCompactNewChat={showCompactNewChat}
          setShowCompactNewChat={setShowCompactNewChat}
        />
      </div>
      <ScrollArea
        className="h-full flex flex-col"
        isMobile={isMobileView}
        withVerticalMargins
        mobileHeaderHeight={isMobileView}
        bottomMargin="calc(var(--dynamic-height, 64px))"
      >
        <div
          className={cn(
            "min-h-screen flex flex-col",
            isMobileView ? "pt-24" : "pt-16",
            "pb-[var(--dynamic-height,64px)]"
          )}
        >
          <div className="flex-1 flex flex-col relative">
            <div className="relative h-full flex">
              <div className="w-3 bg-background" />
              <MessageList
                messages={activeConversation?.messages || []}
                conversation={activeConversation}
                typingStatus={
                  typingStatus?.conversationId === conversationId
                    ? typingStatus
                    : null
                }
                onReaction={handleReaction}
                conversationId={conversationId}
                messageInputRef={messageInputRef}
                isMobileView={isMobileView}
              />
              <div className="w-3 bg-background" />
            </div>
            <div className="bg-background flex-1" />
          </div>
        </div>
      </ScrollArea>
      <div className="absolute bottom-0 left-0 right-0 z-50 mb-[env(keyboard-inset-height,0px)]">
        <div className="flex items-center">
          {/* AI Suggestion Button */}
          {onAddAiSuggestion && (
            <button
              onClick={onAddAiSuggestion}
              className="custom-button ai-suggestion ml-2"
              title="Generate AI suggestion"
            >
              <div className="button-outter">
                <div className="button-inner">
                  <span className="flex items-center gap-1">
                    <Icons.sparkles className="h-3 w-3" />
                    AI
                  </span>
                </div>
              </div>
            </button>
          )}
          <div className="flex-1">
            <MessageInput
              key={messageInputKey}
              ref={messageInputRef}
              message={messageDraft}
              setMessage={handleMessageChange}
              handleSend={handleSend}
              disabled={isNewChat && !recipientInput}
              recipients={conversationRecipients}
              isMobileView={isMobileView}
              conversationId={conversationId || undefined}
              isNewChat={isNewChat}
              onFileUpload={handleFileUpload}
              attachments={attachments}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
