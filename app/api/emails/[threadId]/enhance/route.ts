import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth-options";
import { OpenAIService } from "@/lib/openai";
import { adminDb } from "@/lib/firebase-admin";
import { Message } from "@/types";

const SIMILARITY_THRESHOLD = 0.8;
const MAX_RELEVANT_DOCS = 5;

export async function POST(
  request: Request,
  { params }: { params: { threadId: string } }
) {
  try {
    console.log('[EnhanceAPI] Processing request for thread:', params.threadId);
    
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      console.error('[EnhanceAPI] Unauthorized request - no user session');
      return NextResponse.json({ error: "Unauthorized - Please sign in" }, { status: 401 });
    }

    const { suggestionId } = await request.json();
    if (!suggestionId) {
      return NextResponse.json({ error: "Missing suggestionId" }, { status: 400 });
    }

    // Get the original suggestion
    const suggestionRef = adminDb
      .collection('users')
      .doc(session.user.id)
      .collection('suggestions')
      .doc(suggestionId);

    const suggestion = await suggestionRef.get();
    if (!suggestion.exists) {
      return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
    }

    const suggestionData = suggestion.data();
    const openAIService = new OpenAIService(session.user.id);

    // Generate embedding for the suggestion content
    const suggestionEmbedding = await openAIService.generateEmbedding(suggestionData.content);

    // Get all user's documents with embeddings
    const docsSnapshot = await adminDb
      .collection('users')
      .doc(session.user.id)
      .collection('documents')
      .get();

    // Calculate cosine similarity and find relevant documents
    const relevantDocs = [];
    for (const doc of docsSnapshot.docs) {
      const docData = doc.data();
      if (!docData.embedding) continue;

      const similarity = calculateCosineSimilarity(suggestionEmbedding, docData.embedding);
      if (similarity >= SIMILARITY_THRESHOLD) {
        relevantDocs.push({
          id: doc.id,
          similarity,
          content: docData.text,
          metadata: docData.metadata,
        });
      }
    }

    // Sort by similarity and take top N
    relevantDocs.sort((a, b) => b.similarity - a.similarity);
    const topDocs = relevantDocs.slice(0, MAX_RELEVANT_DOCS);

    if (topDocs.length === 0) {
      return NextResponse.json({
        success: true,
        suggestion: {
          id: suggestionId,
          content: suggestionData.content,
          enhanced: false,
        },
      });
    }

    // Prepare context from relevant documents
    const context = topDocs.map(doc => ({
      content: doc.content,
      metadata: doc.metadata,
      similarity: doc.similarity,
    }));

    // Generate enhanced response with context
    const enhancedResponse = await openAIService.generateEmailResponse(
      [{ 
        id: 'original',
        content: suggestionData.content,
        sender: 'ai',
        timestamp: new Date().toISOString(),
      }],
      context.map(ctx => ({
        filename: ctx.metadata.title,
        content: ctx.content,
        similarity: ctx.similarity,
      }))
    );

    // Update the suggestion with enhanced content
    await suggestionRef.update({
      content: enhancedResponse,
      enhancedAt: new Date(),
      relevantDocs: topDocs.map(doc => ({
        id: doc.id,
        title: doc.metadata.title,
        similarity: doc.similarity,
      })),
    });

    return NextResponse.json({
      success: true,
      suggestion: {
        id: suggestionId,
        content: enhancedResponse,
        enhanced: true,
        relevantDocs: topDocs.map(doc => ({
          title: doc.metadata.title,
          similarity: doc.similarity,
        })),
      },
    });

  } catch (error: any) {
    console.error('[EnhanceAPI] Error enhancing suggestion:', error);
    
    return NextResponse.json(
      { error: "Failed to enhance suggestion. Please try again later." },
      { status: 500 }
    );
  }
}

function calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number {
  const dotProduct = embedding1.reduce((sum, val, i) => sum + val * embedding2[i], 0);
  const magnitude1 = Math.sqrt(embedding1.reduce((sum, val) => sum + val * val, 0));
  const magnitude2 = Math.sqrt(embedding2.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitude1 * magnitude2);
} 