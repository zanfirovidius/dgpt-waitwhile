import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth0 } from './lib/auth0';

export async function proxy(request: NextRequest) {
  // 1. Run the Auth0 middleware (which intercepts /auth/login, /auth/callback, etc.)
  const authResponse = await auth0.middleware(request);

  // 2. If it's an internal Next.js, Auth0 API path, or the new Public Dashboard, let it pass through
  if (request.nextUrl.pathname.startsWith('/auth') || request.nextUrl.pathname.startsWith('/_next') || request.nextUrl.pathname.startsWith('/favicon.ico') || request.nextUrl.pathname.startsWith('/public')) {
    return authResponse;
  }

  // 3. Check for a valid session securely
  const session = await auth0.getSession(request);
  
  // 4. If there is no session, boot them to the hosted login page via /auth/login
  if (!session) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('returnTo', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return authResponse;
}

export const config = {
  matcher: [
    // Apply this middleware to the entire app except static assets
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
