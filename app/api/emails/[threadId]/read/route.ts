import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { GmailService } from "@/lib/gmail";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth-options";

export async function POST(
  request: Request,
  { params }: { params: { threadId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!session.accessToken) {
      return NextResponse.json({ error: "No access token" }, { status: 400 });
    }

    const gmailService = new GmailService(session.accessToken);
    await gmailService.markAsRead(session.user.id, params.threadId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error marking email as read:", error);
    return NextResponse.json(
      { error: "Failed to mark email as read" },
      { status: 500 }
    );
  }
} 