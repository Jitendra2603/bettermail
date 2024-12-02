import { Conversation } from "../types";
import { useState, useEffect, useRef } from "react";
import { ChatHeader } from "./chat-header";
import { MessageInput } from "./message-input";
import { MessageList } from "./message-list";

interface ChatAreaProps {
  isNewChat: boolean;
  activeConversation?: Conversation;
  recipientInput: string;
  setRecipientInput: (value: string) => void;
  isMobileView?: boolean;
  onBack?: () => void;
  onSendMessage: (message: string, conversationId?: string) => void;
  typingStatus: { conversationId: string; recipient: string; } | null;
  conversationId: string | null;
}

export function ChatArea({
  isNewChat,
  activeConversation,
  recipientInput,
  setRecipientInput,
  isMobileView,
  onBack,
  onSendMessage,
  typingStatus,
  conversationId,
}: ChatAreaProps) {
  const [message, setMessage] = useState("");
  const messageInputRef = useRef<HTMLInputElement>(null);
  const showRecipientInput = isNewChat && !activeConversation;

  useEffect(() => {
    // Focus input when conversation becomes active, but only on desktop
    if (activeConversation && messageInputRef.current && !isMobileView) {
      messageInputRef.current.focus();
    }
  }, [activeConversation, isMobileView]);

  useEffect(() => {
    if ("virtualKeyboard" in navigator) {
      // @ts-expect-error VirtualKeyboard API is not yet in TypeScript types
      navigator.virtualKeyboard.overlaysContent = true;
    }
  }, []);

  const handleSend = () => {
    if (!message.trim()) return;
    
    if (activeConversation) {
      onSendMessage(message, activeConversation.id);
    } else if (isNewChat) {
      const recipientList = recipientInput
        .split(",")
        .map((r) => r.trim())
        .filter((r) => r.length > 0);
      
      if (recipientList.length === 0) return;
      
      // For new conversations, we don't pass a conversationId
      onSendMessage(message);
    }
    setMessage("");
  };

  const conversationRecipients = activeConversation?.recipients || [];

  return (
    <div className="h-dvh flex flex-col">
      <div className="sticky top-0 z-20 bg-background">
        <ChatHeader
          isNewChat={showRecipientInput}
          recipientInput={recipientInput}
          setRecipientInput={setRecipientInput}
          isMobileView={isMobileView}
          onBack={onBack}
          activeConversation={activeConversation}
        />
      </div>
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        <MessageList
          messages={activeConversation?.messages || []}
          conversation={activeConversation}
          typingStatus={typingStatus}
          conversationId={conversationId}
        />
      </div>
      <div className="sticky bottom-0 bg-background z-20" style={{
        marginBottom: 'env(keyboard-inset-height, 0px)'
      }}>
        <MessageInput
          message={message}
          setMessage={setMessage}
          handleSend={handleSend}
          inputRef={messageInputRef}
          disabled={!activeConversation && !isNewChat}
          recipients={conversationRecipients}
          isMobileView={isMobileView}
        />
      </div>
    </div>
  );
}
