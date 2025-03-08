"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/nav";
import { Sidebar } from "@/components/sidebar";
import { ChatArea } from "@/components/chat-area";
import { Message, Conversation, Recipient, Reaction } from "@/types";
import { generateClientUUID } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWebSocket, WebSocketMessage } from "@/hooks/use-websocket";
import { saveChat, saveMessage, getChatMessages, getUserChats, updateTypingStatus } from "@/lib/firebase-chat";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { motion } from "framer-motion";

// Define FileAttachment type
interface FileAttachment {
  url: string;
  filename: string;
  mimeType: string;
  uploading?: boolean;
}

// Local storage key for chats
const STORAGE_KEY = "fast-chats";

interface ChatAppProps {
  initialChatId?: string | null;
}

export function ChatApp({ initialChatId }: ChatAppProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const isMobileView = useMediaQuery("(max-width: 768px)");
  
  // State for chats
  const [chats, setChats] = useState<Conversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(initialChatId || null);
  const [isNewChat, setIsNewChat] = useState(false);
  const [recipientInput, setRecipientInput] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [typingStatus, setTypingStatus] = useState<{ conversationId: string; recipient: string } | null>(null);
  const [showSidebar, setShowSidebar] = useState(!isMobileView);
  
  // New chat dialog state
  const [isNewChatDialogOpen, setIsNewChatDialogOpen] = useState(false);
  const [newChatName, setNewChatName] = useState("");
  const [newChatRecipients, setNewChatRecipients] = useState("");
  
  // Refs
  const lastTypingRef = useRef<Record<string, number>>({});
  
  // WebSocket connection
  const { 
    connected, 
    messages: wsMessages, 
    sendMessage: sendWsMessage,
    joinRoom,
    leaveRoom
  } = useWebSocket();

  // Load chats from local storage on initial render
  useEffect(() => {
    const savedChats = localStorage.getItem(STORAGE_KEY);
    if (savedChats) {
      try {
        const parsedChats = JSON.parse(savedChats);
        setChats(parsedChats);
      } catch (error) {
        console.error("Failed to parse saved chats:", error);
      }
    }
  }, []);

  // Handle WebSocket messages
  useEffect(() => {
    if (!wsMessages.length) return;
    
    const latestMessage = wsMessages[wsMessages.length - 1];
    
    // Process the message
    if (latestMessage.type === 'chat_message') {
      const { chatId, message, sender } = latestMessage.data;
      
      // Add message to the appropriate chat
      setChats(prevChats => {
        return prevChats.map(chat => {
          if (chat.id === chatId) {
            // Create a new message object
            const newMessage: Message = {
              id: message.id || generateClientUUID(),
              content: message.content,
              sender: sender.id === session?.user?.id ? 'me' : sender.name,
              timestamp: message.timestamp || new Date().toISOString(),
              reactions: [],
            };
            
            return {
              ...chat,
              messages: [...chat.messages, newMessage],
              updatedAt: new Date().toISOString(),
            };
          }
          return chat;
        });
      });
    } else if (latestMessage.type === 'typing_status') {
      const { chatId, user, isTyping } = latestMessage.data;
      
      if (isTyping && user.id !== session?.user?.id) {
        setTypingStatus({
          conversationId: chatId,
          recipient: user.name
        });
      } else {
        setTypingStatus(null);
      }
    }
  }, [wsMessages, session?.user?.id]);

  // Join the active chat room when it changes
  useEffect(() => {
    if (!connected || !activeChatId) return;
    
    // Join the new room
    joinRoom(activeChatId);
    
    // Clean up when component unmounts or active chat changes
    return () => {
      if (activeChatId) {
        leaveRoom(activeChatId);
      }
    };
  }, [connected, activeChatId, joinRoom, leaveRoom]);

  // Update URL when active chat changes
  useEffect(() => {
    if (activeChatId) {
      router.push(`/chat?id=${activeChatId}`);
    } else if (!isNewChat) {
      router.push('/chat');
    }
  }, [activeChatId, isNewChat, router]);

  // Handle sending a message
  const handleSendMessage = useCallback(
    async (message: string, chatId?: string, attachments: { url: string; filename: string; mimeType: string; }[] = []) => {
      if (!message.trim() && attachments.length === 0) return;
      
      const targetChatId = chatId || activeChatId;
      
      if (!targetChatId && !isNewChat) {
        console.error("No active chat to send message to");
        toast.error("Please select or create a chat first");
        
        // Open the new chat dialog instead of just setting isNewChat
        handleNewChat();
        return;
      }
      
      // If it's a new chat, create it first
      if (isNewChat) {
        // Parse recipients from input
        const recipients = recipientInput
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean)
          .map((name) => ({
            id: generateClientUUID(),
            name,
            email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`, // Mock email for demo
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`, // Generate avatar
          }));
        
        if (recipients.length === 0) {
          console.error("No recipients specified for new chat");
          toast.error("Please add at least one recipient");
          return;
        }
        
        // Add the current user as a recipient if they're not already included
        const currentUserName = session?.user?.name || "Me";
        const currentUserEmail = session?.user?.email || "me@example.com";
        if (!recipients.some(r => r.email === currentUserEmail)) {
          recipients.push({
            id: generateClientUUID(),
            name: currentUserName,
            email: currentUserEmail,
            avatar: session?.user?.image || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUserName}`,
          });
        }
        
        // Create new chat
        const newChatId = generateClientUUID();
        const newChat: Conversation = {
          id: newChatId,
          name: recipients.map(r => r.name).join(", "),
          recipients,
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          unreadCount: 0,
          pinned: false,
          hideAlerts: false,
        };
        
        // Add new chat to state
        setChats((prev) => {
          const updated = [newChat, ...prev];
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          return updated;
        });
        
        // Save chat to Firebase
        try {
          await saveChat(newChat);
        } catch (error) {
          console.error("Error saving chat to Firebase:", error);
          // Continue anyway - we'll use local storage as fallback
        }
        
        // Create a new message
        const newMessage: Message = {
          id: generateClientUUID(),
          content: message,
          sender: "me",
          timestamp: new Date().toISOString(),
          attachments: attachments.map(a => ({
            ...a,
            uploading: false
          })),
          reactions: [],
        };
        
        // Add message to chat
        setChats((prev) => {
          return prev.map((chat) => {
            if (chat.id === newChatId) {
              return {
                ...chat,
                messages: [...chat.messages, newMessage],
                updatedAt: new Date().toISOString(),
              };
            }
            return chat;
          });
        });
        
        // Save message to Firebase
        try {
          await saveMessage(newMessage, newChatId, session?.user?.email || "");
        } catch (error) {
          console.error("Error saving message to Firebase:", error);
          // Continue anyway - we'll use local storage as fallback
        }
        
        // Send message via WebSocket
        if (connected) {
          sendWsMessage({
            type: "chat_message",
            data: {
              chatId: newChatId,
              message: {
                id: newMessage.id,
                content: message,
                timestamp: newMessage.timestamp,
              },
              sender: {
                id: session?.user?.id,
                name: session?.user?.name || "Me",
                email: session?.user?.email,
                avatar: session?.user?.image,
              },
              attachments: newMessage.attachments,
            },
          });
        }
        
        // Set as active chat
        setActiveChatId(newChatId);
        setIsNewChat(false);
        
        // Join the chat room
        if (connected) {
          joinRoom(newChatId);
        }
      } 
      // If it's an existing chat
      else if (targetChatId) {
        // Create a new message
        const newMessage: Message = {
          id: generateClientUUID(),
          content: message,
          sender: "me",
          timestamp: new Date().toISOString(),
          attachments: attachments.map(a => ({
            ...a,
            uploading: false
          })),
          reactions: [],
        };
        
        // Add message to chat
        setChats((prev) => {
          return prev.map((chat) => {
            if (chat.id === targetChatId) {
              return {
                ...chat,
                messages: [...chat.messages, newMessage],
                updatedAt: new Date().toISOString(),
              };
            }
            return chat;
          });
        });
        
        // Save message to Firebase
        try {
          await saveMessage(newMessage, targetChatId, session?.user?.email || "");
        } catch (error) {
          console.error("Error saving message to Firebase:", error);
          // Continue anyway - we'll use local storage as fallback
        }
        
        // Send message via WebSocket
        if (connected) {
          sendWsMessage({
            type: "chat_message",
            data: {
              chatId: targetChatId,
              message: {
                id: newMessage.id,
                content: message,
                timestamp: newMessage.timestamp,
              },
              sender: {
                id: session?.user?.id,
                name: session?.user?.name || "Me",
                email: session?.user?.email,
                avatar: session?.user?.image,
              },
              attachments: newMessage.attachments,
            },
          });
        }
      }
      
      // Clear message draft
      setMessageDraft("");
      
      // Clear typing status
      if (targetChatId && connected) {
        sendWsMessage({
          type: "typing_status",
          data: {
            chatId: targetChatId,
            user: {
              id: session?.user?.id,
              name: session?.user?.name || 'Unknown User',
              email: session?.user?.email,
            },
            isTyping: false,
          },
        });
        
        // Update typing status in Firebase
        try {
          updateTypingStatus(targetChatId, session?.user?.email || "", false);
        } catch (error) {
          console.error("Error updating typing status in Firebase:", error);
        }
      }
    },
    [
      activeChatId,
      isNewChat,
      recipientInput,
      connected,
      sendWsMessage,
      session?.user?.id,
      session?.user?.name,
      session?.user?.email,
      session?.user?.image,
      joinRoom,
    ]
  );

  // Handle starting a new chat
  const handleNewChat = () => {
    setIsNewChat(true);
    setActiveChatId(null);
    setRecipientInput("");
    setMessageDraft("");
    
    // Open the new chat dialog
    setIsNewChatDialogOpen(true);
    
    // Set default values for new chat
    setNewChatName("");
    setNewChatRecipients("");
  };

  // Handle creating a new chat from the dialog
  const handleCreateNewChat = () => {
    // Parse recipients from input
    const recipients = newChatRecipients
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({
        id: generateClientUUID(),
        name,
      }));
    
    // Add the current user as a recipient if they're not already included
    const currentUserName = session?.user?.name || "Me";
    if (!recipients.some(r => r.name === currentUserName)) {
      recipients.push({
        id: generateClientUUID(),
        name: currentUserName,
      });
    }
    
    // Create new chat
    const newChatId = generateClientUUID();
    const chatName = newChatName.trim() || recipients.map(r => r.name).join(", ");
    
    const newChat: Conversation = {
      id: newChatId,
      name: chatName,
      recipients,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      unreadCount: 0,
      pinned: false,
      hideAlerts: false,
    };
    
    // Add new chat to state
    setChats((prev) => {
      const updated = [newChat, ...prev];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
    
    // Select the new chat
    setActiveChatId(newChatId);
    setIsNewChat(false);
    setIsNewChatDialogOpen(false);
    
    // Join the chat room
    if (connected) {
      joinRoom(newChatId);
    }
    
    toast.success("New chat created!");
  };

  // Handle updating chat recipients
  const handleUpdateChatRecipients = (chatId: string, recipients: Recipient[]) => {
    setChats((prev) => {
      const updated = prev.map((chat) => {
        if (chat.id === chatId) {
          return {
            ...chat,
            recipients,
            name: recipients.map(r => r.name).join(", "),
          };
        }
        return chat;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  // Handle updating chat name
  const handleUpdateChatName = (chatId: string, name: string) => {
    setChats((prev) => {
      const updated = prev.map((chat) => {
        if (chat.id === chatId) {
          return {
            ...chat,
            name,
          };
        }
        return chat;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  // Handle message draft changes and typing status
  const handleMessageDraftChange = (chatId: string, message: string) => {
    setMessageDraft(message);
    
    // Send typing status via WebSocket
    if (connected && chatId) {
      // Debounce typing status updates
      const now = Date.now();
      const lastTypingTime = lastTypingRef.current[chatId] || 0;
      
      if (now - lastTypingTime > 2000) { // Send typing status every 2 seconds
        lastTypingRef.current[chatId] = now;
        
        const isTyping = message.trim().length > 0;
        
        sendWsMessage({
          type: "typing_status",
          data: {
            chatId,
            user: {
              id: session?.user?.id,
              name: session?.user?.name || 'Unknown User',
              email: session?.user?.email,
            },
            isTyping,
          },
        });
        
        // Update typing status in Firebase
        try {
          updateTypingStatus(chatId, session?.user?.email || "", isTyping);
        } catch (error) {
          console.error("Error updating typing status in Firebase:", error);
        }
      }
    }
  };

  // Handle reactions
  const handleReaction = (messageId: string, reaction: Reaction) => {
    setChats((prev) => {
      const updated = prev.map((chat) => {
        if (chat.id === activeChatId) {
          return {
            ...chat,
            messages: chat.messages.map((msg) => {
              if (msg.id === messageId) {
                // Check if reaction already exists
                const existingReactionIndex = msg.reactions?.findIndex(
                  (r) => r.type === reaction.type && r.sender === reaction.sender
                );
                
                let updatedReactions = msg.reactions || [];
                
                if (existingReactionIndex !== -1 && existingReactionIndex !== undefined) {
                  // Remove existing reaction
                  updatedReactions = updatedReactions.filter(
                    (_, i) => i !== existingReactionIndex
                  );
                } else {
                  // Add new reaction
                  updatedReactions = [...updatedReactions, reaction];
                }
                
                return {
                  ...msg,
                  reactions: updatedReactions,
                };
              }
              return msg;
            }),
          };
        }
        return chat;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
    
    // Send reaction via WebSocket
    if (connected && activeChatId) {
      sendWsMessage({
        type: 'reaction',
        data: {
          chatId: activeChatId,
          messageId,
          reaction: {
            type: reaction.type,
            sender: reaction.sender,
            timestamp: reaction.timestamp,
          },
          user: {
            id: session?.user?.id,
            name: session?.user?.name || 'Unknown User',
          },
        },
      });
    }
  };

  // Handle selecting a chat
  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    setIsNewChat(false);
    
    // Join the chat room
    if (connected) {
      joinRoom(chatId);
    }
  };

  // Get active chat data
  const activeChatData = activeChatId
    ? chats.find((chat) => chat.id === activeChatId)
    : undefined;

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      {showSidebar && (
        <Sidebar
          conversations={chats}
          activeConversation={activeChatId}
          onSelectConversation={handleSelectChat}
          onDeleteConversation={(id) => {
            setChats((prev) => {
              const updated = prev.filter((chat) => chat.id !== id);
              localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
              return updated;
            });
            if (activeChatId === id) {
              setActiveChatId(null);
            }
          }}
          onUpdateConversation={(updatedChats) => {
            setChats(updatedChats);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedChats));
          }}
          onNewChat={handleNewChat}
          isMobileView={isMobileView}
          searchTerm=""
          onSearchChange={() => {}}
          typingStatus={typingStatus}
          isCommandMenuOpen={false}
          onSoundToggle={() => {}}
        >
          {/* Sidebar content */}
          <div className="p-4">
            <h2 className="text-xl font-bold">Fast Chat</h2>
          </div>
        </Sidebar>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <ChatArea
          isNewChat={isNewChat}
          activeConversation={activeChatData}
          recipientInput={recipientInput}
          setRecipientInput={setRecipientInput}
          isMobileView={isMobileView}
          onBack={() => setShowSidebar(true)}
          onSendMessage={handleSendMessage}
          onReaction={handleReaction}
          typingStatus={typingStatus}
          conversationId={activeChatId}
          onUpdateConversationRecipients={handleUpdateChatRecipients}
          onUpdateConversationName={handleUpdateChatName}
          messageDraft={messageDraft}
          onMessageDraftChange={handleMessageDraftChange}
        />
      </div>

      {/* New Chat Dialog */}
      <Dialog open={isNewChatDialogOpen} onOpenChange={setIsNewChatDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New Chat</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="chat-name">Group Name (optional)</Label>
              <Input
                id="chat-name"
                placeholder="Enter group name"
                value={newChatName}
                onChange={(e) => setNewChatName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to use participant names
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recipients">Participants (comma separated)</Label>
              <Input
                id="recipients"
                placeholder="name1@example.com, name2@example.com"
                value={newChatRecipients}
                onChange={(e) => setNewChatRecipients(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                You will be automatically added to the chat
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewChatDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateNewChat} disabled={!newChatRecipients.trim()}>
              Create Chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 