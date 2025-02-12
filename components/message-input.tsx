import { Recipient } from "@/types";
import {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
  DragEvent,
  ClipboardEvent,
} from "react";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import { Icons } from "./icons";
import { useTheme } from "next-themes";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import { SuggestionProps } from "@tiptap/suggestion";
import Placeholder from "@tiptap/extension-placeholder";
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
  const { theme } = useTheme();
  const [isDragging, setIsDragging] = useState(false);
  const { isUploading, error, uploadFile } = useFileUpload();

  // Tiptap editor definition
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Type a message...",
      }),
      Mention.configure({
        HTMLAttributes: {
          class: "mention-node",
          style: "color: #0A7CFF !important; font-weight: 500 !important;",
          onanimationend: 'this.classList.add("shimmer-done")',
        },
        renderText: ({ node }) => {
          // Try to find the recipient by ID to get their name
          const recipient = recipients.find((r) => r.id === node.attrs.id);
          return (
            recipient?.name.split(" ")[0] ?? node.attrs.label ?? node.attrs.id
          );
        },
        renderHTML: ({ node }) => {
          // Try to find the recipient by ID to get their name
          const recipient = recipients.find((r) => r.id === node.attrs.id);
          const label =
            recipient?.name.split(" ")[0] ?? node.attrs.label ?? node.attrs.id;
          return [
            "span",
            {
              "data-type": "mention",
              "data-id": node.attrs.id,
              "data-label": label,
              class: "mention-node",
              style: "color: #0A7CFF !important; font-weight: 500 !important;",
            },
            label,
          ];
        },
        suggestion: {
          items: ({ query }: { query: string }) => {
            if (!query) return [];

            const searchText = query.toLowerCase().replace(/^@/, "");
            return recipients
              .filter((recipient) => {
                const [firstName] = recipient.name.split(" ");
                return firstName.toLowerCase().startsWith(searchText);
              })
              .slice(0, 5)
              .map((match) => ({
                id: match.id,
                label: match.name.split(" ")[0],
              }));
          },
          render: () => {
            let component: {
              element: HTMLElement;
              update: (props: {
                items: Array<{ id: string; label: string }>;
                query: string;
                command: (attrs: { id: string; label: string }) => void;
              }) => void;
            };
            return {
              onStart: (props: SuggestionProps) => {
                const { editor } = props;
                component = {
                  element: document.createElement("div"),
                  update: (props) => {
                    if (!props.query) return;

                    const match = props.items.find(
                      (item) =>
                        item.label.toLowerCase() ===
                        props.query.toLowerCase().replace(/^@/, "")
                    );

                    if (match) {
                      const { tr } = editor.state;
                      const start = tr.selection.from - props.query.length - 1;
                      const end = tr.selection.from;
                      editor
                        .chain()
                        .focus()
                        .deleteRange({ from: start, to: end })
                        .insertContent([
                          {
                            type: "mention",
                            attrs: { id: match.id, label: match.label },
                          },
                        ])
                        .run();
                    }
                  },
                };
                return component;
              },
              onUpdate: (props: SuggestionProps) => {
                component?.update(props);
              },
              onExit: () => {
                component?.element.remove();
              },
            };
          },
          char: "@",
          allowSpaces: false,
          decorationClass: "suggestion",
        },
      }),
    ],
    content: message,
    autofocus: !isMobileView && !isNewChat ? "end" : false,
    onUpdate: ({ editor }) => {
      const element = editor.view.dom as HTMLElement;
      const height = Math.min(200, Math.max(32, element.scrollHeight));
      const containerHeight = height + 32; // Add padding (16px top + 16px bottom)
      document.documentElement.style.setProperty(
        "--dynamic-height",
        `${containerHeight}px`
      );
      setMessage(editor.getHTML());
    },
    onCreate: ({ editor }) => {
      if (!isMobileView && !isNewChat) {
        editor.commands.focus("end");
      }
    },
    editorProps: {
      attributes: {
        class:
          "w-full bg-background/80 border border-muted-foreground/20 rounded-[18px] pl-4 pr-8 py-1 text-base sm:text-sm focus:outline-none disabled:opacity-50 prose-sm prose-neutral dark:prose-invert prose flex items-center",
        enterKeyHint: "send",
        style: "min-height: 32px; max-height: 200px; overflow-y: hidden;",
      },
      handleKeyDown: (view, event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          handleSubmit();
          if (isMobileView) {
            view.dom.blur();
          }
          return true;
        }
        return false;
      },
    },
    immediatelyRender: false,
  });

  const handleSubmit = () => {
    handleSend();
    soundEffects.playSentSound();
  };

  // Expose focus method to parent through ref
  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        // Focus editor at end of content
        if (editor) {
          editor.commands.focus("end");
        }
      },
    }),
    [editor]
  );

  // Effects
  // Update editor content when message changes
  useEffect(() => {
    if (editor && message !== editor.getHTML()) {
      editor.commands.setContent(message);
    }
  }, [message, editor, isMobileView, disabled, conversationId]);

  // Destroy editor when switching to new chat
  useEffect(() => {
    const isNewChat = conversationId === undefined;
    const shouldDestroyEditor = editor && !isNewChat;

    if (shouldDestroyEditor) {
      editor.destroy();
    }
  }, [conversationId]);

  // Focus editor at end of content
  useEffect(() => {
    if (editor && conversationId && !isMobileView && !isNewChat) {
      editor.commands.focus("end");
    }
  }, [editor, conversationId, isMobileView, isNewChat]);

  // Reset editor height when message is cleared (e.g. after sending)
  useEffect(() => {
    if (message === "") {
      const element = editor?.view.dom as HTMLElement;
      if (element) {
        element.style.height = "32px";
        document.documentElement.style.setProperty("--dynamic-height", "64px");
      }
    }
  }, [message, editor]);

  // Handle blur with click outside and escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        pickerRef.current &&
        buttonRef.current &&
        !pickerRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showEmojiPicker) {
          setShowEmojiPicker(false);
        } else if (editor) {
          editor.commands.blur();
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showEmojiPicker, editor]);

  // Handle file drop
  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const uploadedFiles: File[] = [];
      for (const file of files) {
        const result = await uploadFile(file);
        if (result) {
          uploadedFiles.push(file);
        }
      }
      if (uploadedFiles.length > 0 && onFileUpload) {
        onFileUpload([...attachments, ...uploadedFiles]);
      }
    }
  };

  // Handle file paste
  const handlePaste = async (e: ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length > 0) {
      const uploadedFiles: File[] = [];
      for (const file of files) {
        const result = await uploadFile(file);
        if (result) {
          uploadedFiles.push(file);
        }
      }
      if (uploadedFiles.length > 0 && onFileUpload) {
        onFileUpload([...attachments, ...uploadedFiles]);
      }
    }
  };

  // Handle drag events
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  return (
    <div
      className={cn(
        "w-full bg-background/50 backdrop-blur-md",
        isDragging && "ring-2 ring-primary",
        isUploading && "opacity-50 cursor-not-allowed"
      )}
      style={{ height: "var(--dynamic-height, 64px)" }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onPaste={handlePaste}
    >
      <div className="flex gap-2 p-4 h-full">
        <div className="relative w-full">
          {error && (
            <div className="absolute bottom-full mb-2 left-0 right-0 p-2 bg-destructive/10 text-destructive text-sm rounded-lg">
              {error}
            </div>
          )}
          {attachments.length > 0 && (
            <div className="absolute bottom-full mb-2 left-0 right-0 flex flex-wrap gap-2 p-2 bg-background/80 backdrop-blur-md rounded-lg border border-border">
              {attachments.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 bg-muted p-2 rounded-md"
                >
                  <span className="text-sm truncate max-w-[200px]">
                    {file.name}
                  </span>
                  <button
                    onClick={() => {
                      const newAttachments = [...attachments];
                      newAttachments.splice(index, 1);
                      onFileUpload?.(newAttachments);
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Icons.close size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <EditorContent editor={editor} className="w-full" />
          {/* Show send button for mobile when there's text */}
          {isMobileView && (editor?.getText().trim() || attachments.length > 0) && (
            <button
              onClick={handleSubmit}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-[#0A7CFF] hover:text-[#47B5FF] transition-colors"
              disabled={disabled || isUploading}
            >
              <Icons.arrowUp size={24} />
            </button>
          )}
        </div>
        {!isMobileView && (
          <>
            <button
              ref={buttonRef}
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="flex-none text-muted-foreground hover:text-foreground transition-colors"
              disabled={disabled || isUploading}
            >
              <Icons.smile size={24} />
            </button>
            <button
              onClick={handleSubmit}
              className="flex-none text-[#0A7CFF] hover:text-[#47B5FF] transition-colors"
              disabled={disabled || isUploading || (!editor?.getText().trim() && attachments.length === 0)}
            >
              <Icons.arrowUp size={24} />
            </button>
          </>
        )}
        {showEmojiPicker && (
          <div
            ref={pickerRef}
            className="absolute bottom-full right-0 mb-2 z-50"
            onClick={(e) => e.stopPropagation()}
          >
            <Picker
              data={data}
              onEmojiSelect={(emoji: { native: string }) => {
                if (editor) {
                  editor.commands.insertContent(emoji.native);
                }
                setShowEmojiPicker(false);
              }}
              theme={theme === "dark" ? "dark" : "light"}
              previewPosition="none"
              skinTonePosition="none"
            />
          </div>
        )}
      </div>
    </div>
  );
});
