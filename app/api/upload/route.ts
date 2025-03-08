import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth-options";
import { adminDb, adminStorage } from "@/lib/firebase-admin";

// Helper function to get file buffer from FormData
async function getFileFromFormData(formData: FormData): Promise<{ buffer: Buffer; filename: string; mimeType: string } | null> {
  const file = formData.get('file') as File;
  
  if (!file) {
    return null;
  }
  
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  
  return {
    buffer,
    filename: file.name,
    mimeType: file.type
  };
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // Parse the form data
    const formData = await request.formData();
    const fileData = await getFileFromFormData(formData);
    
    if (!fileData) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    
    // Generate a unique filename
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const uniqueId = Math.random().toString(36).substring(2, 15);
    const safeFilename = fileData.filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `users/${session.user.id}/uploads/${timestamp}-${uniqueId}-${safeFilename}`;
    
    // Upload to Firebase Storage
    const bucket = adminStorage.bucket();
    const file = bucket.file(storagePath);
    
    await file.save(fileData.buffer, {
      metadata: {
        contentType: fileData.mimeType,
        metadata: {
          originalName: fileData.filename,
          userId: session.user.id,
          uploadedAt: timestamp
        }
      }
    });
    
    // Generate a signed URL that expires in 7 days
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 1000 * 60 * 60 * 24 * 7 // 7 days
    });
    
    // Store metadata in Firestore
    const docRef = adminDb
      .collection('users')
      .doc(session.user.id)
      .collection('documents')
      .doc();
    
    await docRef.set({
      url: signedUrl,
      storagePath,
      timestamp: new Date(),
      metadata: {
        title: fileData.filename,
        originalName: fileData.filename,
        contentType: fileData.mimeType,
        size: fileData.buffer.length,
        uploadedAt: timestamp
      }
    });
    
    console.log('[UploadAPI] File uploaded successfully:', {
      id: docRef.id,
      filename: fileData.filename,
      size: fileData.buffer.length,
      mimeType: fileData.mimeType,
      storagePath
    });
    
    return NextResponse.json({
      success: true,
      id: docRef.id,
      url: `/api/attachments/${docRef.id}`,
      filename: fileData.filename,
      mimeType: fileData.mimeType,
      size: fileData.buffer.length
    });
  } catch (error) {
    console.error('[UploadAPI] Error uploading file:', error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
} 