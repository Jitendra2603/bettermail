"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AuthError({
  error,
  description,
}: {
  error?: string;
  description?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    // Log the error for debugging
    console.error("Authentication error:", error, description);
    
    // Redirect to login page after a short delay
    const redirectTimer = setTimeout(() => {
      router.push("/login");
    }, 100);

    return () => clearTimeout(redirectTimer);
  }, [error, description, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-md dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          Authentication Error
        </h1>
        <p className="text-gray-600 dark:text-gray-300">
          There was a problem with your sign-in attempt. Redirecting you back to the login page...
        </p>
      </div>
    </div>
  );
} 