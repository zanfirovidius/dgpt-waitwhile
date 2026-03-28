import { Client, Account, Databases } from 'node-appwrite';
import { cookies } from 'next/headers';

/**
 * Creates a server-side Appwrite client using the API key.
 * Use this for high-permission operations that don't depend on a user session.
 */
export async function createAdminClient() {
  const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
    .setKey(process.env.APPWRITE_API_KEY!);

  return {
    account: new Account(client),
    databases: new Databases(client),
  };
}

/**
 * Creates a server-side Appwrite client that forwards the user's session cookie.
 */
export async function createSessionClient() {
  const cookieStore = await cookies();
  const sessionCookieName = 'a_session_' + process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID?.toLowerCase();
  const sessionCookie = cookieStore.get(sessionCookieName);

  if (!sessionCookie?.value) {
    throw new Error('No active session');
  }

  const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
    .setSession(sessionCookie.value);

  return {
    account: new Account(client),
    databases: new Databases(client),
  };
}
