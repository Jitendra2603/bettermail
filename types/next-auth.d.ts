import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    firebaseToken?: string;
    profile?: any;
    user: {
      id: string;
      name: string;
      email: string;
      image?: string;
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