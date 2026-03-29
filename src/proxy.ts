import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Authentication is currently enforced client-side via GlobalLayoutWrapper.
// Keeping the proxy as a pass-through avoids server-side login loops with Appwrite sessions.
export function proxy(request: NextRequest) {
  void request;
  return NextResponse.next();
}
