import { Sidebar } from "./sidebar";
import { ChatArea } from "./chat-area";
import { useState, useEffect, useRef } from "react";
import { Nav } from "./nav";
import { Conversation, Message } from "../types";
import { v4 as uuidv4 } from "uuid";
import { initialConversations } from "../data/initial-conversations";
import { MessageQueue } from "../lib/message-queue";

export default function App() {
  // State
  const [isNewConversation, setIsNewConversation] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({});
  const [recipientInput, setRecipientInput] = useState("");
  const [isMobileView, setIsMobileView] = useState(false);
  const [isLayoutInitialized, setIsLayoutInitialized] = useState(false);
  const [typingStatus, setTypingStatus] = useState<{
    conversationId: string;
    recipient: string;
  } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Initialize message queue
  const messageQueue = useRef<MessageQueue>(new MessageQueue({
    onMessageGenerated: (conversationId: string, message: Message) => {
      handleIncomingMessage(conversationId, message);
    },
    onTypingStatusChange: (conversationId: string | null, recipient: string | null) => {
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
  }));

  // Method to handle incoming AI message and manage unread state
  const handleIncomingMessage = (
    conversationId: string, 
    message: Message, 
    isAIMessage: boolean = false
  ) => {
    // Update conversations with new message
    setConversations(prev => 
      prev.map(conversation => {
        if (conversation.id !== conversationId) return conversation;

        // Determine if the message should increment unread count
        // For AI messages, only increment if it's not the active conversation
        // For non-AI messages, increment if not from the user and not in active conversation
        const shouldIncrementUnread = 
          conversationId !== activeConversation && 
          (isAIMessage || message.sender !== "me") &&
          // Ensure we don't increment for messages already in the conversation
          !conversation.messages.some(m => m.id === message.id);

        return {
          ...conversation,
          messages: conversation.messages.some(m => m.id === message.id)
            ? conversation.messages
            : [...conversation.messages, message],
          lastMessageTime: new Date().toISOString(),
          unreadCount: shouldIncrementUnread 
            ? (conversation.unreadCount || 0) + 1 
            : conversation.unreadCount
        };
      })
    );
  };

  // Method to reset unread count when conversation is selected
  const resetUnreadCount = (conversationId: string) => {
    setConversations(prev => 
      prev.map(conversation => 
        conversation.id === conversationId
          ? { ...conversation, unreadCount: 0 }
          : conversation
      )
    );
  };

  // Method to update conversation recipients
  const updateConversationRecipients = (
    conversationId: string, 
    recipientNames: string[]
  ) => {
    setConversations(prev => {
      const currentConversation = prev.find(conv => conv.id === conversationId);
      if (!currentConversation) return prev;

      // Find added and removed recipients
      const currentNames = currentConversation.recipients.map(r => r.name);
      const added = recipientNames.filter(name => !currentNames.includes(name));
      const removed = currentNames.filter(name => !recipientNames.includes(name));

      // Create system messages (one for each change)
      const systemMessages: Message[] = [];
      
      // Format timestamp
      const timestamp = new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      removed.forEach(name => {
        systemMessages.push({
          id: uuidv4(),
          content: `${timestamp}\n${name} was removed from the conversation`,
          sender: "system",
          timestamp
        });
      });

      added.forEach(name => {
        systemMessages.push({
          id: uuidv4(),
          content: `${timestamp}\n${name} was added to the conversation`,
          sender: "system",
          timestamp
        });
      });

      // Find the recipient IDs for the given names
      const newRecipients = recipientNames.map(name => {
        const existingRecipient = currentConversation.recipients.find(r => r.name === name);
        return existingRecipient || {
          id: uuidv4(),
          name: name,
        };
      });

      return prev.map(conversation => 
        conversation.id === conversationId
          ? {
              ...conversation,
              recipients: newRecipients,
              messages: [...conversation.messages, ...systemMessages],
            }
          : conversation
      );
    });
  };

  // Method to handle message draft changes
  const handleMessageDraftChange = (conversationId: string, message: string) => {
    setMessageDrafts(prev => ({
      ...prev,
      [conversationId]: message
    }));
  };

  // Method to clear message draft after sending
  const clearMessageDraft = (conversationId: string) => {
    setMessageDrafts(prev => {
      const newDrafts = { ...prev };
      delete newDrafts[conversationId];
      return newDrafts;
    });
  };

  // Method to extract plain text from HTML content while preserving mentions
  const extractMessageContent = (htmlContent: string): string => {
    const temp = document.createElement('div');
    temp.innerHTML = htmlContent;
    return temp.textContent || '';
  };

  // Method to handle message sending
  const handleSendMessage = async (messageHtml: string, conversationId?: string) => {
    const messageText = extractMessageContent(messageHtml);
    if (!messageText.trim()) return;

    // Create a new conversation if no conversation ID is provided or in new conversation mode
    if (!conversationId || isNewConversation) {
      // Validate recipients
      const recipients = recipientInput
        .split(",")
        .map((r) => r.trim())
        .filter((r) => r.length > 0)
        .map((name) => ({
          id: uuidv4(),
          name,
        }));

      if (recipients.length === 0) return;

      // Create new conversation object
      const newConversation: Conversation = {
        id: uuidv4(),
        recipients,
        messages: [],
        lastMessageTime: new Date().toISOString(),
        unreadCount: 0
      };

      // Create message object
      const message: Message = {
        id: uuidv4(),
        content: messageText,
        htmlContent: messageHtml,  
        sender: "me",
        timestamp: new Date().toISOString()
      };

      // Combine conversation with first message
      const conversationWithMessage = {
        ...newConversation,
        messages: [message],
        lastMessageTime: new Date().toISOString(),
        unreadCount: 0
      };

      // Update state in a single, synchronous update
      setConversations(prev => {
        const updatedConversations = [conversationWithMessage, ...prev];
        setActiveConversation(newConversation.id);
        setIsNewConversation(false);
        localStorage.setItem("dialogueConversations", JSON.stringify(updatedConversations));
        return updatedConversations;
      });

      window.history.pushState({}, "", `?id=${newConversation.id}`);
      messageQueue.current.enqueueAIMessage(conversationWithMessage, true);
      return;
    }

    // Handle existing conversation
    const conversation = conversations.find((c) => c.id === conversationId);
    if (!conversation) {
      console.error(`Conversation with ID ${conversationId} not found. Skipping message.`);
      return;
    }

    // Create message object
    const message: Message = {
      id: uuidv4(),
      content: messageText,
      htmlContent: messageHtml,  
      sender: "me",
      timestamp: new Date().toISOString()
    };

    // Update conversation with user message
    const updatedConversation = {
      ...conversation,
      messages: [...conversation.messages, message],
      lastMessageTime: new Date().toISOString(),
      unreadCount: 0
    };

    setConversations((prev) => {
      const updatedConversations = prev.map((c) => 
        c.id === conversationId ? updatedConversation : c
      );
      localStorage.setItem("dialogueConversations", JSON.stringify(updatedConversations));
      return updatedConversations;
    });

    setActiveConversation(conversationId);
    setIsNewConversation(false);
    window.history.pushState({}, "", `?id=${conversationId}`);
    messageQueue.current.enqueueUserMessage(updatedConversation);
    clearMessageDraft(conversationId);
  };

  // Get conversations from local storage
  useEffect(() => {
    const saved = localStorage.getItem("dialogueConversations");
    const urlParams = new URLSearchParams(window.location.search);
    const conversationId = urlParams.get("id");

    let allConversations: Conversation[] = [];

    // Start with initial conversations if there are no saved ones
    if (!saved) {
      allConversations = [...initialConversations];
    } else {
      try {
        // Load saved conversations
        const parsedConversations = JSON.parse(saved);
        
        // Validate parsed conversations
        if (!Array.isArray(parsedConversations)) {
          console.error("Saved conversations is not an array:", parsedConversations);
          allConversations = [...initialConversations];
        } else {
          allConversations = parsedConversations;

          // Check if we need to add any initial conversations
          const savedIds = new Set(allConversations.map((c: Conversation) => c.id));
          const missingInitialConvos = initialConversations.filter((c) => !savedIds.has(c.id));

          if (missingInitialConvos.length > 0) {
            allConversations = [...allConversations, ...missingInitialConvos];
          }
        }
      } catch (e) {
        console.error("Error parsing saved conversations:", e);
        allConversations = [...initialConversations];
      }
    }

    // Sort all conversations by last message time, most recent first
    allConversations.sort((a: Conversation, b: Conversation) => {
      return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime();
    });

    // Determine the initial active conversation
    const determineActiveConversation = () => {
      // Priority 1: URL parameter
      if (
        conversationId &&
        allConversations.some((c: Conversation) => c.id === conversationId)
      ) {
        return conversationId;
      }

      // Priority 2: Most recent conversation
      const mostRecentConvo = allConversations.length > 0
        ? allConversations[0]  // Since conversations are sorted, first is most recent
        : null;

      if (mostRecentConvo) {
        window.history.replaceState({}, "", `?id=${mostRecentConvo.id}`);
        return mostRecentConvo.id;
      }

      // Priority 3: First conversation if exists
      const fallbackConvo = allConversations.length > 0 ? allConversations[0].id : null;
      return fallbackConvo;
    };

    const initialActiveConversation = determineActiveConversation();
    
    // Ensure we always set an active conversation if conversations exist
    if (initialActiveConversation || allConversations.length > 0) {
      const conversationToActivate = initialActiveConversation || allConversations[0].id;

      setConversations(allConversations);
      setActiveConversation(conversationToActivate);
    } else {
      setConversations([]);
      setActiveConversation(null);
    }
  }, []);

  // Robust conversation selection method
  const selectConversation = (conversationId: string | null) => {
    // In mobile view, if no conversation is selected, return to sidebar
    if (isMobileView && conversationId === null) {
      // Reset unread count for the previous active conversation
      if (activeConversation) {
        setConversations(prev => 
          prev.map(conversation => 
            conversation.id === activeConversation
              ? { ...conversation, unreadCount: 0 }
              : conversation
          )
        );
      }

      setActiveConversation(null);
      setIsNewConversation(false);
      window.history.pushState({}, "", "/");
      return;
    }

    // If there's a currently active conversation, mark it as read
    if (activeConversation) {
      setConversations(prev => 
        prev.map(conversation => 
          conversation.id === activeConversation
            ? { ...conversation, unreadCount: 0 }
            : conversation
        )
      );
    }

    // If no conversation ID is provided, handle new conversation state
    if (conversationId === null) {
      setActiveConversation(null);
      setIsNewConversation(true);
      window.history.pushState({}, "", "/");
      return;
    }

    // Find the conversation in the list
    const selectedConversation = conversations.find(
      (conversation) => conversation.id === conversationId
    );

    // If conversation is not found, handle gracefully
    if (!selectedConversation) {
      console.error(`Conversation with ID ${conversationId} not found`);
      
      // Fallback to most recent conversation if available
      if (conversations.length > 0) {
        const fallbackConversation = conversations[0];
        
        // Reset unread count for fallback conversation
        resetUnreadCount(fallbackConversation.id);
        
        setActiveConversation(fallbackConversation.id);
        window.history.pushState({}, "", `?id=${fallbackConversation.id}`);
        return;
      }

      // If no conversations exist, reset to new conversation state
      setActiveConversation(null);
      setIsNewConversation(false);
      window.history.pushState({}, "", "/");
      return;
    }

    // Reset unread count for selected conversation
    resetUnreadCount(conversationId);

    // Successfully select the conversation
    setActiveConversation(conversationId);
    setIsNewConversation(false);
    window.history.pushState({}, "", `?id=${conversationId}`);
  };

  // Ensure active conversation remains valid
  useEffect(() => {
    if (activeConversation && !conversations.some(c => c.id === activeConversation)) {
      console.error("Active conversation no longer exists:", activeConversation);
      
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
  }, [conversations, activeConversation]);

  // Save user's conversations to local storage
  useEffect(() => {
    localStorage.setItem(
      "dialogueConversations",
      JSON.stringify(conversations)
    );
  }, [conversations]);

  // Set mobile view
  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 768);
    };

    handleResize();
    setIsLayoutInitialized(true);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Don't render until layout is initialized
  if (!isLayoutInitialized) {
    return null;
  }

  return (
    <main className="h-dvh w-full bg-background flex flex-col">
      <div className="flex-1 flex h-full">
        <div
          className={`h-full ${isMobileView ? "w-full" : ""} ${
            isMobileView && (activeConversation || isNewConversation)
              ? "hidden"
              : "block"
          }`}
        >
          <Sidebar
            conversations={conversations}
            activeConversation={activeConversation}
            onSelectConversation={selectConversation}
            isMobileView={isMobileView}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
          >
            <Nav
              onNewChat={() => {
                // First update the conversation state
                setIsNewConversation(true);
                setRecipientInput("");
                setActiveConversation(null);
                
                // For mobile, ensure URL is cleared
                if (isMobileView) {
                  window.history.pushState({}, "", window.location.pathname);
                }
              }}
            />
          </Sidebar>
        </div>
        <div
          className={`flex-1 h-full ${isMobileView ? "w-full" : ""} ${
            isMobileView && !activeConversation && !isNewConversation
              ? "hidden"
              : "block"
          }`}
        >
          <ChatArea
            isNewChat={isNewConversation}
            activeConversation={conversations.find(
              (c) => c.id === activeConversation
            )}
            recipientInput={recipientInput}
            setRecipientInput={setRecipientInput}
            isMobileView={isMobileView}
            onBack={() => selectConversation(null)}
            onSendMessage={handleSendMessage}
            typingStatus={typingStatus}
            conversationId={activeConversation}
            onUpdateConversationRecipients={updateConversationRecipients}
            messageDraft={messageDrafts[activeConversation || ""]}
            onMessageDraftChange={handleMessageDraftChange}
          />
        </div>
      </div>
    </main>
  );
}
