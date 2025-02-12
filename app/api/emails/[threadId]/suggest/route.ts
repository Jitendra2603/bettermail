import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth-options";
import { OpenAIService } from "@/lib/openai";
import { LlamaParseService } from "@/lib/llama-parse";
import { adminDb } from "@/lib/firebase-admin";
import { Message } from "@/types";

export async function POST(
  request: Request,
  { params }: { params: { threadId: string } }
) {
  try {
    console.log('[SuggestAPI] Processing request for thread:', params.threadId);
    
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      console.error('[SuggestAPI] Unauthorized request - no user session');
      return NextResponse.json({ error: "Unauthorized - Please sign in" }, { status: 401 });
    }

    // Get the email thread from Firestore
    const emailsRef = adminDb
      .collection('users')
      .doc(session.user.id)
      .collection('emails');

    const threadSnapshot = await emailsRef
      .where('threadId', '==', params.threadId)
      .orderBy('receivedAt', 'asc')
      .get();

    if (threadSnapshot.empty) {
      console.error('[SuggestAPI] Thread not found:', params.threadId);
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    // Convert thread to messages array
    const messages: Message[] = threadSnapshot.docs.map(doc => ({
      id: doc.id,
      content: doc.data().content || doc.data().body,
      sender: doc.data().from,
      timestamp: doc.data().receivedAt.toDate().toISOString(),
      attachments: doc.data().attachments || [],
    }));

    // Process attachments if any
    const attachmentsToProcess = messages.flatMap(msg => msg.attachments || []);
    const processedAttachments = [];

    const openAIService = new OpenAIService(session.user.id);
    const llamaParseService = new LlamaParseService(session.user.id);

    for (const attachment of attachmentsToProcess) {
      try {
        if (attachment.mimeType.startsWith('image/')) {
          // Process image with GPT-4 Vision
          const analysis = await openAIService.analyzeImage(attachment.url);
          processedAttachments.push({
            ...attachment,
            content: analysis,
          });
        } else if (attachment.mimeType === 'application/pdf') {
          // Process PDF with LlamaParse
          const docId = await llamaParseService.parseDocument(attachment.url, attachment.filename);
          const content = await llamaParseService.getDocumentContent(docId);
          processedAttachments.push({
            ...attachment,
            content: content.text,
          });
        }
      } catch (error) {
        console.error('[SuggestAPI] Error processing attachment:', error);
        // Continue with other attachments even if one fails
      }
    }

    // Generate AI response
    const response = await openAIService.generateEmailResponse(messages, processedAttachments);

    // Store the suggestion in Firestore
    const suggestionRef = await adminDb
      .collection('users')
      .doc(session.user.id)
      .collection('suggestions')
      .add({
        threadId: params.threadId,
        content: response,
        createdAt: new Date(),
        status: 'pending', // pending, approved, rejected
        messageCount: messages.length,
        attachmentCount: processedAttachments.length,
      });

    console.log('[SuggestAPI] Successfully generated suggestion:', suggestionRef.id);

    return NextResponse.json({
      success: true,
      suggestion: {
        id: suggestionRef.id,
        content: response,
      },
    });

  } catch (error: any) {
    console.error('[SuggestAPI] Error generating suggestion:', error);
    
    return NextResponse.json(
      { error: "Failed to generate suggestion. Please try again later." },
      { status: 500 }
    );
  }
} 