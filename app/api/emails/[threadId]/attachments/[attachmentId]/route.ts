import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { GmailService } from "@/lib/gmail";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth-options";

export async function GET(
  request: Request,
  { params }: { params: { threadId: string; attachmentId: string } }
) {
  try {
    console.log('[AttachmentAPI] Request params:', params);
    
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!session.accessToken) {
      return NextResponse.json({ 
        error: "Token expired", 
        shouldRefresh: true,
        redirectUrl: "/api/auth/signin?callbackUrl=/messages" 
      }, { status: 401 });
    }

    // Extract the actual attachment ID from the URL
    const actualAttachmentId = decodeURIComponent(
      params.attachmentId.replace(/\.[^/.]+$/, "")
    );

    console.log('[AttachmentAPI] Processing request:', {
      messageId: params.threadId,
      originalAttachmentId: params.attachmentId,
      processedAttachmentId: actualAttachmentId
    });

    // Fetch the attachment directly from Gmail API
    const response = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages/${params.threadId}/attachments/${actualAttachmentId}`,
      {
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        return NextResponse.json({ 
          error: "Token expired", 
          shouldRefresh: true,
          redirectUrl: "/api/auth/signin?callbackUrl=/messages" 
        }, { status: 401 });
      }

      console.error('[AttachmentAPI] Gmail API error:', {
        status: response.status,
        statusText: response.statusText
      });

      return NextResponse.json(
        { error: "Failed to fetch attachment from Gmail" },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    if (!data.data) {
      console.error('[AttachmentAPI] No attachment data returned');
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    // Convert from base64url to regular base64 if needed
    const base64Data = data.data.replace(/-/g, '+').replace(/_/g, '/');
    const buffer = Buffer.from(base64Data, 'base64');

    // Create response with proper content type and headers
    const nextResponse = new NextResponse(buffer);
    nextResponse.headers.set('Content-Type', data.mimeType || 'application/octet-stream');
    nextResponse.headers.set('Content-Disposition', `inline; filename="${params.attachmentId}"`);
    nextResponse.headers.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    
    return nextResponse;

  } catch (error: any) {
    console.error('[AttachmentAPI] Error fetching attachment:', {
      error: error.message,
      stack: error.stack
    });
    return NextResponse.json(
      { error: "Failed to fetch attachment" },
      { status: 500 }
    );
  }
} 