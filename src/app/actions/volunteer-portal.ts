'use server';

import { createHash, randomInt } from 'crypto';
import { cookies } from 'next/headers';
import { ID, MessagingProviderType, Permission, Query, Role } from 'node-appwrite';
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
  sendDirectSmsMessage,
  sendVolunteerPortalSmsCode,
} from '@/lib/sms-provider';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const ADMIN_TEAM_ID = process.env.NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID!;
const PROJECTS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID!;
const VOLUNTEERS_COLLECTION_ID = 'project_volunteers';
const VOLUNTEER_PORTAL_TOKENS_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_VOLUNTEER_PORTAL_TOKENS_COLLECTION_ID || 'volunteer_portal_tokens';
const VOLUNTEER_PORTAL_CODE_MAX_AGE = 15 * 60;

type VolunteerPortalChannel = 'email' | 'sms';

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
}): Promise<PortalActionResult<{ channel: VolunteerPortalChannel; maskedDestination: string }>> {
  try {
    const admin = await createAdminClient();
    await ensureVolunteerPortalTokenSchema(admin.databases);

    const project = await findProjectBySlug(data.projectSlug);
    const match = await findVolunteerByIdentifier(project.$id, data.identifier);
    const volunteerId = match.volunteer.$id || '';
    if (!volunteerId) {
      throw new Error('Voluntarul nu a fost găsit.');
    }

    await ensureVolunteerPortalRequestCooldown(admin.databases, volunteerId, project.$id, match.channel);
    await cleanupVolunteerPortalTokens(admin.databases, volunteerId, project.$id, match.channel);

    const code = generateVolunteerPortalCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + VOLUNTEER_PORTAL_CODE_MAX_AGE * 1000).toISOString();

    const tokenDoc = await admin.databases.createDocument(
      DATABASE_ID,
      VOLUNTEER_PORTAL_TOKENS_COLLECTION_ID,
      ID.unique(),
      {
        volunteerId,
        projectId: project.$id,
        channel: match.channel,
        identifier: match.normalizedIdentifier,
        tokenHash: hashVolunteerPortalCode(volunteerId, project.$id, match.channel, match.normalizedIdentifier, code),
        expiresAt,
        usedAt: '',
        createdAt: now.toISOString(),
      },
    );

    try {
      if (match.channel === 'sms') {
        await sendVolunteerPortalAccessSms(match.destination, code);
      } else {
        await sendVolunteerPortalAccessEmail({
          volunteerId,
          volunteerName: buildVolunteerFullName(match.volunteer),
          email: match.destination,
          code,
        });
      }
    } catch (deliveryError) {
      await admin.databases.deleteDocument(DATABASE_ID, VOLUNTEER_PORTAL_TOKENS_COLLECTION_ID, tokenDoc.$id);
      throw deliveryError;
    }

    return {
      success: true,
      data: {
        channel: match.channel,
        maskedDestination: match.maskedDestination,
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
    const admin = await createAdminClient();
    await ensureVolunteerPortalTokenSchema(admin.databases);

    const project = await findProjectBySlug(data.projectSlug);
    const match = await findVolunteerByIdentifier(project.$id, data.identifier);
    const volunteer = match.volunteer;

    if (!volunteer.$id) {
      throw new Error('Voluntarul nu a fost găsit.');
    }

    const tokensRes = await admin.databases.listDocuments(DATABASE_ID, VOLUNTEER_PORTAL_TOKENS_COLLECTION_ID, [
      Query.equal('volunteerId', volunteer.$id),
      Query.equal('projectId', project.$id),
      Query.equal('channel', match.channel),
      Query.orderDesc('$createdAt'),
      Query.limit(20),
    ]);

    const sanitizedCode = sanitizeVolunteerValue(data.code, 32).replace(/\s+/g, '');
    const tokenHash = hashVolunteerPortalCode(
      volunteer.$id,
      project.$id,
      match.channel,
      match.normalizedIdentifier,
      sanitizedCode,
    );
    const tokenDoc = tokensRes.documents.find((document) => {
      const payload = JSON.parse(JSON.stringify(document)) as {
        tokenHash?: string;
        identifier?: string;
      };
      return payload.tokenHash === tokenHash && payload.identifier === match.normalizedIdentifier;
    });

    if (!tokenDoc) {
      throw new Error('Codul introdus este invalid.');
    }

    const tokenPayload = JSON.parse(JSON.stringify(tokenDoc)) as {
      $id: string;
      expiresAt?: string;
      usedAt?: string;
    };

    if (tokenPayload.usedAt) {
      throw new Error('Codul a fost deja folosit. Cere unul nou.');
    }

    if (!tokenPayload.expiresAt || new Date(tokenPayload.expiresAt).getTime() <= Date.now()) {
      throw new Error('Codul a expirat. Cere unul nou.');
    }

    await admin.databases.updateDocument(
      DATABASE_ID,
      VOLUNTEER_PORTAL_TOKENS_COLLECTION_ID,
      tokenPayload.$id,
      { usedAt: new Date().toISOString() },
    );

    await ensureVolunteerProfileAttributes(admin.databases);

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

async function findVolunteerByIdentifier(projectId: string, identifier: string) {
  const { databases } = await createAdminClient();
  const resolvedIdentifier = resolveVolunteerPortalIdentifier(identifier);

  const res = await databases.listDocuments(DATABASE_ID, VOLUNTEERS_COLLECTION_ID, [
    Query.equal('projectId', projectId),
    Query.limit(500),
  ]);

  const volunteers = (JSON.parse(JSON.stringify(res.documents)) as ProjectVolunteer[]).filter(
    (item) => item.status !== 'archived',
  );
  const matches = volunteers.filter((item) => {
    if (resolvedIdentifier.channel === 'email') {
      return sanitizeVolunteerEmail(item.email) === resolvedIdentifier.normalizedIdentifier;
    }

    return normalizeVolunteerPhoneForMatch(item.phone) === resolvedIdentifier.normalizedIdentifier;
  });

  if (matches.length === 0) {
    throw new Error('Nu am găsit niciun voluntar cu acest email sau telefon în proiect.');
  }

  if (matches.length > 1) {
    throw new Error('Există mai mulți voluntari cu acest contact în proiect. Verifică registrul voluntarilor.');
  }

  const volunteer = matches[0];
  const destination = resolvedIdentifier.channel === 'email' ? volunteer.email || '' : volunteer.phone || '';
  if (!destination) {
    throw new Error('Voluntarul nu are contactul selectat configurat.');
  }

  return {
    volunteer,
    channel: resolvedIdentifier.channel,
    normalizedIdentifier: resolvedIdentifier.normalizedIdentifier,
    destination,
    maskedDestination:
      resolvedIdentifier.channel === 'email' ? maskEmail(destination) : maskPhoneNumber(destination),
  };
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

async function ensureVolunteerPortalRequestCooldown(
  databases: Awaited<ReturnType<typeof createAdminClient>>['databases'],
  volunteerId: string,
  projectId: string,
  channel: VolunteerPortalChannel,
) {
  const recent = await databases.listDocuments(DATABASE_ID, VOLUNTEER_PORTAL_TOKENS_COLLECTION_ID, [
    Query.equal('volunteerId', volunteerId),
    Query.equal('projectId', projectId),
    Query.equal('channel', channel),
    Query.orderDesc('$createdAt'),
    Query.limit(1),
  ]);

  if (recent.total === 0) {
    return;
  }

  const lastRequest = JSON.parse(JSON.stringify(recent.documents[0])) as { createdAt?: string };
  if (!lastRequest.createdAt) {
    return;
  }

  const elapsed = Date.now() - new Date(lastRequest.createdAt).getTime();
  if (elapsed < 60_000) {
    throw new Error('Ai cerut deja un cod recent. Încearcă din nou peste câteva secunde.');
  }
}

async function cleanupVolunteerPortalTokens(
  databases: Awaited<ReturnType<typeof createAdminClient>>['databases'],
  volunteerId: string,
  projectId: string,
  channel: VolunteerPortalChannel,
) {
  const existing = await databases.listDocuments(DATABASE_ID, VOLUNTEER_PORTAL_TOKENS_COLLECTION_ID, [
    Query.equal('volunteerId', volunteerId),
    Query.equal('projectId', projectId),
    Query.equal('channel', channel),
    Query.limit(50),
  ]);

  await Promise.all(
    existing.documents.map((document) =>
      databases.deleteDocument(DATABASE_ID, VOLUNTEER_PORTAL_TOKENS_COLLECTION_ID, document.$id),
    ),
  );
}

async function sendVolunteerPortalAccessSms(phoneNumber: string, code: string) {
  await sendDirectSmsMessage(
    normalizeVolunteerPhoneForMatch(phoneNumber),
    buildVolunteerPortalSmsTemplate().replace('{{code}}', code),
  );
}

async function sendVolunteerPortalAccessEmail(data: {
  volunteerId: string;
  volunteerName: string;
  email: string;
  code: string;
}) {
  const admin = await createAdminClient();
  const userId = buildVolunteerPortalShadowUserId(data.volunteerId);
  const targetId = buildVolunteerPortalEmailTargetId(data.volunteerId);

  await ensureVolunteerPortalShadowUser(admin.users, userId, data.volunteerName);
  await ensureVolunteerPortalEmailTarget(admin.users, userId, targetId, data.email, data.volunteerName);

  const html = [
    `<p>Bună, ${escapeHtml(data.volunteerName)}.</p>`,
    '<p>Codul tău de acces pentru portalul voluntarului este:</p>',
    `<p style="font-size: 28px; font-weight: 700; letter-spacing: 0.25em;">${escapeHtml(data.code)}</p>`,
    '<p>Codul este valabil 15 minute și poate fi folosit o singură dată.</p>',
  ].join('');

  await admin.messaging.createEmail({
    messageId: ID.unique(),
    subject: 'Cod acces portal voluntar DGPT',
    content: html,
    targets: [targetId],
    html: true,
  });
}

async function ensureVolunteerPortalShadowUser(
  users: Awaited<ReturnType<typeof createAdminClient>>['users'],
  userId: string,
  volunteerName: string,
) {
  try {
    await users.get({ userId });
  } catch (error: unknown) {
    if (getErrorCode(error) !== 404) {
      throw error;
    }

    await users.create({
      userId,
      name: `Portal voluntar ${volunteerName}`.slice(0, 128),
    });
  }
}

async function ensureVolunteerPortalEmailTarget(
  users: Awaited<ReturnType<typeof createAdminClient>>['users'],
  userId: string,
  targetId: string,
  email: string,
  volunteerName: string,
) {
  try {
    await users.getTarget({ userId, targetId });
    await users.updateTarget({
      userId,
      targetId,
      identifier: email,
      name: `Email ${volunteerName}`.slice(0, 128),
    });
  } catch (error: unknown) {
    if (getErrorCode(error) !== 404) {
      throw error;
    }

    await users.createTarget({
      userId,
      targetId,
      providerType: MessagingProviderType.Email,
      identifier: email,
      name: `Email ${volunteerName}`.slice(0, 128),
    });
  }
}

async function ensureVolunteerPortalTokenSchema(
  databases: Awaited<ReturnType<typeof createAdminClient>>['databases'],
) {
  await ensureVolunteerPortalTokensCollection(databases);
  await ensureVolunteerPortalTokenAttributes(databases);
  await ensureVolunteerPortalTokenIndexes(databases);
}

async function ensureVolunteerPortalTokensCollection(
  databases: Awaited<ReturnType<typeof createAdminClient>>['databases'],
) {
  try {
    await databases.getCollection(DATABASE_ID, VOLUNTEER_PORTAL_TOKENS_COLLECTION_ID);
  } catch (error: unknown) {
    if (getErrorCode(error) !== 404) {
      throw error;
    }

    await databases.createCollection(
      DATABASE_ID,
      VOLUNTEER_PORTAL_TOKENS_COLLECTION_ID,
      'Volunteer Portal Tokens',
      [
        Permission.read(Role.team(ADMIN_TEAM_ID)),
        Permission.create(Role.team(ADMIN_TEAM_ID)),
        Permission.update(Role.team(ADMIN_TEAM_ID)),
        Permission.delete(Role.team(ADMIN_TEAM_ID)),
      ],
    );
  }
}

async function ensureVolunteerPortalTokenAttributes(
  databases: Awaited<ReturnType<typeof createAdminClient>>['databases'],
) {
  const attributes = [
    { key: 'volunteerId', size: 128 },
    { key: 'projectId', size: 128 },
    { key: 'channel', size: 16 },
    { key: 'identifier', size: 191 },
    { key: 'tokenHash', size: 128 },
    { key: 'expiresAt', size: 64 },
    { key: 'usedAt', size: 64 },
    { key: 'createdAt', size: 64 },
  ] as const;
  const list = await databases.listAttributes(DATABASE_ID, VOLUNTEER_PORTAL_TOKENS_COLLECTION_ID);
  const existing = new Map(list.attributes.map((attribute) => [attribute.key, attribute]));
  const createdKeys: string[] = [];

  for (const attribute of attributes) {
    if (existing.has(attribute.key)) {
      continue;
    }

    await databases.createStringAttribute(
      DATABASE_ID,
      VOLUNTEER_PORTAL_TOKENS_COLLECTION_ID,
      attribute.key,
      attribute.size,
      false,
    );
    createdKeys.push(attribute.key);
  }

  for (const key of createdKeys) {
    await waitForVolunteerPortalAttribute(databases, key);
  }
}

async function ensureVolunteerPortalTokenIndexes(
  databases: Awaited<ReturnType<typeof createAdminClient>>['databases'],
) {
  const indexes = [
    { key: 'idx_vpt_vol', attributes: ['volunteerId', 'projectId', 'channel'], orders: ['asc', 'asc', 'asc'] },
    { key: 'idx_vpt_id', attributes: ['identifier'], orders: ['asc'] },
    { key: 'idx_vpt_exp', attributes: ['expiresAt'], orders: ['asc'] },
  ] as const;

  for (const index of indexes) {
    try {
      await (databases as unknown as {
        createIndex: (
          databaseId: string,
          collectionId: string,
          key: string,
          type: string,
          attributes: string[],
          orders: string[],
        ) => Promise<unknown>;
      }).createIndex(
        DATABASE_ID,
        VOLUNTEER_PORTAL_TOKENS_COLLECTION_ID,
        index.key,
        'key',
        [...index.attributes],
        [...index.orders],
      );
    } catch (error: unknown) {
      if (getErrorCode(error) !== 409) {
        throw error;
      }
    }
  }
}

async function waitForVolunteerPortalAttribute(
  databases: Awaited<ReturnType<typeof createAdminClient>>['databases'],
  key: string,
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const attribute = await databases.getAttribute(DATABASE_ID, VOLUNTEER_PORTAL_TOKENS_COLLECTION_ID, key);

    if (attribute.status === 'available') {
      return;
    }

    if (attribute.status === 'failed' || attribute.status === 'stuck') {
      throw new Error(`Volunteer portal attribute "${key}" is ${attribute.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Volunteer portal attribute "${key}" is still processing.`);
}

function resolveVolunteerPortalIdentifier(identifier: string) {
  const raw = sanitizeVolunteerValue(identifier, 191);
  const looksEmail = raw.includes('@');
  const normalizedEmail = looksEmail ? sanitizeVolunteerEmail(raw) : '';
  const normalizedPhone = looksEmail ? '' : normalizeVolunteerPhoneForMatch(raw);

  if (normalizedEmail) {
    return {
      channel: 'email' as const,
      normalizedIdentifier: normalizedEmail,
    };
  }

  if (normalizedPhone) {
    return {
      channel: 'sms' as const,
      normalizedIdentifier: normalizedPhone,
    };
  }

  throw new Error('Introdu un email sau un număr de telefon valid.');
}

function generateVolunteerPortalCode() {
  return String(randomInt(100000, 1_000_000));
}

function hashVolunteerPortalCode(
  volunteerId: string,
  projectId: string,
  channel: VolunteerPortalChannel,
  identifier: string,
  code: string,
) {
  return createHash('sha256')
    .update(`${volunteerId}:${projectId}:${channel}:${identifier}:${code}:${process.env.VOLUNTEER_PORTAL_SECRET || 'dgpt-volunteer-portal'}`)
    .digest('hex');
}

function buildVolunteerPortalShadowUserId(volunteerId: string) {
  return `volprt_${volunteerId}`.slice(0, 36);
}

function buildVolunteerPortalEmailTargetId(volunteerId: string) {
  return `volem_${volunteerId}`.slice(0, 36);
}

function buildVolunteerPortalSmsTemplate() {
  return (
    process.env.VOLUNTEER_PORTAL_SMS_TEMPLATE ||
    'Codul tău DGPT pentru portalul voluntarului este {{code}}. Valabil 15 minute.'
  );
}

function buildVolunteerFullName(volunteer?: Pick<ProjectVolunteer, 'firstName' | 'lastName'> | null) {
  return [volunteer?.firstName || '', volunteer?.lastName || '']
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim() || 'voluntar';
}

function maskEmail(value?: string) {
  const [localPart, domain] = (value || '').split('@');
  if (!localPart || !domain) {
    return value || 'email';
  }

  const visibleLocal = localPart.length <= 2 ? `${localPart[0] || ''}•` : `${localPart.slice(0, 2)}•••`;
  return `${visibleLocal}@${domain}`;
}

function maskPhoneNumber(value?: string) {
  const digits = (value || '').replace(/\D+/g, '');
  if (digits.length <= 4) {
    return value || 'telefon';
  }

  return `${digits.slice(0, 2)}••••${digits.slice(-2)}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getErrorCode(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'number') {
    return error.code;
  }

  return undefined;
}
