"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Paperclip, Send, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { generateClientUUID } from "@/lib/utils";

export default function NewMessagePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [to, setTo] = useState<string>("");
  const [subject, setSubject] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [attachments, setAttachments] = useState<{ id: string; file: File; uploading: boolean }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newAttachments = Array.from(e.target.files).map(file => ({
        id: generateClientUUID(),
        file,
        uploading: true
      }));
      
      setAttachments(prev => [...prev, ...newAttachments]);
      
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(att => att.id !== id));
  };

  const uploadAttachment = async (file: File): Promise<{ url: string; filename: string; mimeType: string } | null> => {
    try {
      // Create a FormData object to send the file
      const formData = new FormData();
      formData.append('file', file);
      
      // Upload the file to the server
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Failed to upload file: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.success || !data.url) {
        throw new Error('Failed to upload file');
      }
      
      return {
        url: data.url,
        filename: file.name,
        mimeType: file.type
      };
    } catch (error) {
      console.error('Error uploading file:', error);
      return null;
    }
  };

  const handleSendEmail = async () => {
    if (!to) {
      toast({
        title: "Missing recipient",
        description: "Please enter at least one recipient email address.",
        variant: "destructive"
      });
      return;
    }

    if (!content) {
      toast({
        title: "Missing content",
        description: "Please enter a message.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      // First, upload any attachments
      const uploadedAttachments = [];
      
      if (attachments.length > 0) {
        // Show a toast for uploading attachments
        toast({
          title: "Uploading attachments",
          description: "Please wait while we upload your attachments..."
        });
        
        // Upload each attachment
        for (const attachment of attachments) {
          const result = await uploadAttachment(attachment.file);
          if (result) {
            uploadedAttachments.push(result);
          }
        }
      }
      
      // Parse recipients
      const recipients = to.split(',').map(email => email.trim());
      
      // Create a new thread
      const threadResponse = await fetch('/api/emails/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: recipients,
          subject,
          content,
          attachments: uploadedAttachments
        })
      });

      if (!threadResponse.ok) {
        const errorData = await threadResponse.json();
        throw new Error(errorData.error || `Failed to create thread: ${threadResponse.statusText}`);
      }

      const threadData = await threadResponse.json();
      
      if (!threadData.success || !threadData.threadId) {
        throw new Error('Failed to create thread');
      }

      toast({
        title: "Email sent",
        description: "Your email has been sent successfully."
      });

      // Navigate to the new conversation
      router.push(`/messages?id=${threadData.threadId}`);
    } catch (error) {
      console.error('Error sending email:', error);
      toast({
        title: "Failed to send email",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="container mx-auto max-w-3xl py-8">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl">New Email</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="to">To</Label>
              <Input
                id="to"
                placeholder="recipient@example.com"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                placeholder="Subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Message</Label>
              <Textarea
                id="content"
                placeholder="Type your message here..."
                className="min-h-[200px]"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
            
            {attachments.length > 0 && (
              <div className="space-y-2">
                <Label>Attachments</Label>
                <div className="flex flex-wrap gap-2">
                  {attachments.map((att) => (
                    <div key={att.id} className="flex items-center gap-2 bg-muted p-2 rounded">
                      <span className="text-sm truncate max-w-[200px]">{att.file.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeAttachment(att.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-between">
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple
                onChange={handleFileChange}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={handleSendEmail} disabled={isLoading}>
              {isLoading ? "Sending..." : "Send"}
              <Send className="ml-2 h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      </div>
    </ProtectedRoute>
  );
} 