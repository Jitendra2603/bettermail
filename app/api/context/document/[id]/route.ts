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

    const docRef = await adminDb
      .collection('users')
      .doc(session.user.id)
      .collection('documents')
      .doc(params.id)
      .get();

    if (!docRef.exists) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const document = docRef.data();

    return NextResponse.json({ document });
  } catch (error) {
    console.error("[DocumentAPI] Error fetching document:", error);
    return NextResponse.json(
      { 
        error: "Failed to fetch document",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get document reference
    const docRef = adminDb
      .collection('users')
      .doc(session.user.id)
      .collection('documents')
      .doc(params.id);

    // Get document data first to get the file URL
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const data = doc.data();
    if (!data) {
      return NextResponse.json({ error: "Document data not found" }, { status: 404 });
    }

    // Delete the file from Firebase Storage if URL exists
    if (data.url) {
      try {
        const bucket = adminStorage.bucket();
        const fileUrl = new URL(data.url);
        const filePath = decodeURIComponent(fileUrl.pathname.replace('/bettermail-cb010.firebasestorage.app/', ''));
        await bucket.file(filePath).delete();
        console.log("[DocumentAPI] Deleted file from storage:", filePath);
      } catch (error) {
        console.error("[DocumentAPI] Error deleting file from storage:", error);
        // Continue with document deletion even if file deletion fails
      }
    }

    // Delete the document from Firestore
    await docRef.delete();
    console.log("[DocumentAPI] Deleted document:", params.id);

    // Delete any associated logs
    const batch = adminDb.batch();
    const logsSnapshot = await adminDb
      .collection('logs')
      .where('userId', '==', session.user.id)
      .where('filename', '==', data.filename)
      .get();
    
    logsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DocumentAPI] Error deleting document:", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
} 