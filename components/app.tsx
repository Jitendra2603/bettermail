import { Sidebar } from "./sidebar";
import { ChatArea } from "./chat-area";
import { useState, useEffect, useRef, useCallback } from "react";
import { Nav } from "./nav";
import { Conversation, Message, Reaction, Recipient } from "../types";
import { initialConversations } from "../data/initial-conversations";
import { MessageQueue } from "../lib/message-queue";
import { useToast } from "@/hooks/use-toast"; // Import useToast from custom hook
import { CommandMenu } from "./command-menu"; // Import CommandMenu component
import { soundEffects } from "@/lib/sound-effects";
import { useRouter, useSearchParams } from "next/navigation";
import { useEmailSync } from "@/hooks/useEmailSync";
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth';

// Helper function to generate UUID on the client side
function generateClientUUID() {
  // Use crypto.randomUUID() if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default function App() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast(); // Destructure toast from custom hook
  const [isNewConversation, setIsNewConversation] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(
    null
  );
  const [lastActiveConversation, setLastActiveConversation] = useState<
    string | null
  >(null);
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>(
    {}
  );
  const [recipientInput, setRecipientInput] = useState("");
  const [isMobileView, setIsMobileView] = useState(false);
  const [isLayoutInitialized, setIsLayoutInitialized] = useState(false);
  const [typingStatus, setTypingStatus] = useState<{
    conversationId: string;
    recipient: string;
  } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(soundEffects.isEnabled());

  // Add command menu ref
  const commandMenuRef = useRef<{ setOpen: (open: boolean) => void }>(null);

  const STORAGE_KEY = "dialogueConversations";

  const { emailConversations, error: emailError } = useEmailSync();
  const { authError } = useFirebaseAuth();

  // Show error toast if auth fails
  useEffect(() => {
    if (authError) {
      toast({
        title: "Authentication Error",
        description: "There was a problem with authentication. Trying to reconnect...",
        variant: "destructive"
      });
    }
  }, [authError, toast]);

  // Initialize Firebase auth
  useFirebaseAuth();

  // Memoized conversation selection method
  const selectConversation = useCallback(
    (conversationId: string | null) => {
      if (conversationId === null) {
        setActiveConversation(null);
        setIsNewConversation(false);
        return;
      }

      const selectedConversation = conversations.find(
        (conversation) => conversation.id === conversationId
      );

      if (!selectedConversation) {
        console.error(`Conversation with ID ${conversationId} not found`);

        if (conversations.length > 0) {
          const fallbackConversation = conversations[0];
          setActiveConversation(fallbackConversation.id);
        } else {
          setActiveConversation(null);
        }
        return;
      }

      setActiveConversation(conversationId);
      setIsNewConversation(false);
    },
    [conversations]
  );

  // Effects
  // Ensure active conversation remains valid
  useEffect(() => {
    if (
      activeConversation &&
      !conversations.some((c) => c.id === activeConversation)
    ) {
      console.error(
        "Active conversation no longer exists:",
        activeConversation
      );

      // If current active conversation no longer exists
      if (conversations.length > 0) {
        // Select the first conversation
        const newActiveConversation = conversations[0].id;
        selectConversation(newActiveConversation);
      } else {
        // No conversations left
        selectConversation(null);
      }
    }
  }, [conversations, activeConversation, selectConversation]);

  // Save user's conversations to local storage
  useEffect(() => {
    if (conversations.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    }
  }, [conversations]);

  // Set mobile view
  useEffect(() => {
    const handleResize = () => {
      const newIsMobileView = window.innerWidth < 768;
      if (isMobileView !== newIsMobileView) {
        setIsMobileView(newIsMobileView);

        // When transitioning from mobile to desktop, restore the last active conversation
        if (!newIsMobileView && !activeConversation && lastActiveConversation) {
          selectConversation(lastActiveConversation);
        }
      }
    };

    handleResize();
    setIsLayoutInitialized(true);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [
    isMobileView,
    activeConversation,
    lastActiveConversation,
    selectConversation,
  ]);

  // Get conversations from local storage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const urlParams = new URLSearchParams(window.location.search);
    const urlConversationId = urlParams.get("id");

    // Start with email conversations as the base
    let allConversations = [...emailConversations];

    // Only merge non-email conversations from localStorage
    if (saved) {
      try {
        const parsedConversations = JSON.parse(saved);
        if (!Array.isArray(parsedConversations)) {
          console.error("Invalid conversations format in localStorage");
          return;
        }

        // Only keep non-email conversations from localStorage
        const userConversations = parsedConversations.filter(
          (conv) => !conv.isEmailThread
        );

        // Merge non-email conversations with email conversations
        allConversations = [...allConversations, ...userConversations];
      } catch (error) {
        console.error("Error parsing saved conversations:", error);
      }
    }

    // Sort all conversations by last message time
    allConversations.sort((a, b) => {
      const timeA = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : new Date(b.updatedAt).getTime();
      const timeB = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : new Date(a.updatedAt).getTime();
      return timeA - timeB;
    });

    setConversations(allConversations);

    if (urlConversationId) {
      const conversationExists = allConversations.some(
        (c) => c.id === urlConversationId
      );
      if (conversationExists) {
        setActiveConversation(urlConversationId);
        return;
      }
    }

    if (isMobileView) {
      window.history.pushState({}, "", "/messages");
      setActiveConversation(null);
      return;
    }

    if (allConversations.length > 0) {
      setActiveConversation(allConversations[0].id);
    }
  }, [isMobileView, emailConversations]);

  // Update lastActiveConversation whenever activeConversation changes
  useEffect(() => {
    if (activeConversation) {
      setLastActiveConversation(activeConversation);
      resetUnreadCount(activeConversation);
    }
  }, [activeConversation]);

  // Keep MessageQueue's internal state in sync with React's activeConversation state
  useEffect(() => {
    messageQueue.current.setActiveConversation(activeConversation);
  }, [activeConversation]);

  // Initialize message queue with proper state management
  const messageQueue = useRef<MessageQueue>(
    new MessageQueue({
      onMessageGenerated: (conversationId: string, message: Message) => {
        setConversations((prev) => {
          // Get the current active conversation from MessageQueue's internal state
          // This ensures we always have the latest value, not a stale closure
          const currentActiveConversation =
            messageQueue.current.getActiveConversation();

          const conversation = prev.find((c) => c.id === conversationId);
          if (!conversation) {
            console.error("Conversation not found:", conversationId);
            return prev;
          }

          // Use MessageQueue's tracked active conversation state to determine unread status
          // This fixes the bug where messages were always marked unread due to stale state
          const shouldIncrementUnread =
            conversationId !== currentActiveConversation &&
            message.sender !== "me" &&
            !conversation.hideAlerts;

          // Play received sound if message is in inactive conversation, not from us, and alerts aren't hidden
          if (shouldIncrementUnread && !conversation.hideAlerts) {
            soundEffects.playUnreadSound();
          }

          return prev.map((conv) =>
            conv.id === conversationId
              ? {
                  ...conv,
                  messages: [...conv.messages, message],
                  lastMessageTime: new Date().toISOString(),
                  unreadCount: shouldIncrementUnread
                    ? (conv.unreadCount || 0) + 1
                    : conv.unreadCount,
                }
              : conv
          );
        });
      },
      onMessageUpdated: (
        conversationId: string,
        messageId: string,
        updates: Partial<Message>
      ) => {
        setConversations((prev) => {
          const currentActiveConversation =
            messageQueue.current.getActiveConversation();

          return prev.map((conv) =>
            conv.id === conversationId
              ? {
                  ...conv,
                  unreadCount:
                    conversationId === currentActiveConversation ||
                    conv.hideAlerts
                      ? conv.unreadCount
                      : (conv.unreadCount || 0) + 1,
                  messages: conv.messages.map((msg) => {
                    if (msg.id === messageId) {
                      // If we're updating reactions and the message already has reactions,
                      // merge them together instead of overwriting
                      const currentReactions = msg.reactions || [];
                      const newReactions = updates.reactions || [];

                      // Filter out any duplicate reactions (same type and sender)
                      const uniqueNewReactions = newReactions.filter(
                        (newReaction) =>
                          !currentReactions.some(
                            (currentReaction) =>
                              currentReaction.type === newReaction.type &&
                              currentReaction.sender === newReaction.sender
                          )
                      );
                      return {
                        ...msg,
                        ...updates,
                        reactions: [...currentReactions, ...uniqueNewReactions],
                      };
                    }
                    return msg;
                  }),
                }
              : conv
          );
        });
      },
      onTypingStatusChange: (
        conversationId: string | null,
        recipient: string | null
      ) => {
        if (!conversationId || !recipient) {
          setTypingStatus(null);
        } else {
          setTypingStatus({ conversationId, recipient });
        }
      },
      onError: (error: Error) => {
        console.error("Error generating message:", error);
        setTypingStatus(null);
      },
    })
  );

  // Update sound enabled state when it changes in soundEffects
  useEffect(() => {
    setSoundEnabled(soundEffects.isEnabled());
  }, []);

  // Method to reset unread count when conversation is selected
  const resetUnreadCount = (conversationId: string) => {
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, unreadCount: 0 }
          : conversation
      )
    );
  };

  // Method to update conversation recipients
  const handleUpdateConversationRecipients = (conversationId: string, recipients: Recipient[]) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              recipients,
            }
          : c
      )
    );
  };

  // Create new conversation
  const handleCreateConversation = (recipients: Recipient[]) => {
    const newConversation: Conversation = {
      id: generateClientUUID(),
      recipients,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      unreadCount: 0,
    };
    setConversations((prev) => [newConversation, ...prev]);
    setActiveConversation(newConversation.id);
  };

  // Update conversation hide alerts setting
  const handleHideAlertsChange = (conversationId: string, hideAlerts: boolean) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              hideAlerts,
            }
          : c
      )
    );
  };

  // Method to handle message draft changes
  const handleMessageDraftChange = (
    conversationId: string,
    message: string
  ) => {
    setMessageDrafts((prev) => ({
      ...prev,
      [conversationId]: message,
    }));
  };

  // Method to clear message draft after sending
  const clearMessageDraft = (conversationId: string) => {
    setMessageDrafts((prev) => {
      const newDrafts = { ...prev };
      delete newDrafts[conversationId];
      return newDrafts;
    });
  };

  // Method to extract plain text from HTML content while preserving mentions
  const extractMessageContent = (htmlContent: string): string => {
    const temp = document.createElement("div");
    temp.innerHTML = htmlContent;
    return temp.textContent || "";
  };

  // Method to create a new conversation with recipients
  const createNewConversation = (recipientNames: string[]) => {
    // Create recipients with IDs
    const recipients = recipientNames.map((name) => ({
      id: generateClientUUID(),
      name,
    }));

    // Create new conversation object
    const newConversation: Conversation = {
      id: generateClientUUID(),
      recipients,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      unreadCount: 0,
      hideAlerts: false,
    };

    // Update state
    setConversations((prev) => {
      const updatedConversations = [newConversation, ...prev];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedConversations));
      return updatedConversations;
    });

    // Just update the state, let the useEffect handle navigation
    setActiveConversation(newConversation.id);
    setIsNewConversation(false);
    
    return newConversation.id;
  };

  // Method to handle message sending
  const handleSendMessage = async (
    message: string,
    conversationId?: string,
    attachments: { url: string; filename: string; mimeType: string }[] = []
  ) => {
    // Process the message content - ensure it's treated as plain text
    // No HTML processing needed with the new textarea approach
    const messageContent = message;

    const newMessage: Message = {
      id: generateClientUUID(),
      content: messageContent,
      sender: "me",
      timestamp: new Date().toISOString(),
      attachments,
      reactions: [],
    };

    if (conversationId) {
      // Find the existing conversation
      const existingConversation = conversations.find(c => c.id === conversationId);
      if (!existingConversation) return;

      // Create updated conversation preserving all properties
      const updatedConversation: Conversation = {
        ...existingConversation,
        messages: [...existingConversation.messages, newMessage],
        lastMessage: attachments.length > 0 
          ? `Sent ${attachments.length} attachment${attachments.length === 1 ? '' : 's'}${message ? ' with message' : ''}`
          : message,
        updatedAt: new Date().toISOString(),
        // Ensure email thread properties are preserved
        isEmailThread: existingConversation.isEmailThread || false,
        threadId: existingConversation.threadId || null,
      };

      // Update conversations state
      setConversations(prev => 
        prev.map(c => c.id === conversationId ? updatedConversation : c)
      );

      // Enqueue the message and wait for it to be sent
      try {
        await messageQueue.current?.enqueueUserMessage(updatedConversation);
      } catch (error) {
        console.error("Failed to send message:", error);
        // Revert the conversation update on failure
        setConversations(prev => 
          prev.map(c => c.id === conversationId ? existingConversation : c)
        );
        throw error;
      }
    } else {
      // Create new conversation
      const recipientList = recipientInput
        .split(",")
        .map((r) => r.trim())
        .filter((r) => r.length > 0);

      if (recipientList.length > 0) {
        const newConversationId = generateClientUUID();
        const newConversation: Conversation = {
          id: newConversationId,
          recipients: recipientList.map((name) => ({
            id: name.toLowerCase(),
            name,
          })),
          messages: [newMessage],
          lastMessage: attachments.length > 0 
            ? `Sent ${attachments.length} attachment${attachments.length === 1 ? '' : 's'}${message ? ' with message' : ''}`
            : message,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          unreadCount: 0,
          // New conversations are not email threads by default
          isEmailThread: false,
          threadId: null,
        };

        setConversations(prev => [newConversation, ...prev]);
        // Don't navigate here - just update the state
        setActiveConversation(newConversationId);
        setIsNewConversation(false);
        setRecipientInput("");
        
        // Enqueue the message and wait for it to be sent
        try {
          await messageQueue.current?.enqueueUserMessage(newConversation);
        } catch (error) {
          console.error("Failed to send message:", error);
          // Remove the conversation on failure
          setConversations(prev => prev.filter(c => c.id !== newConversationId));
          throw error;
        }
      }
    }

    // Clear message draft
    handleMessageDraftChange(conversationId || "new", "");
  };

  // Method to handle conversation deletion
  const handleDeleteConversation = (id: string) => {
    setConversations((prevConversations) => {
      const newConversations = prevConversations.filter(
        (conv) => conv.id !== id
      );

      // Save to localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newConversations));

      // If we're deleting the active conversation and there are conversations left
      if (id === activeConversation && newConversations.length > 0) {
        // Sort conversations the same way as in the sidebar
        const sortedConvos = [...prevConversations].sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          const timeA = a.lastMessageTime
            ? new Date(a.lastMessageTime).getTime()
            : 0;
          const timeB = b.lastMessageTime
            ? new Date(b.lastMessageTime).getTime()
            : 0;
          return timeB - timeA;
        });

        // Find the index of the deleted conversation in the sorted list
        const deletedIndex = sortedConvos.findIndex((conv) => conv.id === id);

        if (deletedIndex === sortedConvos.length - 1) {
          // If deleting the last conversation, go to the previous one
          selectConversation(sortedConvos[deletedIndex - 1].id);
        } else {
          // Otherwise go to the next conversation
          selectConversation(sortedConvos[deletedIndex + 1].id);
        }
      } else if (newConversations.length === 0) {
        // If no conversations left, clear the selection
        selectConversation(null);
      }

      return newConversations;
    });

    // Show toast notification
    toast({
      description: "Conversation deleted",
    });
  };

  // Method to handle conversation pin/unpin
  const handleUpdateConversation = (
    conversations: Conversation[],
    updateType?: "pin" | "mute"
  ) => {
    const updatedConversation = conversations.find(
      (conv) => conv.id === activeConversation
    );
    setConversations(conversations);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));

    // Show toast notification
    if (updatedConversation) {
      let toastMessage = "";
      if (updateType === "pin") {
        toastMessage = updatedConversation.pinned
          ? "Conversation pinned"
          : "Conversation unpinned";
      } else if (updateType === "mute") {
        toastMessage = updatedConversation.hideAlerts
          ? "Conversation muted"
          : "Conversation unmuted";
      }
      if (toastMessage) {
        toast({
          description: toastMessage,
        });
      }
    }
  };

  // Method to handle reaction
  const handleReaction = useCallback(
    (messageId: string, reaction: Reaction) => {
      setConversations((prevConversations) => {
        return prevConversations.map((conversation) => {
          const messages = conversation.messages.map((message) => {
            if (message.id === messageId) {
              // Check if this exact reaction already exists
              const existingReaction = message.reactions?.find(
                (r) => r.sender === reaction.sender && r.type === reaction.type
              );

              if (existingReaction) {
                // If the same reaction exists, remove it
                return {
                  ...message,
                  reactions: message.reactions?.filter(
                    (r) => !(r.sender === reaction.sender && r.type === reaction.type)
                  ) || [],
                };
              } else {
                // Remove any other reaction from this sender and add the new one
                const otherReactions = message.reactions?.filter(
                  (r) => r.sender !== reaction.sender
                ) || [];
                return {
                  ...message,
                  reactions: [...otherReactions, reaction],
                };
              }
            }
            return message;
          });

          return {
            ...conversation,
            messages,
          };
        });
      });
    },
    []
  );

  // Method to add AI suggestion
  const addAiSuggestion = useCallback(async () => {
    console.log('[AI Suggestion] Adding AI suggestion message');
    
    if (!activeConversation) {
      console.log('[AI Suggestion] No active conversation, cannot add suggestion');
      return;
    }

    // Get the active conversation object
    const conversation = conversations.find(c => c.id === activeConversation);
    if (!conversation) {
      console.log('[AI Suggestion] Active conversation not found');
      return;
    }

    // Get the last message in the conversation
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    if (!lastMessage) {
      console.log('[AI Suggestion] No messages in conversation to generate suggestion for');
      return;
    }

    try {
      // Create a temporary loading message - make sure it appears on the right side
      const loadingMessage: Message = {
        id: generateClientUUID(),
        content: "Generating AI suggestion...",
        sender: "me", // Changed from "ai" to "me" to appear on the right side
        type: "suggestion-loading",
        timestamp: new Date().toISOString(),
        reactions: [],
      };
      
      // Add the loading message to the conversation
      setConversations((prevConversations) => {
        return prevConversations.map((conv) => {
          if (conv.id === activeConversation) {
            return {
              ...conv,
              messages: [...conv.messages, loadingMessage],
            };
          }
          return conv;
        });
      });

      // Call the suggest API
      console.log('[AI Suggestion] Calling suggest API for thread:', conversation.threadId);
      const response = await fetch(`/api/emails/${conversation.threadId}/suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageId: lastMessage.id,
          threadId: conversation.threadId,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success || !data.suggestion) {
        throw new Error('No suggestion returned from API');
      }

      console.log('[AI Suggestion] Received suggestion from API:', {
        id: data.suggestion.id,
        contentPreview: data.suggestion.content.substring(0, 100) + '...',
        attachmentsCount: data.suggestion.attachments?.length || 0
      });

      // Create the real suggestion message
      const suggestionMessage: Message = {
        id: data.suggestion.id,
        content: data.suggestion.content,
        sender: "ai", // This should be "ai" to indicate it's from the AI
        type: "suggestion",
        timestamp: new Date().toISOString(),
        reactions: [],
        attachments: data.suggestion.attachments || [],
      };

      // First add the real suggestion message, then remove the loading message in two steps
      // Step 1: Add the real suggestion message
      setConversations((prevConversations) => {
        return prevConversations.map((conv) => {
          if (conv.id === activeConversation) {
            return {
              ...conv,
              messages: [...conv.messages, suggestionMessage],
            };
          }
          return conv;
        });
      });
      
      // Step 2: Remove the loading message after a short delay
      setTimeout(() => {
        setConversations((prevConversations) => {
          return prevConversations.map((conv) => {
            if (conv.id === activeConversation) {
              return {
                ...conv,
                messages: conv.messages.filter(msg => msg.id !== loadingMessage.id),
              };
            }
            return conv;
          });
        });
      }, 100); // Short delay to ensure the real message is rendered first
    } catch (error) {
      console.error('[AI Suggestion] Error generating suggestion:', error);
      
      // Remove the loading message and show an error
      setConversations((prevConversations) => {
        return prevConversations.map((conv) => {
          if (conv.id === activeConversation) {
            // Filter out the loading message
            const messages = conv.messages.filter(msg => 
              msg.type !== 'suggestion-loading'
            );
            
            // Add an error message
            const errorMessage: Message = {
              id: generateClientUUID(),
              content: `Failed to generate AI suggestion: ${error instanceof Error ? error.message : 'Unknown error'}`,
              sender: "system",
              type: "error",
              timestamp: new Date().toISOString(),
            };
            
            return {
              ...conv,
              messages: [...messages, errorMessage],
            };
          }
          return conv;
        });
      });
    }
  }, [activeConversation, conversations]);

  // Method to update conversation name
  const handleUpdateConversationName = useCallback(
    (name: string) => {
      setConversations((prevConversations) => {
        return prevConversations.map((conv) =>
          conv.id === activeConversation ? { ...conv, name } : conv
        );
      });
    },
    [activeConversation]
  );

  // Handle sound toggle
  const handleSoundToggle = useCallback(() => {
    soundEffects.toggleSound();
    setSoundEnabled(soundEffects.isEnabled());
  }, []);

  // Calculate total unread count
  const totalUnreadCount = conversations.reduce((total, conv) => {
    return total + (conv.unreadCount || 0);
  }, 0);

  // Add this useEffect after the other useEffects
  useEffect(() => {
    // Only navigate if we have an active conversation and we're not in new conversation mode
    if (activeConversation && !isNewConversation) {
      router.push(`/messages?id=${activeConversation}`);
    }
  }, [activeConversation, isNewConversation, router]);

  // Don't render until layout is initialized
  if (!isLayoutInitialized) {
    return null;
  }

  return (
    <div className="flex h-screen">
      <Sidebar
        conversations={conversations}
        activeConversation={activeConversation}
        onSelectConversation={selectConversation}
        onNewChat={() => {
          setIsNewConversation(true);
          setActiveConversation(null);
          router.push("/messages/new");
        }}
        onDeleteConversation={handleDeleteConversation}
        onUpdateConversation={handleUpdateConversation}
        isMobileView={isMobileView}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        typingStatus={typingStatus}
        isCommandMenuOpen={isCommandMenuOpen}
        onScroll={setIsScrolled}
        onSoundToggle={handleSoundToggle}
      >
        <Nav
          onNewChat={() => {
            setIsNewConversation(true);
            setActiveConversation(null);
            router.push("/messages/new");
          }}
          isMobileView={isMobileView}
          isScrolled={isScrolled}
        />
      </Sidebar>
      <div className="flex-1 flex flex-col">
        <ChatArea
          isNewChat={isNewConversation}
          activeConversation={
            activeConversation
              ? conversations.find((c) => c.id === activeConversation)
              : undefined
          }
          recipientInput={recipientInput}
          setRecipientInput={setRecipientInput}
          isMobileView={isMobileView}
          onBack={() => {
            setIsNewConversation(false);
            selectConversation(null);
          }}
          onSendMessage={handleSendMessage}
          onReaction={handleReaction}
          typingStatus={typingStatus}
          conversationId={activeConversation}
          onUpdateConversationRecipients={handleUpdateConversationRecipients}
          onCreateConversation={handleCreateConversation}
          onUpdateConversationName={handleUpdateConversationName}
          onHideAlertsChange={handleHideAlertsChange}
          messageDraft={
            isNewConversation
              ? messageDrafts["new"] || ""
              : messageDrafts[activeConversation || ""] || ""
          }
          onMessageDraftChange={handleMessageDraftChange}
          unreadCount={totalUnreadCount}
          onAddAiSuggestion={addAiSuggestion}
        />
      </div>
      <CommandMenu
        ref={commandMenuRef}
        conversations={conversations}
        activeConversation={activeConversation}
        onSelectConversation={selectConversation}
        onNewChat={() => {
          setIsNewConversation(true);
          setActiveConversation(null);
          router.push("/messages/new");
        }}
        onOpenChange={setIsCommandMenuOpen}
        soundEnabled={soundEnabled}
        onSoundToggle={handleSoundToggle}
        onDeleteConversation={handleDeleteConversation}
        onUpdateConversation={handleUpdateConversation}
      />
    </div>
  );
}
