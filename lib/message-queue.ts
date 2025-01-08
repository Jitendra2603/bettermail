import { Conversation, Message } from "../types";
import { soundEffects } from "./sound-effects";

// Represents a task in the message queue
// Each task corresponds to a message that needs to be processed
type MessageTask = {
  id: string;
  conversation: Conversation;
  isFirstMessage: boolean;
  priority: number;
  timestamp: number;
  abortController: AbortController;
  consecutiveAiMessages: number;
  conversationVersion: number; // Add version tracking
};

// Represents the current state of the message queue
type MessageQueueState = {
  status: "idle" | "processing";
  currentTask: MessageTask | null;
  tasks: MessageTask[];
};

// Callback functions for handling various queue events
type MessageQueueCallbacks = {
  onMessageGenerated: (conversationId: string, message: Message) => void;
  onTypingStatusChange: (
    conversationId: string | null,
    recipient: string | null
  ) => void;
  onError: (error: Error) => void;
  onMessageUpdated?: (
    conversationId: string,
    messageId: string,
    updates: Partial<Message>
  ) => void;
};

// Maximum number of consecutive AI messages allowed to prevent infinite loops
const MAX_CONSECUTIVE_AI_MESSAGES = 5;

//  MessageQueue class manages the processing of chat messages with priority handling
//  It ensures messages are processed in order and handles both user and AI messages
export class MessageQueue {
  private state: MessageQueueState = {
    status: "idle",
    currentTask: null,
    tasks: [],
  };
  private callbacks: MessageQueueCallbacks;
  private activeConversation: string | null = null;
  private conversationVersion: number = 0; // Add version counter
  private userMessageDebounceTimeout: NodeJS.Timeout | null = null;
  private pendingUserMessages: Conversation | null = null;

  //  Initializes the MessageQueue instance with callback functions
  constructor(callbacks: MessageQueueCallbacks) {
    this.callbacks = callbacks;
  }

  //  Adds a user message to the queue with highest priority
  //  Cancels all pending AI messages when a user sends a message
  public enqueueUserMessage(conversation: Conversation) {
    // Cancel all pending AI messages when user sends a message
    this.cancelAllTasks();

    // Clear any existing debounce timeout
    if (this.userMessageDebounceTimeout) {
      clearTimeout(this.userMessageDebounceTimeout);
    }

    // Store or update pending messages
    this.pendingUserMessages = conversation;

    // Debounce user messages to wait for potential follow-up messages
    this.userMessageDebounceTimeout = setTimeout(() => {
      if (this.pendingUserMessages) {
        this.conversationVersion++;

        const task: MessageTask = {
          id: crypto.randomUUID(),
          conversation: this.pendingUserMessages,
          isFirstMessage: false,
          priority: 100,
          timestamp: Date.now(),
          abortController: new AbortController(),
          consecutiveAiMessages: 0,
          conversationVersion: this.conversationVersion,
        };

        this.pendingUserMessages = null;
        this.addTask(task);
      }
    }, 500); // Wait 500ms for potential follow-up messages
  }

  // Adds an AI message to the queue with normal priority
  // Tracks and limits consecutive AI messages to prevent infinite loops
  public enqueueAIMessage(
    conversation: Conversation,
    isFirstMessage: boolean = false
  ) {
    // Count consecutive AI messages
    let consecutiveAiMessages = 0;
    for (let i = conversation.messages.length - 1; i >= 0; i--) {
      if (conversation.messages[i].sender !== "me") {
        consecutiveAiMessages++;
      } else {
        break;
      }
    }

    // Don't add more AI messages if we've reached the limit
    if (consecutiveAiMessages >= MAX_CONSECUTIVE_AI_MESSAGES) {
      return;
    }

    const task: MessageTask = {
      id: crypto.randomUUID(),
      conversation,
      isFirstMessage,
      priority: 50, // Normal priority for AI messages
      timestamp: Date.now(),
      abortController: new AbortController(),
      consecutiveAiMessages,
      conversationVersion: this.conversationVersion, // Use current version
    };

    this.addTask(task);
  }

  // Adds a new task to the queue and sorts tasks by priority and timestamp
  // Triggers processing if the queue is idle
  private addTask(task: MessageTask) {
    this.state.tasks.push(task);
    this.state.tasks.sort((a, b) => {
      // Sort by priority first, then by timestamp
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.timestamp - b.timestamp;
    });

    if (this.state.status === "idle") {
      this.processNextTask();
    }
  }

  // Processes the next task in the queue
  // Handles API calls, typing indicators, and message generation
  private async processNextTask() {
    if (this.state.status === "processing" || this.state.tasks.length === 0) {
      return;
    }

    this.state.status = "processing";
    const task = this.state.tasks.shift()!;
    this.state.currentTask = task;

    try {
      // Check if this task belongs to an outdated conversation version
      if (task.conversationVersion < this.conversationVersion) {
        // Skip processing outdated tasks
        this.state.status = "idle";
        this.processNextTask();
        return;
      }

      // Decide if this should be the last message
      const isGroupChat = task.conversation.recipients.length > 1;
      const shouldWrapUp = task.consecutiveAiMessages === MAX_CONSECUTIVE_AI_MESSAGES - 1; 
      
      // Make API request
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: task.conversation.recipients,
          messages: task.conversation.messages,
          shouldWrapUp,
          isFirstMessage: task.isFirstMessage,
          isOneOnOne: task.conversation.recipients.length === 1,
          shouldReact: Math.random() < 0.5,
        }),
        signal: task.abortController.signal,
      });

      if (!response.ok) {
        throw new Error("Failed to fetch");
      }

      const data = await response.json();

      // If there's a reaction in the response, add it to the last message
      if (data.reaction && task.conversation.messages.length > 0) {
        const lastMessage =
          task.conversation.messages[task.conversation.messages.length - 1];
        if (!lastMessage.reactions) {
          lastMessage.reactions = [];
        }
        lastMessage.reactions.push({
          type: data.reaction,
          sender: data.sender,
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        });

        // Play reaction sound effect when AI adds a reaction
        soundEffects.playReactionSound();

        // Use onMessageUpdated callback to update just the reactions
        if (this.callbacks.onMessageUpdated) {
          this.callbacks.onMessageUpdated(
            task.conversation.id,
            lastMessage.id,
            {
              reactions: lastMessage.reactions,
            }
          );
        }

        // Delay to show reaction before typing animation
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // Start typing animation and delay for the content
      const typingDelay = task.priority === 100 ? 4000 : 7000; // Faster for user responses
      this.callbacks.onTypingStatusChange(task.conversation.id, data.sender);
      await new Promise((resolve) =>
        setTimeout(resolve, typingDelay + Math.random() * 2000)
      );

      if (task.abortController.signal.aborted) {
        return;
      }

      // Create new message
      const newMessage: Message = {
        id: crypto.randomUUID(),
        content: data.content,
        sender: data.sender,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      // Notify of new message
      this.callbacks.onMessageGenerated(task.conversation.id, newMessage);

      // Clear typing status
      this.callbacks.onTypingStatusChange(null, null);

      // Only continue if we didn't signal this as the last message
      if (!shouldWrapUp) {
        const updatedConversation = {
          ...task.conversation,
          messages: [...task.conversation.messages, newMessage],
        };

        // Add a small delay before the next AI message
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Only queue next AI message if we're still on the same conversation version
        if (
          !task.abortController.signal.aborted &&
          task.conversationVersion === this.conversationVersion &&
          isGroupChat
        ) {
          const lastAiSender = data.sender;
          const otherRecipients = task.conversation.recipients.filter(
            (r) => r !== lastAiSender
          );
          if (otherRecipients.length > 0) {
            const updatedConversationWithNextSender = {
              ...updatedConversation,
              recipients: otherRecipients,
            };
            this.enqueueAIMessage(updatedConversationWithNextSender);
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name !== "AbortError") {
          console.error("Error processing task:", {
            taskId: task.id,
            error: error.message,
          });
          this.callbacks.onError(error);
        }
      }
    } finally {
      this.state.status = "idle";
      this.state.currentTask = null;
      this.processNextTask(); // Process next task if available
    }
  }

  // Cancels all tasks in the queue and resets the queue state
  public cancelAllTasks() {
    // Cancel current task if exists
    if (this.state.currentTask) {
      this.state.currentTask.abortController.abort();
    }

    // Cancel all pending tasks
    for (const task of this.state.tasks) {
      task.abortController.abort();
    }

    // Clear the queue
    this.state.tasks = [];
    this.state.status = "idle";
    this.state.currentTask = null;

    // Clear typing status
    this.callbacks.onTypingStatusChange(null, null);
  }

  setActiveConversation(conversationId: string | null) {
    this.activeConversation = conversationId;
  }

  getActiveConversation(): string | null {
    return this.activeConversation;
  }
}