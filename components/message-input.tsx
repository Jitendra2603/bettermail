import { Recipient } from "@/types";
import {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
  DragEvent,
  ClipboardEvent,
  useCallback,
  ChangeEvent,
  KeyboardEvent,
} from "react";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import { Icons } from "./icons";
import { useTheme } from "next-themes";
import { soundEffects } from "@/lib/sound-effects";
import { cn } from "@/lib/utils";
import { useFileUpload } from "@/hooks/use-file-upload";

interface MessageInputProps {
  message: string;
  setMessage: (value: string) => void;
  handleSend: () => void;
  disabled?: boolean;
  recipients: Recipient[];
  isMobileView?: boolean;
  conversationId?: string;
  isNewChat?: boolean;
  onFileUpload?: (files: File[]) => void;
  attachments?: File[];
}

// Export type for message input's focus method
export type MessageInputHandle = {
  focus: () => void;
};

// Forward ref component to expose focus method to parent
export const MessageInput = forwardRef<
  MessageInputHandle,
  Omit<MessageInputProps, "ref">
>(
  ({
    message,
    setMessage,
    handleSend,
    disabled = false,
    recipients,
    isMobileView = false,
    conversationId,
    isNewChat = false,
    onFileUpload,
    attachments = [],
  },
  ref
) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { theme } = useTheme();
  const [isDragging, setIsDragging] = useState(false);
  const { isUploading, error, uploadFile } = useFileUpload();

  // Handle text input change
  const handleTextChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    
    // Auto-resize the textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(200, Math.max(32, textarea.scrollHeight))}px`;
  }, [setMessage]);

  // Handle key press
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (message.trim()) {
        handleSend();
        if (textareaRef.current) {
          textareaRef.current.value = '';
          textareaRef.current.style.height = '32px';
        }
        soundEffects.playSentSound();
      }
    }
  }, [message, handleSend]);

  // Handle emoji selection
  const handleEmojiSelect = useCallback((emoji: any) => {
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart || 0;
      const end = textareaRef.current.selectionEnd || 0;
      const newMessage = 
        message.substring(0, start) + 
        emoji.native + 
        message.substring(end);
      
      setMessage(newMessage);
      
      // Set cursor position after the inserted emoji
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.selectionStart = start + emoji.native.length;
          textareaRef.current.selectionEnd = start + emoji.native.length;
        }
      }, 0);
    }
    setShowEmojiPicker(false);
  }, [message, setMessage]);

  // Handle file drop
  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      if (onFileUpload) {
        onFileUpload(files);
      }
    }
  }, [onFileUpload]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handlePaste = useCallback(async (e: ClipboardEvent<HTMLDivElement>) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      const files = Array.from(e.clipboardData.files);
      if (onFileUpload) {
        onFileUpload(files);
      }
    }
  }, [onFileUpload]);

  // Handle click outside to close emoji picker
  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (
      pickerRef.current &&
      !pickerRef.current.contains(event.target as Node) &&
      buttonRef.current &&
      !buttonRef.current.contains(event.target as Node)
    ) {
      setShowEmojiPicker(false);
    }
  }, []);

  // Handle escape key to close emoji picker
  const handleEscape = useCallback((event: globalThis.KeyboardEvent) => {
    if (event.key === "Escape") {
      setShowEmojiPicker(false);
    }
  }, []);

  // Expose focus method to parent component
  useImperativeHandle(ref, () => ({
    focus: () => {
      textareaRef.current?.focus();
    },
  }));

  // Effects
  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [handleClickOutside, handleEscape]);

  // Set initial height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '32px';
    }
  }, []);

  return (
    <div
      className={cn(
        "relative flex items-center w-full bg-background border-t border-border",
        isDragging && "bg-blue-50 dark:bg-blue-950"
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onPaste={handlePaste}
    >
      <div className="flex-1 flex items-center relative px-4 py-2">
        {/* Emoji picker */}
        <div className="relative">
          <button
            ref={buttonRef}
            type="button"
            className="p-1 rounded-full text-muted-foreground hover:bg-muted"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          >
            <Icons.smile className="h-5 w-5" />
          </button>
          {showEmojiPicker && (
            <div
              ref={pickerRef}
              className="absolute bottom-12 left-0 z-50 shadow-lg rounded-lg"
            >
              <Picker
                data={data}
                onEmojiSelect={handleEmojiSelect}
                theme={theme === "dark" ? "dark" : "light"}
                previewPosition="none"
              />
            </div>
          )}
        </div>

        {/* Message input */}
        <div className="flex-1 mx-2">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={disabled}
            className="w-full bg-background/80 border border-muted-foreground/20 rounded-[18px] px-4 py-2 text-base sm:text-sm focus:outline-none disabled:opacity-50 resize-none min-h-[32px] max-h-[200px]"
            style={{ overflow: 'hidden' }}
          />
        </div>

        {/* Send button */}
        <button
          type="button"
          className={cn(
            "p-1 rounded-full",
            message.trim()
              ? "text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950"
              : "text-muted-foreground hover:bg-muted"
          )}
          onClick={() => {
            if (message.trim()) {
              handleSend();
              if (textareaRef.current) {
                textareaRef.current.value = '';
                textareaRef.current.style.height = '32px';
              }
              soundEffects.playSentSound();
            }
          }}
          disabled={disabled || !message.trim()}
        >
          <Icons.send className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
});

MessageInput.displayName = "MessageInput";
