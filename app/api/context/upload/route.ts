import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth-options";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { randomUUID } from "crypto";
import { LlamaParseService } from "@/lib/llama-parse";
import { OpenAIService } from "@/lib/openai";

export const config = {
  api: {
    bodyParser: false,
  },
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export async function POST(req: Request) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.error('[Upload] Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the form data
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      console.error('[Upload] No file provided');
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      console.error('[Upload] File size exceeds limit:', file.size);
      return NextResponse.json({ error: 'File size exceeds 50MB limit' }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      console.error('[Upload] Invalid file type:', file.type);
      return NextResponse.json({ error: 'File type not supported' }, { status: 400 });
    }

    console.log(`[Upload] Processing file: ${file.name}`);

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate unique filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileExtension = file.name.split('.').pop();
    const fileName = `users/${session.user.id}/context/${timestamp}-${randomUUID()}.${fileExtension}`;

    // Upload to Firebase Storage
    const bucket = adminStorage.bucket();
    const fileRef = bucket.file(fileName);

    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type,
        metadata: {
          originalName: file.name,
          size: file.size,
          uploadedBy: session.user.id,
          uploadedAt: new Date().toISOString(),
        },
      },
    });

    // Make the file publicly accessible
    await fileRef.makePublic();
    const url = fileRef.publicUrl();

    console.log(`[Upload] File uploaded to storage: ${url}`);

    // Initialize services if API keys are available
    let openAIService;
    let llamaParseService;

    if (process.env.OPENAI_API_KEY) {
      openAIService = new OpenAIService(process.env.OPENAI_API_KEY);
    }

    if (process.env.LLAMA_PARSE_API_KEY) {
      llamaParseService = new LlamaParseService(
        process.env.LLAMA_PARSE_API_KEY,
        session.user.id,
        openAIService // Pass OpenAI service for embeddings
      );
    }

    // Initialize metadata with basic info
    let metadata = {
      title: file.name,
      pageCount: 1,
      summary: '',
      textContent: '',
      imageAnalysis: '',
      wordCount: 0,
    };

    // Process based on file type
    if (file.type === 'application/pdf' && llamaParseService) {
      try {
        console.log(`[Upload] Starting document parsing for ${file.name}`);
        const docId = await llamaParseService.parseDocument(fileName, file.name);
        console.log(`[Upload] Document parsed successfully, id: ${docId}`);
        
        // Get parsed content
        const parsedDoc = await llamaParseService.getDocumentContent(docId);
        metadata = {
          ...metadata,
          title: parsedDoc.metadata?.title || file.name,
          author: parsedDoc.metadata?.author,
          pageCount: parsedDoc.metadata?.pageCount || 1,
          wordCount: parsedDoc.metadata?.wordCount || 0,
          summary: parsedDoc.metadata?.summary || '',
          textContent: parsedDoc.text || '',
        };
      } catch (error) {
        console.error('[Upload] Error parsing document:', error);
      }
    } else if (file.type.startsWith('image/') && openAIService) {
      try {
        console.log(`[Upload] Analyzing image: ${file.name}`);
        const analysis = await openAIService.analyzeImage(url);
        metadata = {
          ...metadata,
          imageAnalysis: analysis,
        };
      } catch (error) {
        console.error('[Upload] Error analyzing image:', error);
      }
    }

    // Store in Firestore with enhanced metadata
    const docRef = adminDb
      .collection('users')
      .doc(session.user.id)
      .collection('documents')
      .doc();

    await docRef.set({
      id: docRef.id,
      filename: file.name,
      mimeType: file.type,
      url,
      sender: 'You',
      createdAt: Timestamp.now(),
      metadata,
      hasEmbedding: !!metadata.embedding,
      hasAnalysis: !!(metadata.imageAnalysis || metadata.summary),
    });

    console.log(`[Upload] Successfully processed ${file.name}`);
    return NextResponse.json({ 
      success: true, 
      documentId: docRef.id,
      url,
      metadata,
    });
  } catch (error) {
    console.error('[Upload] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process upload' },
      { status: 500 }
    );
  }
} 