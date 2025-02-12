import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth-options";
import { adminDb } from "@/lib/firebase-admin";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const docsSnapshot = await adminDb
      .collection('users')
      .doc(session.user.id)
      .collection('documents')
      .orderBy('createdAt', 'desc')
      .get();

    const documents = docsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return NextResponse.json({ documents });
  } catch (error) {
    console.error("[DocumentsAPI] Error fetching documents:", error);
    return NextResponse.json(
      { 
        error: "Failed to fetch documents",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
} 