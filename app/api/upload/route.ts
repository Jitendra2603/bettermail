import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth-options";
import { adminStorage } from "@/lib/firebase-admin";
import { v4 as uuidv4 } from "uuid";

export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Get file buffer
    const buffer = await file.arrayBuffer();

    // Get bucket reference
    const bucket = adminStorage.bucket();

    // Generate unique filename with user folder and timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileExtension = file.name.split(".").pop();
    const fileName = `users/${session.user.id}/uploads/${timestamp}-${uuidv4()}.${fileExtension}`;

    // Create file reference
    const fileRef = bucket.file(fileName);

    try {
      // Upload file
      await fileRef.save(Buffer.from(buffer), {
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

      // Get the public URL
      const publicUrl = fileRef.publicUrl();

      return NextResponse.json({
        url: publicUrl,
        filename: file.name,
        mimeType: file.type,
      });
    } catch (uploadError) {
      console.error("[UploadAPI] Error uploading to Firebase:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload to storage" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[UploadAPI] Error processing upload:", error);
    return NextResponse.json(
      { error: "Failed to process upload" },
      { status: 500 }
    );
  }
} 