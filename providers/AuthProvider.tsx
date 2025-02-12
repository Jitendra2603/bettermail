'use client';

import { SessionProvider } from 'next-auth/react';
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth';

function FirebaseAuthProvider({ children }: { children: React.ReactNode }) {
  useFirebaseAuth();
  return <>{children}</>;
}

export function AuthProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session: any;
}) {
  return (
    <SessionProvider session={session}>
      <FirebaseAuthProvider>{children}</FirebaseAuthProvider>
    </SessionProvider>
  );
} 