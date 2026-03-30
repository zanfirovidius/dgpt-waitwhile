import { createHmac, timingSafeEqual } from 'crypto';

export const VOLUNTEER_PORTAL_COOKIE = 'dgpt_volunteer_portal';
export const VOLUNTEER_PORTAL_MAX_AGE = 60 * 60 * 24 * 7;

export type VolunteerPortalSession = {
  volunteerId: string;
  projectId: string;
  projectSlug: string;
  exp: number;
};

export function createVolunteerPortalToken(session: VolunteerPortalSession) {
  const payload = base64UrlEncode(JSON.stringify(session));
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

export function verifyVolunteerPortalToken(token?: string | null) {
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split('.');
  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const session = JSON.parse(base64UrlDecode(payload)) as VolunteerPortalSession;
    if (!session.volunteerId || !session.projectId || !session.projectSlug || !session.exp) {
      return null;
    }

    if (session.exp * 1000 <= Date.now()) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

function signPayload(payload: string) {
  return createHmac('sha256', getVolunteerPortalSecret()).update(payload).digest('base64url');
}

function getVolunteerPortalSecret() {
  const secret =
    process.env.VOLUNTEER_PORTAL_SECRET ||
    process.env.APPWRITE_API_KEY ||
    process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;

  if (!secret) {
    throw new Error('Volunteer portal secret is not configured.');
  }

  return secret;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}
