import { Client, Account, Databases, Teams, Storage } from 'node-appwrite';
import { cookies } from 'next/headers';
import { APPWRITE_SESSION_JWT_COOKIE } from '@/lib/appwrite-auth';

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
    storage: new Storage(client),
    teams: new Teams(client),
  };
}

/**
 * Creates a server-side Appwrite client that forwards the user's session cookie.
 */
export async function createSessionClient() {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  const jwtCookie = cookieStore.get(APPWRITE_SESSION_JWT_COOKIE)?.value;
  const projectId = (process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '').toLowerCase();

  if (jwtCookie) {
    const client = new Client()
      .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
      .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
      .setJWT(jwtCookie);

    return {
      account: new Account(client),
      databases: new Databases(client),
      storage: new Storage(client),
      teams: new Teams(client),
    };
  }

  // Legacy fallback for environments where Appwrite session cookies are forwarded directly.
  const sessionCookie = allCookies.find(c =>
    c.name.toLowerCase().startsWith(`a_session_${projectId}`) ||
    c.name.toLowerCase().startsWith('a_session_')
  );

  if (!sessionCookie?.value) {
    // DEVELOPMENT FALLBACK:
    // When running on http://localhost:3000, browsers often block Appwrite Cloud cookies 
    // because they are marked 'Secure'. If we're in dev, fallback to Admin client.
    if (process.env.NODE_ENV === 'development' && process.env.APPWRITE_API_KEY) {
      console.warn('[Appwrite] No session cookie found on localhost. Falling back to Admin Client for development.');
      return createAdminClient();
    }
    
    console.error('[Appwrite] No session cookie found. Available cookies:', allCookies.map(c => c.name));
    throw new Error(`No active session found. Please log in again.`);
  }

  const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
    .setSession(sessionCookie.value);

  return {
    account: new Account(client),
    databases: new Databases(client),
    storage: new Storage(client),
    teams: new Teams(client),
  };
}
