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
  // Always use the custom domain in production
  if (process.env.NODE_ENV === 'production') {
    return 'https://messages.lu.vg/api/auth/callback/google';
  }
  
  // Use NEXTAUTH_URL if available
  if (process.env.NEXTAUTH_URL) {
    return `${process.env.NEXTAUTH_URL}/api/auth/callback/google`;
  }
  
  // Fallback for local development
  return 'http://localhost:3000/api/auth/callback/google';
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
    // Override the redirect callback to always go to /messages after authentication
    async redirect({ url, baseUrl }) {
      console.log("NextAuth redirect called with:", { url, baseUrl });
      
      // After successful authentication, always redirect to /messages
      if (url.includes('/api/auth/callback') || url.includes('/__/auth/handler') || url.includes('/__/hosting/verification')) {
        console.log("Redirecting to /messages after callback");
        return `${baseUrl}/messages`;
      }
      
      // For other URLs, use default behavior
      if (url.startsWith(baseUrl)) {
        console.log("URL starts with baseUrl, returning as is:", url);
        return url;
      }
      
      if (url.startsWith('/')) {
        console.log("URL starts with /, returning with baseUrl:", `${baseUrl}${url}`);
        return `${baseUrl}${url}`;
      }
      
      console.log("Returning URL as is:", url);
      return url;
    },
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
  debug: process.env.NODE_ENV !== 'production', // Enable debug logs in development
  secret: process.env.NEXTAUTH_SECRET,
}; 