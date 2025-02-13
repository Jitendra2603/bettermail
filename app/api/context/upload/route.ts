import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth-options";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { randomUUID } from "crypto";
import { LlamaParseService } from "@/lib/llama-parse";
import { OpenAIService } from "@/lib/openai";

// Use new route segment config
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

// Helper function to clean undefined values
function cleanUndefinedValues(obj: any): any {
  if (obj === null || obj === undefined) {
    return null;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => cleanUndefinedValues(item));
  }
  
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const cleanedValue = cleanUndefinedValues(value);
      if (cleanedValue !== undefined && cleanedValue !== null) {
        cleaned[key] = cleanedValue;
      }
    }
    return cleaned;
  }
  
  return obj;
}

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
      openAIService = new OpenAIService(session.user.id);
    }

    if (process.env.LLAMA_PARSE_API_KEY) {
      llamaParseService = new LlamaParseService(
        process.env.LLAMA_PARSE_API_KEY,
        session.user.id,
        openAIService
      );
    }

    // Process the document
    if (!llamaParseService) {
      throw new Error('LlamaParse service not initialized');
    }

    console.log(`[Upload] Starting document parsing for ${file.name}`);
    const docId = await llamaParseService.parseDocument(fileName, file.name);
    console.log(`[Upload] Document parsed successfully, id: ${docId}`);

    // Get the document data
    const docRef = adminDb
      .collection('users')
      .doc(session.user.id)
      .collection('documents')
      .doc(docId);

    const docData = await docRef.get();
    const cleanedData = cleanUndefinedValues(docData.data());

    // Update with cleaned data
    await docRef.set(cleanedData, { merge: true });

    return NextResponse.json({ 
      success: true, 
      documentId: docId,
      url,
    });
  } catch (error) {
    console.error('[Upload] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process upload' },
      { status: 500 }
    );
  }
} 