import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname, host } = request.nextUrl;
  
  // Log the request details for debugging
  console.log('Middleware request:', { pathname, host, url: request.url });
  
  // Handle Firebase Authentication handler
  if (pathname.startsWith('/__/auth/handler')) {
    // Create a new URL for the redirect destination
    const url = request.nextUrl.clone();
    url.pathname = '/api/auth/callback/google';
    
    // Copy all query parameters
    const searchParams = new URLSearchParams(request.nextUrl.search);
    url.search = searchParams.toString();
    
    console.log('Redirecting from /__/auth/handler to:', url.toString());
    
    // Return a redirect response
    return NextResponse.redirect(url);
  }
  
  // If we detect an OAuth error, log it and redirect to /login
  if (pathname.startsWith('/api/auth/error')) {
    console.log('Auth error detected, redirecting to /login');
    console.log('Error details:', request.nextUrl.search);
    
    // Create a new URL for the redirect destination
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    
    // Add error parameter
    const searchParams = new URLSearchParams(request.nextUrl.search);
    if (searchParams.has('error')) {
      url.searchParams.set('error', searchParams.get('error')!);
    }
    
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