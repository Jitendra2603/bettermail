"use client";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import App from "@/components/app";
import { useSearchParams } from "next/navigation";

export default function MessagesPage() {
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("id");

  return (
    <ProtectedRoute>
      <div className="min-h-screen">
        <App />
      </div>
    </ProtectedRoute>
  );
} 