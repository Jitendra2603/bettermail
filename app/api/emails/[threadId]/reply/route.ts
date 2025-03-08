import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { GmailService } from "@/lib/gmail";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth-options";

export async function POST(
  request: Request,
  { params }: { params: { threadId: string } }
) {
  // Store threadId in a variable to avoid using params synchronously
  const threadId = params.threadId;
  
  try {
    console.log('[EmailReplyAPI] Processing request for thread:', threadId);
    
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      console.error('[EmailReplyAPI] Unauthorized request - no user session');
      return NextResponse.json({ error: "Unauthorized - Please sign in" }, { status: 401 });
    }

    if (!session.accessToken) {
      console.error('[EmailReplyAPI] Unauthorized request - no access token');
      return NextResponse.json({ error: "Unauthorized - Please reconnect Gmail" }, { status: 401 });
    }

    const { content, to, attachments } = await request.json();

    if (!content || !to) {
      console.error('[EmailReplyAPI] Missing required fields:', { 
        hasContent: !!content, 
        hasTo: !!to,
        content: content?.length,
        to: to?.length
      });
      return NextResponse.json(
        { error: "Missing required fields - content and recipient required" },
        { status: 400 }
      );
    }

    console.log('[EmailReplyAPI] Sending reply:', {
      threadId,
      to,
      contentLength: content.length,
      hasAttachments: !!attachments?.length
    });

    const gmailService = new GmailService(session.accessToken);
    
    try {
      // Validate attachments before sending
      const validAttachments = attachments?.filter((attachment: { url?: string; filename?: string; mimeType?: string }) => 
        attachment && attachment.url && attachment.filename && attachment.mimeType
      );
      
      if (attachments?.length !== validAttachments?.length) {
        console.warn('[EmailReplyAPI] Some attachments were invalid and will be skipped:', {
          originalCount: attachments?.length || 0,
          validCount: validAttachments?.length || 0
        });
      }
      
      const response = await gmailService.sendReply(
        session.user.id,
        threadId,
        to,
        content,
        validAttachments
      );

      console.log('[EmailReplyAPI] Reply sent successfully:', response);
      
      // Check if any attachments failed
      if (response.failedAttachments?.length > 0 && response.successfulAttachments?.length === 0) {
        // All attachments failed
        return NextResponse.json({ 
          success: true, 
          messageId: response.id,
          warning: "Email sent without attachments because all attachments failed to process",
          failedAttachments: response.failedAttachments || []
        });
      } else if (response.failedAttachments?.length > 0) {
        // Some attachments failed
        return NextResponse.json({ 
          success: true, 
          messageId: response.id,
          warning: "Some attachments could not be included in the email",
          successfulAttachments: response.successfulAttachments || [],
          failedAttachments: response.failedAttachments || []
        });
      }
      
      return NextResponse.json({ 
        success: true, 
        messageId: response.id,
        successfulAttachments: response.successfulAttachments || []
      });
    } catch (error: any) {
      console.error('[EmailReplyAPI] Gmail service error:', error);
      
      // Handle auth errors
      if (error.message === 'AUTH_REFRESH_NEEDED' || error.response?.status === 401) {
        return NextResponse.json(
          { error: "Gmail authentication expired - Please reconnect Gmail" },
          { status: 401 }
        );
      }
      
      // Handle attachment errors specifically
      if (error.message && error.message.includes('attachment')) {
        return NextResponse.json(
          { error: `Failed to send reply: There was a problem with one or more attachments. Please try again without attachments.` },
          { status: 500 }
        );
      }
      
      throw error; // Re-throw other errors to be caught by outer catch
    }
  } catch (error) {
    console.error('[EmailReplyAPI] Error sending reply:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: `Failed to send reply: ${error.message}` },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: "An unexpected error occurred while sending the reply" },
      { status: 500 }
    );
  }
} 