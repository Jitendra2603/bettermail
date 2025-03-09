import { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { adminAuth } from "@/lib/firebase-admin";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    firebaseToken?: string;
    profile?: any;
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    firebaseToken?: string;
    profile?: any;
  }
}

// Extend the Account type to include firebase_token
declare module "next-auth" {
  interface Account {
    firebase_token?: string;
  }
}

// Determine the correct callback URL based on environment
const getCallbackUrl = () => {
  // Use NEXTAUTH_URL from environment if available, otherwise use production URL
  const baseUrl = process.env.NEXTAUTH_URL || 'https://messages.lu.vg';
  return `${baseUrl}/api/auth/callback/google`;
};

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
          access_type: "offline",
          prompt: "consent",
          redirect_uri: getCallbackUrl(),
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!account || !user) {
        console.error("No account or user data available");
        return false;
      }

      // Create a custom token for Firebase Auth with email claim
      try {
        console.log("Creating Firebase token for user:", user.id);
        const firebaseToken = await adminAuth.createCustomToken(user.id, {
          email: user.email
        });
        account.firebase_token = firebaseToken;
        return true;
      } catch (error) {
        console.error("Error creating Firebase token:", error);
        return false;
      }
    },
    async jwt({ token, account, profile }) {
      // Persist the OAuth access_token and firebase_token to the token right after signin
      if (account) {
        token.accessToken = account.access_token;
        token.firebaseToken = account.firebase_token;
        token.profile = profile;
      }
      return token;
    },
    async session({ session, token }) {
      // Send properties to the client
      session.accessToken = token.accessToken;
      session.firebaseToken = token.firebaseToken;
      session.profile = token.profile;
      if (session.user) {
        session.user.id = token.sub;
      }
      return session;
    },
    // Add a redirect callback to ensure users are redirected to /messages after login
    async redirect({ url, baseUrl }) {
      // If the URL starts with the base URL, it's a relative URL
      if (url.startsWith(baseUrl)) {
        // If it's the callback URL, redirect to /messages
        if (url.includes('/api/auth/callback')) {
          return `${baseUrl}/messages`;
        }
        // Otherwise, keep the URL as is
        return url;
      }
      // For absolute URLs that don't start with the base URL
      // If it's an allowed external URL, allow it
      if (url.startsWith('https://accounts.google.com')) {
        return url;
      }
      // Default fallback - redirect to base URL
      return baseUrl;
    }
  },
  pages: {
    signIn: "/login",
    error: "/login", // Redirect to login page on error
  },
  // Use absolute URLs for callbacks
  useSecureCookies: process.env.NODE_ENV === 'production',
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}; 