import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Icons } from "@/components/icons";
import { useDropzone } from "react-dropzone";
import { Attachment } from "@/types";
import { useFileUpload } from "@/hooks/use-file-upload";
import { cn } from "@/lib/utils";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";

// Enhanced Attachment interface with additional properties
interface EnhancedAttachment extends Attachment {
  id?: string;
  summary?: string;
  size?: number;
  uploading?: boolean;
}

interface FeedbackEditorProps {
  isOpen: boolean;
  onClose: () => void;
  initialContent: string;
  onSave: (content: string, attachments: EnhancedAttachment[]) => void;
  initialAttachments?: EnhancedAttachment[];
}

const FeedbackEditor = React.memo(({
  isOpen,
  onClose,
  initialContent,
  onSave,
  initialAttachments = [],
}: FeedbackEditorProps) => {
  const [content, setContent] = useState(initialContent);
  const [attachments, setAttachments] = useState<EnhancedAttachment[]>(initialAttachments);
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { isUploading, error, uploadFile } = useFileUpload();

  // Reset content when initialContent changes
  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  // Reset attachments when initialAttachments changes
  useEffect(() => {
    // Ensure all required properties are present
    const processedAttachments = (initialAttachments || []).map(att => ({
      ...att,
      id: att.id || undefined,
      summary: att.summary || undefined,
      size: att.size || undefined,
      uploading: false
    }));
    
    console.log('[FeedbackEditor] Setting initial attachments:', processedAttachments.map(a => ({
      filename: a.filename,
      id: a.id,
      hasSummary: !!a.summary,
      size: a.size
    })));
    
    setAttachments(processedAttachments);
  }, [initialAttachments]);

  // Handle file drop
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!acceptedFiles.length) return;
      
      console.log('[FeedbackEditor] Uploading files:', acceptedFiles.map(f => f.name));
      
      // Add uploading placeholders with safe URLs
      const newAttachments = acceptedFiles.map((file) => {
        // Create a safe blob URL
        const blobUrl = URL.createObjectURL(file);
        return {
          filename: file.name,
          mimeType: file.type,
          url: blobUrl,
          size: file.size,
          uploading: true,
        };
      });

      setAttachments((prev) => [...prev, ...newAttachments]);

      // Upload files one by one
      for (let i = 0; i < acceptedFiles.length; i++) {
        const file = acceptedFiles[i];
        try {
          console.log(`[FeedbackEditor] Uploading file ${i+1}/${acceptedFiles.length}: ${file.name}`);
          const result = await uploadFile(file);
          
          if (result && typeof result === 'object' && 'url' in result) {
            // Update the attachment with the real URL and ID if available
            setAttachments(prev => 
              prev.map(attachment => {
                if (attachment.uploading && attachment.filename === file.name) {
                  // Revoke the blob URL to prevent memory leaks
                  if (attachment.url.startsWith('blob:')) {
                    URL.revokeObjectURL(attachment.url);
                  }
                  
                  return {
                    filename: file.name,
                    mimeType: file.type,
                    url: result.url,
                    // Only include id and summary if they exist in the result
                    ...(result.id ? { id: result.id } : {}),
                    ...(result.summary ? { summary: result.summary } : {}),
                    size: file.size,
                    uploading: false,
                  };
                }
                return attachment;
              })
            );
            console.log(`[FeedbackEditor] File uploaded successfully: ${file.name} -> ${result.url}`);
          } else {
            console.error(`[FeedbackEditor] Failed to upload file: ${file.name}`, result);
            // Remove the failed attachment
            setAttachments(prev => {
              const newAttachments = prev.filter(attachment => 
                !(attachment.uploading && attachment.filename === file.name)
              );
              
              // Revoke any blob URLs for attachments we're removing
              prev.forEach(attachment => {
                if (attachment.uploading && attachment.filename === file.name && attachment.url.startsWith('blob:')) {
                  URL.revokeObjectURL(attachment.url);
                }
              });
              
              return newAttachments;
            });
          }
        } catch (error) {
          console.error(`[FeedbackEditor] Error uploading file: ${file.name}`, error);
          // Remove the failed attachment
          setAttachments(prev => {
            const newAttachments = prev.filter(attachment => 
              !(attachment.uploading && attachment.filename === file.name)
            );
            
            // Revoke any blob URLs for attachments we're removing
            prev.forEach(attachment => {
              if (attachment.uploading && attachment.filename === file.name && attachment.url.startsWith('blob:')) {
                URL.revokeObjectURL(attachment.url);
              }
            });
            
            return newAttachments;
          });
        }
      }
    },
    [uploadFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': [],
      'application/pdf': [],
      'text/plain': [],
      'application/msword': [],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  const handleRemoveAttachment = useCallback((index: number) => {
    setAttachments((prev) => {
      const newAttachments = [...prev];
      // If it's a blob URL, revoke it to prevent memory leaks
      const attachment = newAttachments[index];
      if (attachment.url.startsWith('blob:')) {
        URL.revokeObjectURL(attachment.url);
      }
      newAttachments.splice(index, 1);
      return newAttachments;
    });
  }, []);

  const handleSave = useCallback(async () => {
    try {
      setIsSaving(true);
      
      // Filter out any attachments that are still uploading or have blob URLs
      const finalAttachments = attachments
        .filter(a => !a.uploading) // Remove uploading attachments
        .filter(a => !a.url.startsWith('blob:')) // Remove blob URLs
        .map(a => ({
          ...a,
          // Ensure URL is absolute and valid
          url: a.url.startsWith('http') ? a.url : 
               a.url.startsWith('/') ? `${window.location.origin}${a.url}` : a.url
        }));
      
      // Check if we lost any attachments in the filtering
      if (finalAttachments.length < attachments.filter(a => !a.uploading).length) {
        console.warn('[FeedbackEditor] Some attachments were filtered out due to invalid URLs:', 
          attachments.filter(a => !a.uploading && a.url.startsWith('blob:'))
            .map(a => ({ name: a.filename, url: a.url }))
        );
      }
      
      console.log('[FeedbackEditor] Saving feedback with attachments:', 
        finalAttachments.map(a => ({ 
          name: a.filename, 
          type: a.mimeType, 
          url: a.url,
          id: a.id,
          hasSummary: !!a.summary
        }))
      );
      
      await onSave(content, finalAttachments);
      
      // Clean up any remaining blob URLs
      attachments.forEach(attachment => {
        if (attachment.url.startsWith('blob:')) {
          URL.revokeObjectURL(attachment.url);
        }
      });
      
      onClose();
    } catch (error) {
      console.error("[FeedbackEditor] Error saving feedback:", error);
    } finally {
      setIsSaving(false);
    }
  }, [content, attachments, onSave, onClose]);

  const togglePreview = useCallback(() => {
    setShowPreview(prev => !prev);
  }, []);

  // Format file size for display
  const formatFileSize = useCallback((bytes?: number) => {
    if (!bytes) return '';
    
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }, []);

  // Memoize the preview content
  const previewContent = useMemo(() => (
    <div className="prose dark:prose-invert max-w-none [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_tr]:border [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_blockquote]:border-l-4 [&_blockquote]:border-muted [&_blockquote]:pl-4 [&_blockquote]:italic [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-4">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
      >
        {content}
      </ReactMarkdown>
    </div>
  ), [content]);

  // Handle file selection via button
  const handleFileSelect = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (files.length > 0) {
        await onDrop(files);
      }
    };
    
    input.click();
  }, [onDrop]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit AI Response</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="flex justify-end mb-2 gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={togglePreview}
              className="gap-1"
            >
              {showPreview ? (
                <>
                  <Icons.edit className="h-4 w-4" />
                  Edit
                </>
              ) : (
                <>
                  <Icons.file className="h-4 w-4" />
                  Preview
                </>
              )}
            </Button>
          </div>
          
          <div className="flex-1 overflow-auto min-h-0">
            {showPreview ? (
              previewContent
            ) : (
              <Textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[300px] h-full resize-none font-mono text-sm"
                placeholder="Edit the AI response here..."
              />
            )}
          </div>
          
          {/* Attachments section */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">Attachments</h3>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleFileSelect}
                disabled={isUploading}
                className="gap-1"
              >
                <Icons.plus className="h-4 w-4" />
                Add Files
              </Button>
            </div>
            
            {/* Attachment list */}
            <div className="space-y-2 max-h-[150px] overflow-y-auto">
              {attachments.length === 0 ? (
                <div 
                  {...getRootProps()} 
                  className={cn(
                    "border-2 border-dashed rounded-md p-4 text-center cursor-pointer transition-colors",
                    isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-primary/50"
                  )}
                >
                  <input {...getInputProps()} />
                  <p className="text-sm text-muted-foreground">
                    Drag & drop files here, or click to select files
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {attachments.map((attachment, index) => (
                    <div 
                      key={index} 
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-md border",
                        attachment.uploading ? "border-primary/50 bg-primary/5" : "border-border"
                      )}
                    >
                      <div className="flex-shrink-0">
                        {attachment.mimeType?.includes('image') ? (
                          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden">
                            <Image 
                              src={attachment.url} 
                              alt={attachment.filename}
                              width={40}
                              height={40}
                              className="object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                            <Icons.file className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="relative group">
                          <p className="text-sm font-medium truncate">
                            {attachment.filename}
                          </p>
                          {attachment.summary && (
                            <div className="hidden group-hover:block absolute z-10 p-2 bg-background border rounded-md shadow-md max-w-xs">
                              <p className="text-xs">{attachment.summary}</p>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(attachment.size)}
                          </p>
                          {attachment.uploading && (
                            <p className="text-xs text-primary animate-pulse">Uploading...</p>
                          )}
                          {attachment.id && (
                            <p className="text-xs text-muted-foreground">ID: {attachment.id.substring(0, 6)}...</p>
                          )}
                        </div>
                      </div>
                      
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full"
                        onClick={() => handleRemoveAttachment(index)}
                        disabled={attachment.uploading}
                      >
                        <Icons.close className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isUploading}>
            {isSaving ? (
              <>
                <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

FeedbackEditor.displayName = 'FeedbackEditor';

export { FeedbackEditor }; 