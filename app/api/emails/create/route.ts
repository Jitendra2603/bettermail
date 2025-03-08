import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { GmailService } from "@/lib/gmail";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth-options";

export async function POST(request: Request) {
  try {
    console.log('[CreateEmailAPI] Processing request to create new email thread');
    
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      console.error('[CreateEmailAPI] Unauthorized request - no user session');
      return NextResponse.json({ error: "Unauthorized - Please sign in" }, { status: 401 });
    }

    if (!session.accessToken) {
      console.error('[CreateEmailAPI] Unauthorized request - no access token');
      return NextResponse.json({ error: "Unauthorized - Please reconnect Gmail" }, { status: 401 });
    }

    const { to, subject, content, attachments } = await request.json();

    if (!to || !to.length || !content) {
      console.error('[CreateEmailAPI] Missing required fields:', { 
        hasTo: !!to?.length, 
        hasContent: !!content,
        to: to?.length,
        content: content?.length
      });
      return NextResponse.json(
        { error: "Missing required fields - recipient and content required" },
        { status: 400 }
      );
    }

    console.log('[CreateEmailAPI] Creating new email thread:', {
      to,
      subject,
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
        console.warn('[CreateEmailAPI] Some attachments were invalid and will be skipped:', {
          originalCount: attachments?.length || 0,
          validCount: validAttachments?.length || 0
        });
      }
      
      const response = await gmailService.sendNewEmail(
        session.user.id,
        to,
        subject || "",
        content,
        validAttachments
      );

      console.log('[CreateEmailAPI] Email sent successfully:', response);
      return NextResponse.json({ 
        success: true, 
        threadId: response.threadId,
        messageId: response.id
      });
    } catch (error: any) {
      console.error('[CreateEmailAPI] Gmail service error:', error);
      
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
          { error: `Failed to send email: There was a problem with one or more attachments. Please try again without attachments.` },
          { status: 500 }
        );
      }
      
      throw error; // Re-throw other errors to be caught by outer catch
    }
  } catch (error) {
    console.error('[CreateEmailAPI] Error creating email thread:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: `Failed to create email thread: ${error.message}` },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: "An unexpected error occurred while creating the email thread" },
      { status: 500 }
    );
  }
} 