import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth-options";
import { adminDb, adminStorage } from "@/lib/firebase-admin";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get document reference from Firestore
    const docRef = adminDb
      .collection('users')
      .doc(session.user.id)
      .collection('documents')
      .doc(params.id);

    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const data = doc.data();
    if (!data?.url) {
      return NextResponse.json({ error: "Document URL not found" }, { status: 404 });
    }

    // Get file from Firebase Storage
    const bucket = adminStorage.bucket();
    const fileUrl = new URL(data.url);
    const filePath = decodeURIComponent(fileUrl.pathname.replace('/bettermail-cb010.firebasestorage.app/', ''));
    const file = bucket.file(filePath);

    // Get the file content
    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json({ error: "File not found in storage" }, { status: 404 });
    }

    // Get a fresh signed URL
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Update the document with the new URL
    await docRef.update({
      url: signedUrl,
      updatedAt: new Date().toISOString()
    });

    // Redirect to the signed URL
    return NextResponse.redirect(signedUrl);
  } catch (error) {
    console.error("[DocumentViewAPI] Error serving document:", error);
    return NextResponse.json(
      { error: "Failed to serve document" },
      { status: 500 }
    );
  }
} 