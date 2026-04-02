'use server';

import { createHash, randomInt } from 'crypto';
import { cookies } from 'next/headers';
import { ID, MessagingProviderType, Query } from 'node-appwrite';
import { createAdminClient } from '@/lib/appwrite-server';
import { PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID } from '@/lib/cabinets-server';
import {
  DOCTOR_PORTAL_TOKENS_COLLECTION_ID,
  ensureDoctorBuckets,
  ensureDoctorsSchema,
  getDoctor,
  listDoctors,
  writeDoctorAuditLog,
} from '@/lib/doctors-server';
import {
  DOCTOR_PORTAL_COOKIE,
  DOCTOR_PORTAL_MAX_AGE,
  createDoctorPortalToken,
  verifyDoctorPortalToken,
} from '@/lib/doctor-portal-auth';
import type {
  DoctorPortalChannel,
  DoctorPortalProject,
  DoctorPortalProjectAssignment,
  DoctorRecord,
} from '@/lib/doctor-types';
import {
  buildDoctorPortalDocumentUrl,
  normalizeDoctorEmail,
  normalizeDoctorPhone,
  sanitizeDoctorText,
} from '@/lib/doctor-utils';
import { sendDirectSmsMessage } from '@/lib/sms-provider';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const PROJECTS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID!;

type PortalActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

type PortalDocumentState = {
  kind: 'cv' | 'practice-license';
  title: string;
  isUploaded: boolean;
  fileName?: string;
  uploadedAt?: string;
  href?: string;
};

export type DoctorPortalState = {
  authenticated: boolean;
  doctor?: DoctorRecord;
  projects: DoctorPortalProject[];
  documents: PortalDocumentState[];
};

type CabinetAssignmentRecord = {
  $id?: string;
  projectId: string;
  cabinetId?: string;
  cabinetName: string;
  cabinetIdentifier?: string;
  cabinetSpecialty?: string;
  assignmentDate: string;
  startTime: string;
  endTime: string;
};

type ProjectSnapshot = {
  $id: string;
  name: string;
  eventName?: string;
  projectSlug?: string;
  locationName?: string;
  city?: string;
  venue?: string;
  startDate?: string;
  endDate?: string;
};

export async function getDoctorPortalState(): Promise<PortalActionResult<DoctorPortalState>> {
  try {
    const admin = await createAdminClient();
    await ensureDoctorsSchema(admin.databases);
    await ensureDoctorBuckets(admin.storage);

    const cookieStore = await cookies();
    const session = verifyDoctorPortalToken(cookieStore.get(DOCTOR_PORTAL_COOKIE)?.value);

    if (!session?.doctorId) {
      return {
        success: true,
        data: {
          authenticated: false,
          projects: [],
          documents: [],
        },
      };
    }

    const doctor = await getDoctor(admin.databases, session.doctorId);
    if (doctor.status === 'archived') {
      await clearDoctorPortalCookie();
      return {
        success: true,
        data: {
          authenticated: false,
          projects: [],
          documents: [],
        },
      };
    }

    return {
      success: true,
      data: {
        authenticated: true,
        doctor,
        projects: await listDoctorPortalProjects(admin.databases, doctor.$id || ''),
        documents: buildDoctorPortalDocuments(doctor),
      },
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Nu am putut încărca portalul medicului.',
    };
  }
}

export async function requestDoctorPortalAccess(data: {
  identifier: string;
}): Promise<PortalActionResult<{ channel: DoctorPortalChannel; maskedDestination: string }>> {
  try {
    const admin = await createAdminClient();
    await ensureDoctorsSchema(admin.databases);

    const match = await findDoctorByIdentifier(data.identifier);
    const doctorId = match.doctor.$id || '';
    if (!doctorId) {
      throw new Error('Medicul nu a fost găsit.');
    }

    await ensureRequestCooldown(admin.databases, doctorId, match.channel);
    await cleanupDoctorPortalTokens(admin.databases, doctorId, match.channel);

    const code = generateDoctorPortalCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + DOCTOR_PORTAL_MAX_AGE * 1000).toISOString();

    const tokenDoc = await admin.databases.createDocument(
      DATABASE_ID,
      DOCTOR_PORTAL_TOKENS_COLLECTION_ID,
      ID.unique(),
      {
        doctorId,
        channel: match.channel,
        identifier: match.normalizedIdentifier,
        tokenHash: hashDoctorPortalCode(doctorId, match.channel, match.normalizedIdentifier, code),
        expiresAt,
        usedAt: '',
        createdAt: now.toISOString(),
      },
    );

    try {
      if (match.channel === 'sms') {
        await sendDoctorPortalSmsCode(match.destination, code);
      } else {
        await sendDoctorPortalEmailCode({
          doctorId,
          doctorName: match.doctor.fullName,
          email: match.destination,
          code,
        });
      }
    } catch (deliveryError) {
      await admin.databases.deleteDocument(DATABASE_ID, DOCTOR_PORTAL_TOKENS_COLLECTION_ID, tokenDoc.$id);
      throw deliveryError;
    }

    await writeDoctorAuditLog({
      databases: admin.databases,
      entityId: doctorId,
      action: 'portal_token_requested',
      actorUserId: `doctor_portal:${doctorId}`.slice(0, 50),
      after: {
        channel: match.channel,
        maskedDestination: match.maskedDestination,
        expiresAt,
      },
    });

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

export async function verifyDoctorPortalAccess(data: {
  identifier: string;
  code: string;
}): Promise<PortalActionResult<{ redirectTo: string }>> {
  try {
    const admin = await createAdminClient();
    await ensureDoctorsSchema(admin.databases);

    const match = await findDoctorByIdentifier(data.identifier);
    const doctorId = match.doctor.$id || '';
    if (!doctorId) {
      throw new Error('Medicul nu a fost găsit.');
    }

    const tokensRes = await admin.databases.listDocuments(DATABASE_ID, DOCTOR_PORTAL_TOKENS_COLLECTION_ID, [
      Query.equal('doctorId', doctorId),
      Query.equal('channel', match.channel),
      Query.orderDesc('$createdAt'),
      Query.limit(20),
    ]);

    const sanitizedCode = sanitizeDoctorText(data.code, 32).replace(/\s+/g, '');
    const tokenHash = hashDoctorPortalCode(doctorId, match.channel, match.normalizedIdentifier, sanitizedCode);
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
      DOCTOR_PORTAL_TOKENS_COLLECTION_ID,
      tokenPayload.$id,
      { usedAt: new Date().toISOString() },
    );

    const cookieStore = await cookies();
    cookieStore.set(
      DOCTOR_PORTAL_COOKIE,
      createDoctorPortalToken({
        doctorId,
        exp: Math.floor(Date.now() / 1000) + DOCTOR_PORTAL_MAX_AGE,
      }),
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: DOCTOR_PORTAL_MAX_AGE,
      },
    );

    await writeDoctorAuditLog({
      databases: admin.databases,
      entityId: doctorId,
      action: 'portal_login',
      actorUserId: `doctor_portal:${doctorId}`.slice(0, 50),
      after: {
        channel: match.channel,
        loggedInAt: new Date().toISOString(),
      },
    });

    return {
      success: true,
      data: {
        redirectTo: '/m',
      },
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Codul nu a putut fi verificat.',
    };
  }
}

export async function logoutDoctorPortal(): Promise<PortalActionResult<{ success: true }>> {
  await clearDoctorPortalCookie();
  return { success: true, data: { success: true } };
}

async function findDoctorByIdentifier(identifier: string) {
  const admin = await createAdminClient();
  const doctors = await listDoctors(admin.databases);
  const normalizedEmail = normalizeDoctorEmail(identifier);
  const normalizedPhone = normalizedEmail ? '' : normalizeDoctorPhone(identifier);
  const channel: DoctorPortalChannel = normalizedEmail ? 'email' : 'sms';
  const normalizedIdentifier = normalizedEmail || normalizedPhone;

  if (!normalizedIdentifier) {
    throw new Error('Introdu un email sau un număr de telefon valid.');
  }

  const matches = doctors.filter((doctor) => {
    if (doctor.status === 'archived') {
      return false;
    }

    if (channel === 'email') {
      return doctor.emailNormalized === normalizedIdentifier;
    }

    return doctor.phoneNormalized === normalizedIdentifier;
  });

  if (matches.length === 0) {
    throw new Error('Nu am găsit niciun medic cu acest email sau telefon.');
  }

  if (matches.length > 1) {
    throw new Error('Există mai mulți medici cu acest contact. Verifică registrul medicilor.');
  }

  const doctor = matches[0];
  const destination = channel === 'email' ? doctor.email || '' : doctor.phone || '';
  if (!destination) {
    throw new Error('Medicul nu are contactul selectat configurat.');
  }

  return {
    doctor,
    channel,
    normalizedIdentifier,
    destination,
    maskedDestination: channel === 'email' ? maskEmail(destination) : maskPhone(destination),
  };
}

async function ensureRequestCooldown(
  databases: Awaited<ReturnType<typeof createAdminClient>>['databases'],
  doctorId: string,
  channel: DoctorPortalChannel,
) {
  const recent = await databases.listDocuments(DATABASE_ID, DOCTOR_PORTAL_TOKENS_COLLECTION_ID, [
    Query.equal('doctorId', doctorId),
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

async function cleanupDoctorPortalTokens(
  databases: Awaited<ReturnType<typeof createAdminClient>>['databases'],
  doctorId: string,
  channel: DoctorPortalChannel,
) {
  const existing = await databases.listDocuments(DATABASE_ID, DOCTOR_PORTAL_TOKENS_COLLECTION_ID, [
    Query.equal('doctorId', doctorId),
    Query.equal('channel', channel),
    Query.limit(50),
  ]);

  await Promise.all(
    existing.documents.map((document) =>
      databases.deleteDocument(DATABASE_ID, DOCTOR_PORTAL_TOKENS_COLLECTION_ID, document.$id),
    ),
  );
}

async function listDoctorPortalProjects(
  databases: Awaited<ReturnType<typeof createAdminClient>>['databases'],
  doctorId: string,
) {
  const assignmentsRes = await databases.listDocuments(DATABASE_ID, PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID, [
    Query.equal('doctorId', doctorId),
    Query.orderAsc('assignmentDate'),
    Query.orderAsc('startTime'),
    Query.limit(2000),
  ]);

  const assignments = JSON.parse(JSON.stringify(assignmentsRes.documents)) as CabinetAssignmentRecord[];
  const projectIds = [...new Set(assignments.map((assignment) => assignment.projectId).filter(Boolean))];

  const projectEntries = await Promise.all(
    projectIds.map(async (projectId) => {
      try {
        const project = await databases.getDocument(DATABASE_ID, PROJECTS_COLLECTION_ID, projectId);
        return JSON.parse(JSON.stringify(project)) as ProjectSnapshot;
      } catch {
        return null;
      }
    }),
  );

  const projectsById = new Map(
    projectEntries.filter(Boolean).map((project) => [project!.$id, project!]),
  );

  return projectIds
    .map((projectId) => {
      const project = projectsById.get(projectId);
      if (!project) {
        return null;
      }

      const projectAssignments: DoctorPortalProjectAssignment[] = assignments
        .filter((assignment) => assignment.projectId === projectId)
        .map((assignment) => ({
          assignmentId: assignment.$id || '',
          assignmentDate: assignment.assignmentDate,
          startTime: assignment.startTime,
          endTime: assignment.endTime,
          cabinetId: assignment.cabinetId,
          cabinetName: assignment.cabinetName,
          cabinetIdentifier: assignment.cabinetIdentifier,
          cabinetSpecialty: assignment.cabinetSpecialty,
        }));

      return {
        projectId,
        name: project.name,
        eventName: project.eventName,
        projectSlug: project.projectSlug,
        locationName: project.locationName,
        city: project.city,
        venue: project.venue,
        startDate: project.startDate,
        endDate: project.endDate,
        assignments: projectAssignments,
      } satisfies DoctorPortalProject;
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftDate = left?.startDate || left?.assignments[0]?.assignmentDate || '';
      const rightDate = right?.startDate || right?.assignments[0]?.assignmentDate || '';
      return leftDate.localeCompare(rightDate);
    }) as DoctorPortalProject[];
}

function buildDoctorPortalDocuments(doctor: DoctorRecord): PortalDocumentState[] {
  return [
    {
      kind: 'cv',
      title: 'Curriculum Vitae',
      isUploaded: Boolean(doctor.cvFileId),
      fileName: doctor.cvFileName,
      uploadedAt: doctor.cvUploadedAt,
      href: doctor.cvFileId ? buildDoctorPortalDocumentUrl('cv', doctor.cvUploadedAt) : undefined,
    },
    {
      kind: 'practice-license',
      title: 'Drept de liberă practică',
      isUploaded: Boolean(doctor.practiceLicenseFileId),
      fileName: doctor.practiceLicenseFileName,
      uploadedAt: doctor.practiceLicenseUploadedAt,
      href: doctor.practiceLicenseFileId
        ? buildDoctorPortalDocumentUrl('practice-license', doctor.practiceLicenseUploadedAt)
        : undefined,
    },
  ];
}

async function sendDoctorPortalSmsCode(phoneNumber: string, code: string) {
  await sendDirectSmsMessage(
    phoneNumber,
    buildDoctorPortalSmsTemplate().replace('{{code}}', code),
  );
}

async function sendDoctorPortalEmailCode(data: {
  doctorId: string;
  doctorName: string;
  email: string;
  code: string;
}) {
  const admin = await createAdminClient();
  const userId = buildDoctorPortalShadowUserId(data.doctorId);
  const targetId = buildDoctorPortalEmailTargetId(data.doctorId);

  await ensureDoctorPortalShadowUser(admin.users, userId, data.doctorName);
  await ensureDoctorPortalEmailTarget(admin.users, userId, targetId, data.email, data.doctorName);

  const html = [
    `<p>Bună, ${escapeHtml(data.doctorName)}.</p>`,
    `<p>Codul tău de acces pentru portalul medicului este:</p>`,
    `<p style="font-size: 28px; font-weight: 700; letter-spacing: 0.25em;">${escapeHtml(data.code)}</p>`,
    `<p>Codul este valabil 15 minute și poate fi folosit o singură dată.</p>`,
  ].join('');

  await admin.messaging.createEmail({
    messageId: ID.unique(),
    subject: 'Cod acces portal medic DGPT',
    content: html,
    targets: [targetId],
    html: true,
  });
}

async function ensureDoctorPortalShadowUser(
  users: Awaited<ReturnType<typeof createAdminClient>>['users'],
  userId: string,
  doctorName: string,
) {
  try {
    await users.get({ userId });
  } catch (error: unknown) {
    if (getErrorCode(error) !== 404) {
      throw error;
    }

    await users.create({
      userId,
      name: `Portal medic ${doctorName}`.slice(0, 128),
    });
  }
}

async function ensureDoctorPortalEmailTarget(
  users: Awaited<ReturnType<typeof createAdminClient>>['users'],
  userId: string,
  targetId: string,
  email: string,
  doctorName: string,
) {
  try {
    await users.getTarget({ userId, targetId });
    await users.updateTarget({
      userId,
      targetId,
      identifier: email,
      name: `Email ${doctorName}`.slice(0, 128),
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
      name: `Email ${doctorName}`.slice(0, 128),
    });
  }
}

function buildDoctorPortalShadowUserId(doctorId: string) {
  return `docprt_${doctorId}`.slice(0, 36);
}

function buildDoctorPortalEmailTargetId(doctorId: string) {
  return `docemail_${doctorId}`.slice(0, 36);
}

function buildDoctorPortalSmsTemplate() {
  return (
    process.env.DOCTOR_PORTAL_SMS_TEMPLATE ||
    'Codul tău DGPT pentru portalul medicului este {{code}}. Valabil 15 minute.'
  );
}

function generateDoctorPortalCode() {
  return String(randomInt(100000, 1_000_000));
}

function hashDoctorPortalCode(
  doctorId: string,
  channel: DoctorPortalChannel,
  identifier: string,
  code: string,
) {
  return createHash('sha256')
    .update(`${doctorId}:${channel}:${identifier}:${code}:${process.env.DOCTOR_PORTAL_SECRET || 'dgpt-doctor-portal'}`)
    .digest('hex');
}

function maskEmail(value: string) {
  const [localPart, domain] = value.split('@');
  if (!localPart || !domain) {
    return value;
  }

  const visibleLocal = localPart.length <= 2 ? `${localPart[0] || ''}•` : `${localPart.slice(0, 2)}•••`;
  return `${visibleLocal}@${domain}`;
}

function maskPhone(value: string) {
  const digits = value.replace(/\D+/g, '');
  if (digits.length <= 4) {
    return value;
  }

  return `${digits.slice(0, 2)}••••${digits.slice(-2)}`;
}

async function clearDoctorPortalCookie() {
  const cookieStore = await cookies();
  cookieStore.set(DOCTOR_PORTAL_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
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
