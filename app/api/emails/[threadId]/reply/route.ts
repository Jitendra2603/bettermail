import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { GmailService } from "@/lib/gmail";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth-options";

export async function POST(
  request: Request,
  { params }: { params: { threadId: string } }
) {
  try {
    console.log('[EmailReplyAPI] Processing request for thread:', params.threadId);
    
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
      threadId: params.threadId,
      to,
      contentLength: content.length,
      hasAttachments: !!attachments?.length
    });

    const gmailService = new GmailService(session.accessToken);
    
    try {
      const response = await gmailService.sendReply(
        session.user.id,
        params.threadId,
        to,
        content,
        attachments
      );

      console.log('[EmailReplyAPI] Reply sent successfully:', response);
      return NextResponse.json({ success: true, messageId: response.id });
    } catch (error: any) {
      console.error('[EmailReplyAPI] Gmail service error:', error);
      
      // Handle auth errors
      if (error.message === 'AUTH_REFRESH_NEEDED' || error.response?.status === 401) {
        return NextResponse.json(
          { error: "Gmail authentication expired - Please reconnect Gmail" },
          { status: 401 }
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