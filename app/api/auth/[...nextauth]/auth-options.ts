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
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
}; 