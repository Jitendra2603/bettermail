import { cn } from "@/lib/utils";
import { Message, ReactionType, Reaction } from "../types";
import { Conversation } from "../types";
import { useCallback, useState, useRef } from "react";
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
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

const MessageContent = ({ message, conversation }: { message: Message, conversation?: Conversation }) => {
  const [imageLoadErrors, setImageLoadErrors] = useState<{[key: string]: boolean}>({});

  // Handle AI suggestions
  if (message.type === 'suggestion') {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-[14px]" dangerouslySetInnerHTML={{ __html: message.content }} />
        
        {/* Show relevant documents if available */}
        {message.suggestion?.relevantDocs && message.suggestion.relevantDocs.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="text-xs text-muted-foreground mb-1">
              Relevant documents:
            </div>
            <div className="flex flex-wrap gap-2">
              {message.suggestion.relevantDocs.map((doc, index) => (
                <div
                  key={index}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900 text-xs"
                >
                  <Icons.document className="w-3 h-3" />
                  <span className="truncate max-w-[150px]">{doc.title}</span>
                  <span className="text-muted-foreground">
                    {Math.round(doc.similarity * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Show status badge */}
        <div className="flex items-center gap-2 mt-1">
          <div
            className={cn(
              "text-xs px-2 py-0.5 rounded-full",
              message.suggestion?.status === "approved"
                ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                : message.suggestion?.status === "rejected"
                ? "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300"
                : "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300"
            )}
          >
            {message.suggestion?.status === "approved"
              ? "Approved"
              : message.suggestion?.status === "rejected"
              ? "Rejected"
              : "Pending"}
          </div>
          {message.suggestion?.enhancedAt && (
            <div className="text-xs text-muted-foreground">
              Enhanced with context
            </div>
          )}
        </div>
      </div>
    );
  }

  // Handle attachments
  if (message.attachments && message.attachments.length > 0) {
    return (
      <div className="flex flex-col gap-2">
        {message.content && (
          <div className="text-[14px]" dangerouslySetInnerHTML={{ __html: message.content }} />
        )}
        <div className="grid grid-cols-2 gap-2">
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
                  </div>
                );
              }

              return (
                <div key={index} className="relative w-full max-w-[300px] aspect-square">
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
      </div>
    );
  }

  // Show regular message content
  return <div className="text-[14px]" dangerouslySetInnerHTML={{ __html: message.content }} />;
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
  // Determine message sender type and display name
  const isSystemMessage = message.sender === "system";
  const isAiSuggestion = message.type === "suggestion";
  const isMe = message.sender === "me";
  const showRecipientName = !isMe && !isSystemMessage && !isAiSuggestion;
  const recipientName = showRecipientName ? message.sender : null;

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
  const openTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    [message.id, onReaction, onOpenChange, onReactionComplete]
  );

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
    <div className="flex w-full flex-col relative z-10">
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
                        <MessageContent message={message} conversation={conversation} />
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
                              `z-[${array.length - index}]`,
                              // Add animation class when reaction is new
                              // new Date().getTime() - new Date(reaction.timestamp).getTime() < 1000 && "reaction-pop"
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
                        <MessageContent message={message} conversation={conversation} />
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
                              `z-[${array.length - index}]`,
                              // Add animation class when reaction is new
                              // new Date().getTime() - new Date(reaction.timestamp).getTime() < 1000 && "reaction-pop"
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
                {!imageError ? (
                  <Image
                    src={doc.url || ''}
                    alt={doc.filename}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className="object-contain"
                    onError={() => setImageError(true)}
                    unoptimized={doc.url?.startsWith('https://storage.googleapis.com/')}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-muted">
                    <Icons.file className="h-12 w-12 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mt-2">Failed to load image</p>
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
