'use server';

import { cookies } from 'next/headers';
import { Query } from 'node-appwrite';
import { getProjectAttendanceConfig } from '@/app/actions/attendance-config';
import { getVolunteerAttendanceEntries } from '@/app/actions/attendance';
import {
  type ProjectVolunteer,
  ensureVolunteerProfileAttributes,
} from '@/app/actions/volunteers';
import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import {
  VOLUNTEER_PORTAL_COOKIE,
  VOLUNTEER_PORTAL_MAX_AGE,
  createVolunteerPortalToken,
  verifyVolunteerPortalToken,
} from '@/lib/volunteer-portal-auth';
import { normalizeName } from '@/lib/name-utils';
import {
  normalizeVolunteerPhoneForMatch,
  sanitizeVolunteerEmail,
  sanitizeVolunteerPhone,
  sanitizeVolunteerValue,
} from '@/lib/volunteer-utils';
import {
  sendVolunteerPortalSmsCode,
  verifyVolunteerPortalSmsCode,
} from '@/lib/sms-provider';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const PROJECTS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID!;
const VOLUNTEERS_COLLECTION_ID = 'project_volunteers';

type PortalProject = {
  $id: string;
  name: string;
  eventName?: string;
  projectSlug?: string;
  locationName?: string;
  city?: string;
  venue?: string;
};

type PortalActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type VolunteerPortalState = {
  authenticated: boolean;
  project: PortalProject;
  volunteer?: ProjectVolunteer;
  attendanceUrl?: string;
  attendanceHistory?: Awaited<ReturnType<typeof getVolunteerAttendanceEntries>> extends { data?: infer T } ? T : never;
  documents: Array<{ id: string; title: string; status: 'pending' | 'signed'; href?: string }>;
};

export async function getVolunteerPortalState(
  projectSlug: string,
): Promise<PortalActionResult<VolunteerPortalState>> {
  try {
    const { databases } = await createAdminClient();
    const project = await findProjectBySlug(projectSlug);

    const cookieStore = await cookies();
    const session = verifyVolunteerPortalToken(cookieStore.get(VOLUNTEER_PORTAL_COOKIE)?.value);

    if (!session || session.projectSlug !== projectSlug || session.projectId !== project.$id) {
      return {
        success: true,
        data: {
          authenticated: false,
          project,
          documents: [],
        },
      };
    }

    const volunteerDoc = await databases.getDocument(DATABASE_ID, VOLUNTEERS_COLLECTION_ID, session.volunteerId);
    const volunteer = JSON.parse(JSON.stringify(volunteerDoc)) as ProjectVolunteer;
    const attendanceConfigRes = await getProjectAttendanceConfig(project.$id);
    const attendanceHistoryRes = await getVolunteerAttendanceEntries(session.volunteerId);

    const attendanceUrl =
      attendanceConfigRes.success &&
      attendanceConfigRes.data?.attendanceEnabled &&
      project.projectSlug
        ? buildVolunteerAttendanceUrl(project.projectSlug, attendanceConfigRes.data.attendanceAccessToken, volunteer)
        : undefined;

    return {
      success: true,
      data: {
        authenticated: true,
        project,
        volunteer,
        attendanceUrl,
        attendanceHistory: attendanceHistoryRes.success ? attendanceHistoryRes.data || [] : [],
        documents: [],
      },
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Nu am putut încărca portalul voluntarului.',
    };
  }
}

export async function requestVolunteerPortalAccess(data: {
  projectSlug: string;
  identifier: string;
}): Promise<PortalActionResult<{ maskedPhone: string }>> {
  try {
    const project = await findProjectBySlug(data.projectSlug);
    const volunteer = await findVolunteerByIdentifier(project.$id, data.identifier);

    if (!volunteer.phone) {
      throw new Error('Voluntarul nu are număr de telefon configurat pentru acest proiect.');
    }

    const phoneNumber = normalizeVolunteerPhoneForMatch(volunteer.phone);
    if (!phoneNumber) {
      throw new Error('Numărul de telefon al voluntarului nu este valid pentru OTP.');
    }

    await sendVolunteerPortalSmsCode(phoneNumber);

    return {
      success: true,
      data: {
        maskedPhone: maskPhoneNumber(volunteer.phone),
      },
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Nu am putut trimite codul de acces.',
    };
  }
}

export async function sendVolunteerPortalTestSms(data: {
  projectSlug: string;
  phone: string;
}): Promise<PortalActionResult<{ maskedPhone: string; provider: 'smsapi' | 'smswapi' }>> {
  try {
    const { account } = await createSessionClient();
    await account.get();

    await findProjectBySlug(data.projectSlug);

    const sanitizedPhone = sanitizeVolunteerPhone(data.phone);
    const normalizedPhone = normalizeVolunteerPhoneForMatch(sanitizedPhone);

    if (!normalizedPhone) {
      throw new Error('Introdu un număr de telefon valid pentru testul SMS.');
    }

    const result = await sendVolunteerPortalSmsCode(normalizedPhone);

    return {
      success: true,
      data: {
        maskedPhone: maskPhoneNumber(sanitizedPhone || normalizedPhone),
        provider: result.provider,
      },
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Nu am putut trimite SMS-ul de test.',
    };
  }
}

export async function verifyVolunteerPortalAccess(data: {
  projectSlug: string;
  identifier: string;
  code: string;
}): Promise<PortalActionResult<{ redirectTo: string }>> {
  try {
    const { databases } = await createAdminClient();
    const project = await findProjectBySlug(data.projectSlug);
    const volunteer = await findVolunteerByIdentifier(project.$id, data.identifier);

    if (!volunteer.$id) {
      throw new Error('Voluntarul nu a fost găsit.');
    }

    const phoneNumber = normalizeVolunteerPhoneForMatch(volunteer.phone);
    if (!phoneNumber) {
      throw new Error('Voluntarul nu are un număr de telefon valid pentru verificare.');
    }

    const verification = await verifyVolunteerPortalSmsCode(
      phoneNumber,
      sanitizeVolunteerValue(data.code, 16),
    );
    if (!verification.success) {
      throw new Error(verification.error);
    }

    await ensureVolunteerProfileAttributes(databases);

    const cookieStore = await cookies();
    cookieStore.set(
      VOLUNTEER_PORTAL_COOKIE,
      createVolunteerPortalToken({
        volunteerId: volunteer.$id,
        projectId: project.$id,
        projectSlug: data.projectSlug,
        exp: Math.floor(Date.now() / 1000) + VOLUNTEER_PORTAL_MAX_AGE,
      }),
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: VOLUNTEER_PORTAL_MAX_AGE,
      },
    );

    return {
      success: true,
      data: {
        redirectTo: `/v/${data.projectSlug}`,
      },
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Codul nu a putut fi verificat.',
    };
  }
}

export async function logoutVolunteerPortal(): Promise<PortalActionResult<{ success: true }>> {
  const cookieStore = await cookies();
  cookieStore.set(VOLUNTEER_PORTAL_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });

  return { success: true, data: { success: true } };
}

export async function updateVolunteerPortalProfile(data: {
  projectSlug: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: string;
  cnp?: string;
  identitySeries?: string;
  identityNumber?: string;
}): Promise<PortalActionResult<ProjectVolunteer>> {
  try {
    const { databases } = await createAdminClient();
    await ensureVolunteerProfileAttributes(databases);

    const session = await requirePortalSession(data.projectSlug);
    const currentDoc = await databases.getDocument(DATABASE_ID, VOLUNTEERS_COLLECTION_ID, session.volunteerId);
    const currentVolunteer = JSON.parse(JSON.stringify(currentDoc)) as ProjectVolunteer;

    const firstName = sanitizeVolunteerValue(data.firstName);
    const lastName = sanitizeVolunteerValue(data.lastName);
    if (!firstName || !lastName) {
      throw new Error('Numele și prenumele sunt obligatorii.');
    }

    const updated = await databases.updateDocument(DATABASE_ID, VOLUNTEERS_COLLECTION_ID, session.volunteerId, {
      firstName,
      lastName,
      fullNameNormalized: normalizeName(`${firstName} ${lastName}`),
      email: sanitizeVolunteerEmail(data.email),
      phone: sanitizeVolunteerPhone(data.phone),
      address: sanitizeVolunteerValue(data.address, 255),
      cnp: sanitizeVolunteerValue(data.cnp, 32),
      identitySeries: sanitizeVolunteerValue(data.identitySeries, 16).toUpperCase(),
      identityNumber: sanitizeVolunteerValue(data.identityNumber, 32).toUpperCase(),
    });

    return {
      success: true,
      data: {
        ...currentVolunteer,
        ...JSON.parse(JSON.stringify(updated)),
      } as ProjectVolunteer,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Nu am putut actualiza profilul voluntarului.',
    };
  }
}

async function requirePortalSession(projectSlug: string) {
  const cookieStore = await cookies();
  const session = verifyVolunteerPortalToken(cookieStore.get(VOLUNTEER_PORTAL_COOKIE)?.value);

  if (!session || session.projectSlug !== projectSlug) {
    throw new Error('Sesiunea portalului a expirat. Cere un cod nou.');
  }

  return session;
}

async function findProjectBySlug(projectSlug: string): Promise<PortalProject> {
  const { databases } = await createAdminClient();
  const res = await databases.listDocuments(DATABASE_ID, PROJECTS_COLLECTION_ID, [
    Query.equal('projectSlug', projectSlug),
    Query.limit(1),
  ]);

  if (res.total === 0) {
    throw new Error('Proiectul nu a fost găsit.');
  }

  return JSON.parse(JSON.stringify(res.documents[0])) as PortalProject;
}

async function findVolunteerByIdentifier(projectId: string, identifier: string): Promise<ProjectVolunteer> {
  const { databases } = await createAdminClient();
  const normalizedEmail = sanitizeVolunteerEmail(identifier);
  const normalizedPhone = normalizeVolunteerPhoneForMatch(identifier);

  const res = await databases.listDocuments(DATABASE_ID, VOLUNTEERS_COLLECTION_ID, [
    Query.equal('projectId', projectId),
    Query.limit(500),
  ]);

  const volunteers = JSON.parse(JSON.stringify(res.documents)) as ProjectVolunteer[];
  const volunteer = volunteers.find((item) => {
    if (item.status === 'archived') {
      return false;
    }

    const matchesEmail = normalizedEmail && sanitizeVolunteerEmail(item.email) === normalizedEmail;
    const matchesPhone = normalizedPhone && normalizeVolunteerPhoneForMatch(item.phone) === normalizedPhone;
    return matchesEmail || matchesPhone;
  });

  if (!volunteer) {
    throw new Error('Nu am găsit niciun voluntar cu acest email sau telefon în proiect.');
  }

  return volunteer;
}

function buildVolunteerAttendanceUrl(
  projectSlug: string,
  accessToken: string | undefined,
  volunteer: ProjectVolunteer,
) {
  const params = new URLSearchParams();

  if (accessToken) {
    params.set('token', accessToken);
  }

  params.set('fullName', `${volunteer.firstName} ${volunteer.lastName}`.trim());
  if (volunteer.email) params.set('email', volunteer.email);
  if (volunteer.phone) params.set('phone', volunteer.phone);
  if (volunteer.activityCategory) params.set('role', volunteer.activityCategory);
  if (volunteer.cnp) params.set('cnp', volunteer.cnp);
  if (volunteer.identitySeries) params.set('identitySeries', volunteer.identitySeries);
  if (volunteer.identityNumber) params.set('identityNumber', volunteer.identityNumber);

  return `/a/${projectSlug}/attendance?${params.toString()}`;
}

function maskPhoneNumber(value?: string) {
  const digits = (value || '').replace(/\D+/g, '');
  if (digits.length <= 4) {
    return value || 'telefon';
  }

  return `${digits.slice(0, 2)}••••${digits.slice(-2)}`;
}
