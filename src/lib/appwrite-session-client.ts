'use client';

import { account } from '@/lib/appwrite';

const SESSION_SYNC_ENDPOINT = '/api/auth/session';

export async function syncServerSessionFromBrowser() {
  const jwt = await account.createJWT();

  const response = await fetch(SESSION_SYNC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify({ jwt: jwt.jwt }),
  });

  if (!response.ok) {
    throw new Error('Nu am putut sincroniza sesiunea pentru server.');
  }
}

export async function clearServerSessionCookie() {
  const response = await fetch(SESSION_SYNC_ENDPOINT, {
    method: 'DELETE',
    credentials: 'same-origin',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Nu am putut șterge sesiunea de server.');
  }
}
