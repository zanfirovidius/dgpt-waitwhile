import { NextResponse } from 'next/server';
import {
  APPWRITE_SESSION_JWT_COOKIE,
  APPWRITE_SESSION_JWT_MAX_AGE,
} from '@/lib/appwrite-auth';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { jwt?: string };
    const jwt = body.jwt?.trim();

    if (!jwt) {
      return NextResponse.json({ success: false, error: 'JWT lipsă.' }, { status: 400 });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(APPWRITE_SESSION_JWT_COOKIE, jwt, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: APPWRITE_SESSION_JWT_MAX_AGE,
    });

    return response;
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Cerere invalidă.' },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });

  response.cookies.set(APPWRITE_SESSION_JWT_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });

  return response;
}
