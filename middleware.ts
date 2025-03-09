import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Handle Firebase Authentication handler
  if (pathname.startsWith('/__/auth/handler')) {
    // Create a new URL for the redirect destination
    const url = request.nextUrl.clone();
    url.pathname = '/api/auth/callback/google';
    
    // Copy all query parameters
    const searchParams = new URLSearchParams(request.nextUrl.search);
    url.search = searchParams.toString();
    
    // Return a redirect response
    return NextResponse.redirect(url);
  }
  
  // If we detect an OAuth error, log it and redirect to /messages
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
    '/__/auth/handler',
    '/api/auth/error/:path*',
  ],
}; 