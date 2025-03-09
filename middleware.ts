import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // If the user is trying to access the error page, redirect them to /messages
  if (pathname.startsWith('/api/auth/error')) {
    // Create a new URL for the redirect destination
    const url = request.nextUrl.clone();
    url.pathname = '/messages';
    url.search = '';
    
    // Return a redirect response
    return NextResponse.redirect(url);
  }
  
  // If the user has completed OAuth callback, redirect to /messages
  if (pathname.startsWith('/api/auth/callback')) {
    // Check if this is the final callback (not the initial OAuth redirect)
    const hasCode = request.nextUrl.searchParams.has('code');
    
    if (hasCode) {
      // This appears to be a completed OAuth flow, prepare for redirect
      // We'll let NextAuth handle this first, but our redirect callback should take over
      return NextResponse.next();
    }
  }
  
  return NextResponse.next();
}

// Configure the middleware to run only on specific paths
export const config = {
  matcher: [
    '/api/auth/error/:path*',
    '/api/auth/callback/:path*',
  ],
}; 