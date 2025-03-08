import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    // Parse request body
    const feedback = await req.json();
    
    // Validate required fields
    if (!feedback.messageId || !feedback.updatedContent) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    console.log('[API] Received feedback:', {
      messageId: feedback.messageId,
      feedbackType: feedback.feedbackType,
      contentLength: feedback.updatedContent.length,
      attachmentCount: feedback.attachments?.length || 0,
      timestamp: feedback.timestamp
    });
    
    // In a real implementation, you would store this in a database
    // For now, we'll just log it
    
    // Return success response
    return NextResponse.json(
      { success: true, message: 'Feedback received' },
      { status: 200 }
    );
  } catch (error) {
    console.error('[API] Error processing feedback:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 