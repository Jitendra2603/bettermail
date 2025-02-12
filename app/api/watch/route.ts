import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { GmailService } from "@/lib/gmail";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth-options";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!session.accessToken) {
      return NextResponse.json({ error: "No access token" }, { status: 400 });
    }

    const gmailService = new GmailService(session.accessToken);
    const watchResponse = await gmailService.watchMailbox(session.user.id);

    return NextResponse.json({ success: true, data: watchResponse });
  } catch (error) {
    console.error("[WatchAPI] Error setting up Gmail watch:", error);
    
    // Check if error is due to invalid token
    if ((error as any)?.response?.status === 401 || (error as any)?.code === 401) {
      return NextResponse.json({ 
        error: "Token expired", 
        shouldRefresh: true 
      }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to set up Gmail watch" },
      { status: 500 }
    );
  }
} 