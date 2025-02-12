import { Conversation, Reaction } from "../types";
import { useEffect, useRef, useState } from "react";
import { ChatHeader } from "./chat-header";
import { MessageInput } from "./message-input";
import { MessageList } from "./message-list";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "@/lib/utils";
import { Recipient } from "@/types";
import { Icons } from "./icons";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Separator } from "./ui/separator";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useFileUpload } from "@/hooks/use-file-upload";

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
}: ChatAreaProps) {
  const [showCompactNewChat, setShowCompactNewChat] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const messageInputRef = useRef<{ focus: () => void }>(null);
  const [messageInputKey, setMessageInputKey] = useState(0);
  const { theme } = useTheme();
  const router = useRouter();
  const isSmallScreen = useMediaQuery("(max-width: 640px)");

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
        
        // Check if this is an email thread
        const isEmailThread = activeConversation?.isEmailThread || false;
        const threadId = activeConversation?.threadId || null;
        
        // If this is an email thread, ensure we have a recipient
        if (isEmailThread && !activeConversation?.recipients?.[0]) {
          throw new Error("No recipient found for email thread");
        }
        
        // Now send the message with the permanent URLs
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
        
        // Add error message to conversation
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
                onReaction={(messageId, reaction) => {
                  onReaction?.(messageId, reaction);
                }}
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
  );
}
