import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { GmailService } from '@/lib/gmail';
import { google } from 'googleapis';

export async function GET(
  request: NextRequest,
  { params }: { params: { messageId: string; attachmentId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const gmail = new GmailService(session.accessToken);
    
    // Get the attachment data
    const response = await gmail.gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: params.messageId,
      id: params.attachmentId
    });

    if (!response.data.data) {
      return new NextResponse('Attachment not found', { status: 404 });
    }

    // Decode the attachment data
    const buffer = Buffer.from(response.data.data, 'base64');
    
    // Get the attachment metadata to determine content type
    const message = await gmail.gmail.users.messages.get({
      userId: 'me',
      id: params.messageId
    });

    let contentType = 'application/octet-stream';
    let filename = 'attachment';

    // Find the attachment part to get its metadata
    const findAttachmentPart = (parts: any[]): any => {
      for (const part of parts) {
        if (part.body?.attachmentId === params.attachmentId) {
          return part;
        }
        if (part.parts) {
          const found = findAttachmentPart(part.parts);
          if (found) return found;
        }
      }
      return null;
    };

    const attachmentPart = findAttachmentPart(message.data.payload.parts || []);
    if (attachmentPart) {
      contentType = attachmentPart.mimeType;
      filename = attachmentPart.filename;
    }

    // Return the attachment with proper headers
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error fetching attachment:', error);
    return new NextResponse('Error fetching attachment', { status: 500 });
  }
} 