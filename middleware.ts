import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  
  // If we detect an OAuth error, log it and redirect to /messages
  // This is a fallback in case the authentication flow fails
  if (pathname.startsWith('/api/auth/error')) {
    console.log('Auth error detected, redirecting to /messages');
    
    // Create a new URL for the redirect destination
    const url = request.nextUrl.clone();
    url.pathname = '/messages';
    url.search = '';
    
    // Return a redirect response
    return NextResponse.redirect(url);
  }
  
  return NextResponse.next();
}

// Configure the middleware to run only on specific paths
export const config = {
  matcher: [
    '/api/auth/error/:path*',
  ],
}; 