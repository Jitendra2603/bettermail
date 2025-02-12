import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { GmailService } from "@/lib/gmail";
import { adminDb } from "@/lib/firebase-admin";
import { authOptions } from "../auth/[...nextauth]/auth-options";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      console.error("[SyncAPI] No user email in session");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!session.user.id) {
      console.error("[SyncAPI] No user ID in session");
      return NextResponse.json({ error: "User ID not found" }, { status: 400 });
    }

    if (!session.accessToken) {
      console.error("[SyncAPI] No access token in session");
      // Force a token refresh by returning a special response
      return NextResponse.json({ 
        error: "Token expired", 
        shouldRefresh: true,
        redirectUrl: "/api/auth/signin?callbackUrl=/messages" 
      }, { status: 401 });
    }

    console.log("[SyncAPI] Starting sync for user:", {
      id: session.user.id,
      email: session.user.email,
      hasAccessToken: !!session.accessToken,
      accessTokenLength: session.accessToken?.length
    });

    // Get or create user document
    try {
      const userRef = adminDb.collection('users').doc(session.user.id);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        console.log("[SyncAPI] Creating new user document");
        await userRef.set({
          email: session.user.email,
          name: session.user.name,
          image: session.user.image,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSyncAttempt: new Date(),
        });
      } else {
        console.log("[SyncAPI] User document exists, updating timestamp");
        await userRef.update({
          updatedAt: new Date(),
          lastSyncAttempt: new Date(),
        });
      }
    } catch (error) {
      console.error("[SyncAPI] Error managing user document:", error);
      throw error;
    }

    try {
      console.log("[SyncAPI] Initializing Gmail service");
      const gmailService = new GmailService(session.accessToken);
      console.log("[SyncAPI] Starting email sync");
      await gmailService.syncEmails(session.user.id);
      
      // Update last successful sync time
      const userRef = adminDb.collection('users').doc(session.user.id);
      await userRef.update({
        lastSuccessfulSync: new Date(),
      });
      
      console.log("[SyncAPI] Email sync completed successfully");
    } catch (error: any) {
      console.error("[SyncAPI] Error in Gmail service:", error);
      
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SyncAPI] Sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync emails" },
      { status: 500 }
    );
  }
} 