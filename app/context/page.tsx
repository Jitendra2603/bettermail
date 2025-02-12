"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { redirect, useRouter } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useDropzone } from "react-dropzone";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";

interface Document {
  id: string;
  sender?: string;
  filename: string;
  mimeType?: string;
  url?: string;
  metadata?: {
    title?: string;
    author?: string;
    pageCount?: number;
    summary?: string;
    text?: string;
    imageAnalysis?: string;
    wordCount?: number;
    createdAt?: string;
  };
  createdAt: Date | { toDate(): Date } | string;
  hasEmbedding?: boolean;
  hasAnalysis?: boolean;
}

interface ContextPageProps {
  searchParams: { [key: string]: string | undefined };
}

// Add new component for document details
function DocumentDetails({ doc }: { doc: Document }) {
  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="metadata">
        <AccordionTrigger className="text-sm font-medium hover:no-underline hover:text-blue-500">
          Metadata
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Created</span>
              <span className="text-sm">{formatDate(doc.createdAt)}</span>
            </div>
            {doc.metadata?.author && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Author</span>
                <span className="text-sm">{doc.metadata.author}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Pages</span>
              <span className="text-sm">{doc.metadata?.pageCount || 1}</span>
            </div>
            {doc.metadata?.wordCount && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Words</span>
                <span className="text-sm">{doc.metadata.wordCount.toLocaleString()}</span>
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>

      {doc.metadata?.summary && (
        <AccordionItem value="summary">
          <AccordionTrigger className="text-sm font-medium hover:no-underline hover:text-blue-500">
            Summary
          </AccordionTrigger>
          <AccordionContent>
            <div className="text-sm prose dark:prose-invert max-w-none whitespace-pre-wrap">
              {doc.metadata.summary}
            </div>
          </AccordionContent>
        </AccordionItem>
      )}

      {doc.metadata?.text && (
        <AccordionItem value="content">
          <AccordionTrigger className="text-sm font-medium hover:no-underline hover:text-blue-500">
            Content
          </AccordionTrigger>
          <AccordionContent>
            <div className="max-h-96 overflow-y-auto">
              <div className="text-sm prose dark:prose-invert max-w-none whitespace-pre-wrap">
                {doc.metadata.text}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      )}

      {doc.metadata?.imageAnalysis && (
        <AccordionItem value="analysis">
          <AccordionTrigger className="text-sm font-medium hover:no-underline hover:text-blue-500">
            Image Analysis
          </AccordionTrigger>
          <AccordionContent>
            <div className="text-sm prose dark:prose-invert max-w-none whitespace-pre-wrap">
              {doc.metadata.imageAnalysis}
            </div>
          </AccordionContent>
        </AccordionItem>
      )}
    </Accordion>
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
      <DialogContent className={cn(
        "sm:max-w-3xl transition-all duration-300",
        isExpanded ? "h-screen" : "h-[80vh]"
      )}>
        <DialogHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <DialogTitle className="flex items-center gap-2">
              <span className="truncate">{doc.metadata?.title || doc.filename}</span>
              <div className="flex gap-1">
                {doc.hasEmbedding && (
                  <Badge variant="secondary">
                    <Icons.brain className="h-3 w-3 mr-1" />
                    Vector
                  </Badge>
                )}
                {doc.hasAnalysis && (
                  <Badge variant="secondary">
                    <Icons.sparkles className="h-3 w-3 mr-1" />
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
                <Icons.loader className="h-4 w-4 animate-spin" />
              ) : (
                <Icons.trash className="h-4 w-4 text-red-500" />
              )}
            </Button>
          </div>
        </DialogHeader>
        
        <div className="flex flex-col md:flex-row gap-6 h-full overflow-hidden">
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
                    <Icons.imageOff className="h-12 w-12 text-muted-foreground" />
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

function DocumentCard({ doc, onView }: { doc: Document; onView: () => void }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
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
      window.location.reload(); // Refresh to update the list
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
    <div className="group border rounded-xl overflow-hidden hover:border-blue-500/50 hover:shadow-lg transition-all duration-300 bg-card">
      {/* Document preview */}
      <div className="aspect-video bg-muted relative overflow-hidden">
        {doc.mimeType?.startsWith('image/') ? (
          <Image
            src={doc.url || ''}
            alt={doc.filename}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            unoptimized={doc.url?.startsWith('https://storage.googleapis.com/')}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Icons.file className="h-12 w-12 text-muted-foreground transition-transform duration-300 group-hover:scale-110" size={48} />
          </div>
        )}
      </div>

      {/* Document info */}
      <div className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-medium truncate flex-1" title={doc.metadata?.title || doc.filename}>
            {doc.metadata?.title || doc.filename}
          </h3>
          <div className="flex gap-1 ml-2">
            {doc.hasEmbedding && (
              <Badge variant="secondary" className="h-5">
                <Icons.brain className="h-3 w-3 mr-1" />
                Vector
              </Badge>
            )}
            {doc.hasAnalysis && (
              <Badge variant="secondary" className="h-5">
                <Icons.sparkles className="h-3 w-3 mr-1" />
                AI
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{formatDate(doc.createdAt)}</span>
          <span>•</span>
          <span>{doc.metadata?.pageCount || 1} page{doc.metadata?.pageCount !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 pt-0 flex items-center gap-2">
        <Button 
          variant="ghost" 
          size="sm"
          className="hover:scale-105 transition-transform"
          onClick={onView}
        >
          <Icons.search className="h-4 w-4 mr-2" size={16} />
          View
        </Button>
        <Button 
          variant="ghost" 
          size="sm"
          className="hover:scale-105 transition-transform"
          onClick={(e) => {
            e.stopPropagation();
            handleDownloadDocument(doc);
          }}
        >
          <Icons.arrowDown className="h-4 w-4 mr-2" size={16} />
          Download
        </Button>
        <Button 
          variant="ghost" 
          size="sm"
          className="hover:scale-105 transition-transform hover:text-red-500"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <Icons.loader className="h-4 w-4 animate-spin" />
          ) : (
            <Icons.trash className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

// Add formatDate function at the top level
function formatDate(date: Date | { toDate(): Date } | string) {
  try {
    if (date instanceof Date) {
      return date.toLocaleDateString();
    }
    if (typeof date === 'object' && 'toDate' in date && typeof date.toDate === 'function') {
      return date.toDate().toLocaleDateString();
    }
    return new Date(date as string).toLocaleDateString();
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid date';
  }
}

// Add handleDownloadDocument function at the top level
async function handleDownloadDocument(doc: Document) {
  try {
    // Create a temporary anchor element
    const link = document.createElement('a');
    link.href = doc.url || '';
    link.download = doc.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('[Download] Error:', error);
    throw new Error('Failed to download document. Please try again.');
  }
}

export default function ContextPage({ searchParams }: ContextPageProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session?.user?.id) {
      redirect("/");
    }
  }, [session, status]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!session?.user?.id) return;
    
    try {
      setIsUploading(true);
      setUploadProgress(0);
      
      for (const file of acceptedFiles) {
        const formData = new FormData();
        formData.append('file', file);
        
        console.log(`[Upload] Starting upload for ${file.name}`);
        
        const response = await fetch('/api/context/upload', {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Upload failed');
        }
        
        console.log(`[Upload] Successfully uploaded ${file.name}`);
        setUploadProgress((prev) => prev + (100 / acceptedFiles.length));
      }
      
      // Refresh documents list
      fetchDocuments();
      setUploadOpen(false);
    } catch (err) {
      console.error('[Upload] Error:', err);
      setError('Failed to upload file(s). Please try again.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [session?.user?.id]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.gif'],
      'text/plain': ['.txt'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    maxSize: 50 * 1024 * 1024, // 50MB
  });

  useEffect(() => {
    if (!session?.user?.id) return;
    console.log('[Documents] Initial fetch');
    fetchDocuments();
  }, [session?.user?.id]);

  async function fetchDocuments() {
    if (!session?.user?.id) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('[Documents] Fetching documents');
      const response = await fetch('/api/context/documents');
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch documents');
      }
      
      const data = await response.json();
      console.log('[Documents] Successfully fetched documents:', data.documents.length);
      setDocuments(data.documents);
    } catch (err) {
      console.error('[Documents] Error:', err);
      setError('Failed to load documents. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }

  // Group documents by sender
  const documentsBySender = documents.reduce((acc: Record<string, Document[]>, doc) => {
    const sender = doc.sender || 'You';
    if (!acc[sender]) {
      acc[sender] = [];
    }
    acc[sender].push(doc);
    return acc;
  }, {});

  // Move "You" to the top if it exists
  const sortedSenders = Object.keys(documentsBySender).sort((a, b) => {
    if (a === 'You') return -1;
    if (b === 'You') return 1;
    return a.localeCompare(b);
  });

  const handleViewDocument = useCallback(async (doc: Document) => {
    try {
      const response = await fetch(`/api/context/document/${doc.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch document content');
      }
      const data = await response.json();
      // Open document content in a new tab
      window.open(doc.url, '_blank');
    } catch (error) {
      console.error('[View] Error:', error);
      setError('Failed to view document. Please try again.');
    }
  }, []);

  // Don't render anything while checking auth
  if (status === 'loading' || isLoading) {
    return <div className="flex items-center justify-center h-screen">
      <Icons.loader className="w-6 h-6 animate-spin" />
    </div>;
  }

  if (!session?.user?.id) {
    return null;
  }

  if (error) {
    return <div className="flex flex-col items-center justify-center h-screen gap-4">
      <Icons.close className="w-8 h-8 text-red-500" size={32} />
      <p className="text-red-500">{error}</p>
      <Button onClick={() => window.location.reload()}>Try Again</Button>
    </div>;
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b backdrop-blur-xl bg-background/80 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="hover:scale-105 transition-transform"
          >
            <Icons.chevronLeft className="h-4 w-4" size={16} />
          </Button>
          <h1 className="text-xl font-semibold">Context</h1>
        </div>
        <div className="flex items-center gap-3">
          <Input
            placeholder="Search documents..."
            className="w-64 bg-muted/50 border-0 focus-visible:ring-1 transition-all"
            type="search"
          />
          <Button 
            className="gap-2 hover:scale-105 transition-transform"
            onClick={() => setUploadOpen(true)}
          >
            <Icons.plus className="h-4 w-4" size={16} />
            Upload
          </Button>
          <Button 
            variant="outline" 
            className="gap-2 hover:scale-105 transition-transform"
            onClick={() => setSettingsOpen(true)}
          >
            <Icons.settings className="h-4 w-4" size={16} />
            Manage Knowledge Base
          </Button>
        </div>
      </div>

      {/* Main content */}
      <ScrollArea className="flex-1 px-4 py-6">
        <div className="max-w-6xl mx-auto space-y-10">
          {sortedSenders.map((sender) => (
            <div key={sender} className="space-y-6">
              {/* Sender header */}
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-medium shadow-sm">
                  {sender === 'You' ? 'Y' : sender[0]}
                </div>
                <h2 className="text-lg font-medium">{sender}</h2>
              </div>

              {/* Documents grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {documentsBySender[sender].map((doc: Document) => (
                  <DocumentCard 
                    key={doc.id} 
                    doc={doc} 
                    onView={() => setSelectedDoc(doc)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Document view modal */}
      {selectedDoc && (
        <DocumentViewModal
          doc={selectedDoc}
          isOpen={!!selectedDoc}
          onClose={() => setSelectedDoc(null)}
        />
      )}

      {/* Upload Modal */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Upload Documents</DialogTitle>
            <DialogDescription>
              Upload documents to your knowledge base. They will be processed and made searchable.
            </DialogDescription>
          </DialogHeader>
          <div 
            {...getRootProps()} 
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
              isDragActive ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-gray-300"
            )}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-2">
              <Icons.file className="h-8 w-8 text-muted-foreground" />
              {isDragActive ? (
                <p>Drop the files here ...</p>
              ) : (
                <>
                  <p>Drag & drop files here, or click to select files</p>
                  <p className="text-sm text-muted-foreground">
                    Supports PDF, images, and documents up to 50MB
                  </p>
                </>
              )}
            </div>
          </div>
          {isUploading && (
            <div className="mt-4">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-sm text-center mt-2">Uploading... {Math.round(uploadProgress)}%</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Settings Modal */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Knowledge Base Settings</DialogTitle>
            <DialogDescription>
              Manage your knowledge base settings and email senders.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium">Email Senders</h3>
              <p className="text-sm text-muted-foreground mb-4">
                People who have sent you documents via email
              </p>
              <div className="space-y-4">
                {sortedSenders.map((sender) => (
                  <div key={sender} className="flex items-center justify-between p-3 rounded-lg bg-muted">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-medium">
                        {sender === 'You' ? 'Y' : sender[0]}
                      </div>
                      <div>
                        <p className="font-medium">{sender}</p>
                        <p className="text-sm text-muted-foreground">
                          {documentsBySender[sender].length} document{documentsBySender[sender].length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      <Icons.search className="h-4 w-4 mr-2" size={16} />
                      View Documents
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 