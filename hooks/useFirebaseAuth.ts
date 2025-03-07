import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export function useFirebaseAuth() {
  const { data: session, status } = useSession();
  const [authError, setAuthError] = useState<Error | null>(null);

  useEffect(() => {
    if (status === 'loading') return;

    const signInWithToken = async () => {
      if (session?.firebaseToken) {
        try {
          await signInWithCustomToken(auth, session.firebaseToken);
          console.log('Successfully signed in with Firebase');
          setAuthError(null);
        } catch (error) {
          console.error('Error signing in with Firebase:', error);
          setAuthError(error as Error);
          
          // Only reload if it's an auth error and we have a session
          if (error.code?.includes('auth/') && session) {
            // Wait a bit before reloading to avoid immediate refresh loops
            setTimeout(() => {
              window.location.reload();
            }, 2000);
          }
        }
      }
    };

    // Listen for auth state changes
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user && session?.firebaseToken) {
        // If we have a token but no user, try to sign in
        signInWithToken();
      }
    });

    // Initial sign in attempt
    signInWithToken();

    return () => {
      unsubscribe();
    };
  }, [session?.firebaseToken, status]);

  return { authError };
} 