import { createHmac, timingSafeEqual } from 'crypto';

export const DOCTOR_PORTAL_COOKIE = 'dgpt_doctor_portal';
export const DOCTOR_PORTAL_MAX_AGE = 60 * 15;

export type DoctorPortalSession = {
  doctorId: string;
  exp: number;
};

export function createDoctorPortalToken(session: DoctorPortalSession) {
  const payload = base64UrlEncode(JSON.stringify(session));
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

export function verifyDoctorPortalToken(token?: string | null) {
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
    const session = JSON.parse(base64UrlDecode(payload)) as DoctorPortalSession;
    if (!session.doctorId || !session.exp) {
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
  return createHmac('sha256', getDoctorPortalSecret()).update(payload).digest('base64url');
}

function getDoctorPortalSecret() {
  const secret =
    process.env.DOCTOR_PORTAL_SECRET ||
    process.env.APPWRITE_API_KEY ||
    process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;

  if (!secret) {
    throw new Error('Doctor portal secret is not configured.');
  }

  return secret;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}
