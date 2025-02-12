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
      return NextResponse.json({ 
        error: "No access token", 
        shouldRefresh: true,
        redirectUrl: "/api/auth/signin?callbackUrl=/messages"
      }, { status: 401 });
    }

    try {
      const gmailService = new GmailService(session.accessToken);
      const watchResponse = await gmailService.watchMailbox(session.user.id);
      return NextResponse.json({ success: true, data: watchResponse });
    } catch (error: any) {
      console.error("[WatchAPI] Gmail service error:", error);
      
      // Check if error is due to invalid token
      if (error?.message === 'AUTH_REFRESH_NEEDED' || error?.response?.status === 401 || error?.code === 401) {
        return NextResponse.json({ 
          error: "Token expired", 
          shouldRefresh: true,
          redirectUrl: "/api/auth/signin?callbackUrl=/messages"
        }, { status: 401 });
      }
      throw error;
    }
  } catch (error) {
    console.error("[WatchAPI] Error setting up Gmail watch:", error);
    return NextResponse.json(
      { error: "Failed to set up Gmail watch" },
      { status: 500 }
    );
  }
} 