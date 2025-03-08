import { Message, Conversation, Reaction } from "../types";
import { MessageBubble } from "./message-bubble";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { soundEffects } from "@/lib/sound-effects";
import { motion, AnimatePresence } from "framer-motion";

interface MessageListProps {
  messages: Message[];
  conversation?: Conversation;
  typingStatus: { conversationId: string; recipient: string } | null;
  conversationId: string | null;
  onReaction?: (messageId: string, reaction: Reaction) => void;
  onReactionComplete?: () => void;
  messageInputRef?: React.RefObject<{ focus: () => void }>;
  isMobileView?: boolean;
}

export function MessageList({
  messages,
  conversation,
  typingStatus,
  conversationId,
  onReaction,
  onReactionComplete,
  messageInputRef,
  isMobileView,
}: MessageListProps) {
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [isAnyReactionMenuOpen, setIsAnyReactionMenuOpen] = useState(false);
  const [lastSentMessageId, setLastSentMessageId] = useState<string | null>(
    null
  );
  const [prevConversationId, setPrevConversationId] = useState<string | null>(
    null
  );
  const [prevMessageCount, setPrevMessageCount] = useState(0);
  const messageListRef = useRef<HTMLDivElement>(null);
  const [wasAtBottom, setWasAtBottom] = useState(true);

  const lastUserMessageIndex = messages.findLastIndex(
    (msg) => msg.sender === "me"
  );

  const isTypingInThisConversation =
    typingStatus && typingStatus.conversationId === conversationId;

  const isAtBottom = () => {
    const viewport = messageListRef.current?.closest(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLElement;
    if (!viewport) return true;

    const { scrollTop, scrollHeight, clientHeight } = viewport;
    return Math.abs(scrollHeight - clientHeight - scrollTop) < 336;
  };

  // Track scroll position
  useEffect(() => {
    const viewport = messageListRef.current?.closest(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLElement;
    if (!viewport) return;

    const handleScroll = () => {
      setWasAtBottom(isAtBottom());
    };

    viewport.addEventListener("scroll", handleScroll);
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll only if we were at bottom
  useEffect(() => {
    if (!wasAtBottom && !isAtBottom()) return;

    const viewport = messageListRef.current?.closest(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLElement;
    if (!viewport) return;

    const scrollToBottom = viewport.scrollHeight - viewport.clientHeight;
    requestAnimationFrame(() => {
      viewport.scrollTo({
        top: scrollToBottom,
        behavior: "smooth",
      });
    });

    // Update previous state after scroll
    setPrevMessageCount(messages.length);
    setPrevConversationId(conversationId);
  }, [messages, wasAtBottom, conversationId, isAtBottom]);

  // Update lastSentMessageId when a new message is added
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      // Only play sound if this is a new message in the same conversation
      if (
        conversationId === prevConversationId &&
        messages.length > prevMessageCount
      ) {
        if (lastMessage.sender !== "me" && lastMessage.sender !== "system") {
          soundEffects.playReceivedSound();
        }
      }
      if (lastMessage.sender === "me") {
        setLastSentMessageId(lastMessage.id);
        // Clear the lastSentMessageId after animation duration
        const timer = setTimeout(() => {
          setLastSentMessageId(null);
        }, 1000); // Adjust this timing to match your animation duration
        return () => clearTimeout(timer);
      }
    }
  }, [messages, conversationId, prevConversationId, prevMessageCount]);

  return (
    <div ref={messageListRef} className="flex-1 flex flex-col-reverse relative">
      {/* Messages layer */}
      <div className="flex-1 relative">
        <AnimatePresence initial={false}>
          {messages
            .filter(message => message.type !== 'silenced')
            .map((message, index) => (
            <motion.div
              key={`${message.id}-${index}`}
              data-message-id={message.id}
              className="relative"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ 
                duration: 0.3,
                type: "spring",
                stiffness: 500,
                damping: 30
              }}
            >
              {/* Overlay for non-active messages */}
              {isAnyReactionMenuOpen && message.id !== activeMessageId && (
                <div className="absolute inset-0 bg-white/90 dark:bg-[#1A1A1A]/90 pointer-events-none z-20" />
              )}
              <div className={cn(message.id === activeMessageId && "z-30")}>
                <MessageBubble
                  message={message}
                  isLastUserMessage={index === lastUserMessageIndex}
                  conversation={conversation}
                  isTyping={false}
                  onReaction={onReaction}
                  onOpenChange={(isOpen) => {
                    setActiveMessageId(isOpen ? message.id : null);
                    setIsAnyReactionMenuOpen(isOpen);
                  }}
                  onReactionComplete={() => {
                    messageInputRef?.current?.focus();
                    onReactionComplete?.();
                  }}
                  justSent={message.id === lastSentMessageId}
                  isMobileView={isMobileView}
                />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {isTypingInThisConversation && (
          <motion.div 
            className="p-4 flex items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "600ms" }}></div>
            </div>
            <span className="text-sm text-muted-foreground ml-2">
              {typingStatus.recipient} is typing...
            </span>
          </motion.div>
        )}
      </div>
      <div className="h-2 bg-background" />
    </div>
  );
}
