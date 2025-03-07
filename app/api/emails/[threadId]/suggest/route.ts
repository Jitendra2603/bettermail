import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth-options";

// Mock function to generate a suggestion
function generateMockSuggestion(messageContent: string) {
  console.log('[SuggestAPI] Generating mock suggestion for message:', messageContent);

  // Mock relevant documents
  const mockDocs = [
    { title: "Sample Document 1.pdf", similarity: 0.92 },
    { title: "Meeting Notes.pdf", similarity: 0.85 },
  ];

  // Mock attachments
  const mockAttachments = [
    {
      filename: "sample.pdf",
      mimeType: "application/pdf",
      url: "/api/context/document/123/view",
    },
  ];

  // Mock suggestion content
  const suggestionContent = `Here's a draft reply:

I've reviewed the documents you shared and here are my thoughts:

1. Regarding your question about the project timeline:
   - The current phase is on track
   - We expect to complete by end of Q2

2. Key points from the attached documents:
   - Budget allocation is within limits
   - Resource planning looks good

Let me know if you need any clarification.

Best regards`;

  const suggestionId = crypto.randomUUID();
  const suggestion = {
    id: suggestionId,
    content: suggestionContent,
    sender: 'ai',
    type: 'suggestion',
    timestamp: new Date().toISOString(),
    suggestion: {
      id: suggestionId,
      status: 'pending',
      relevantDocs: mockDocs,
    },
    attachments: mockAttachments,
  };

  console.log('[SuggestAPI] Generated suggestion:', {
    id: suggestion.id,
    contentPreview: suggestion.content.substring(0, 100) + '...',
    docsCount: suggestion.suggestion.relevantDocs.length,
    attachmentsCount: suggestion.attachments.length
  });

  return suggestion;
}

export async function POST(
  request: Request,
  { params }: { params: { threadId: string } }
) {
  try {
    // Get threadId from params (no need to await params itself)
    const { threadId } = params;
    console.log('[SuggestAPI] Received request for thread:', threadId);
    
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      console.error('[SuggestAPI] Unauthorized request - no user session');
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { messageId } = await request.json();
    console.log('[SuggestAPI] Processing message:', {
      messageId,
      threadId,
      userId: session.user.id
    });

    // Generate mock suggestion
    const suggestion = generateMockSuggestion(messageId);

    // Add thread context to the response
    const response = {
      success: true,
      suggestion: {
        ...suggestion,
        threadId,
      },
    };

    console.log('[SuggestAPI] Sending response:', {
      success: true,
      suggestionId: suggestion.id,
      threadId,
      contentPreview: suggestion.content.substring(0, 100) + '...'
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("[SuggestAPI] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestion" },
      { status: 500 }
    );
  }
} 