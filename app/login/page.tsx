"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { auth } from "@/lib/firebase";
import { signInWithCustomToken } from "firebase/auth";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleGmailLogin = async () => {
    try {
      setIsLoading(true);
      
      // Sign in with NextAuth
      console.log("[Login] Starting Google sign in");
      const result = await signIn("google", { 
        callbackUrl: "/messages",
        redirect: false 
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      // Get the session to access the Firebase token
      console.log("[Login] Getting session data");
      const response = await fetch('/api/auth/session');
      const session = await response.json();

      if (!session?.firebaseToken) {
        throw new Error('No Firebase token available');
      }

      // Sign in to Firebase with the custom token
      console.log("[Login] Signing in to Firebase");
      await signInWithCustomToken(auth, session.firebaseToken);
      console.log("[Login] Firebase sign in successful");
      
      // Trigger email sync
      console.log("[Login] Triggering email sync");
      const syncResponse = await fetch('/api/sync', {
        method: 'POST',
      });
      
      if (!syncResponse.ok) {
        const errorData = await syncResponse.json();
        console.error("[Login] Sync failed:", errorData);
        throw new Error(`Sync failed: ${errorData.error}`);
      }

      const syncData = await syncResponse.json();
      console.log("[Login] Sync response:", syncData);

      // Navigate to messages page
      router.push('/messages');
    } catch (error) {
      console.error('[Login] Error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to log in. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 space-y-6 bg-white rounded-2xl shadow-lg">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-blue-500 rounded-full mx-auto flex items-center justify-center">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4-4-4z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Welcome to Messages</h1>
          <p className="text-gray-500">Sign in with your Gmail account to continue</p>
        </div>

        <Button
          onClick={handleGmailLogin}
          disabled={isLoading}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-full transition-colors"
        >
          {isLoading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin mr-2 w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              Signing in...
            </div>
          ) : (
            <div className="flex items-center justify-center">
              <svg
                className="w-5 h-5 mr-2"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fill="currentColor"
                  d="M20.283 10.356h-8.327v3.451h4.792c-.446 2.193-2.313 3.453-4.792 3.453a5.27 5.27 0 0 1-5.279-5.28 5.27 5.27 0 0 1 5.279-5.279c1.259 0 2.397.447 3.29 1.178l2.6-2.599c-1.584-1.381-3.615-2.233-5.89-2.233a8.908 8.908 0 0 0-8.934 8.934 8.907 8.907 0 0 0 8.934 8.934c4.467 0 8.529-3.249 8.529-8.934 0-.528-.081-1.097-.202-1.625z"
                />
              </svg>
              Continue with Gmail
            </div>
          )}
        </Button>

        <p className="text-center text-sm text-gray-500">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </Card>
    </div>
  );
} 