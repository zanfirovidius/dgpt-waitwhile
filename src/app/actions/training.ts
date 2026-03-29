'use server';

import { ID, Query } from 'node-appwrite';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import { generateTrainingReportPdf } from '@/lib/training-report';
import {
  buildTrainingArchiveFileName,
  deleteFileIfExists,
  ensureTrainingBuckets,
  ensureTrainingSchema,
  generateAccessToken,
  listTrainingEntries,
  loadTrainingReportContext,
  normalizeTrainingTopics,
  normalizeTrainingTypes,
  readProjectSnapshot,
  readTrainingSessionByPublicContext,
  resolveVolunteerIdByName,
  sanitizeIdentityNumber,
  sanitizeIdentitySeries,
  sanitizeTrainingCnp,
  saveTrainingArchivePdf,
  saveTrainingSignature,
  TRAINING_ARCHIVES_BUCKET_ID,
  TRAINING_ATTENDANCE_COLLECTION_ID,
  TRAINING_CONFIRMATION_TEXT,
  TRAINING_SESSIONS_COLLECTION_ID,
  TRAINING_SIGNATURES_BUCKET_ID,
} from '@/lib/training-server';
import { normalizeName } from '@/lib/name-utils';
import type { TrainingAttendanceEntry, TrainingSession, TrainingSessionStatus } from '@/lib/training-types';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

type PublicTrainingSessionPayload = {
  project: {
    $id: string;
    name?: string;
    eventName?: string;
    projectSlug?: string;
    locationName?: string;
    city?: string;
    venue?: string;
    volunteerRoles?: string[];
  };
  session: TrainingSession;
  confirmationText: string;
};

export async function getProjectTrainingSessions(projectId: string): Promise<ActionResult<TrainingSession[]>> {
  try {
    const { databases } = await createSessionClient();
    const admin = await createAdminClient();
    await ensureTrainingSchema(admin.databases);

    const res = await databases.listDocuments(DATABASE_ID, TRAINING_SESSIONS_COLLECTION_ID, [
      Query.equal('projectId', projectId),
      Query.orderDesc('trainingDate'),
      Query.orderDesc('$createdAt'),
      Query.limit(100),
    ]);

    return {
      success: true,
      data: JSON.parse(JSON.stringify(res.documents)) as TrainingSession[],
    };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err, 'Nu am putut încărca sesiunile de instructaj.') };
  }
}

export async function getTrainingAttendanceEntries(sessionId: string): Promise<ActionResult<TrainingAttendanceEntry[]>> {
  try {
    const { databases } = await createSessionClient();
    const entries = await listTrainingEntries(databases, sessionId);
    return { success: true, data: entries };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err, 'Nu am putut încărca participanții sesiunii.') };
  }
}

export async function getPublicTrainingSession(
  projectSlug: string,
  sessionId: string,
): Promise<ActionResult<PublicTrainingSessionPayload>> {
  try {
    const { databases } = await createAdminClient();
    const { project, session } = await readTrainingSessionByPublicContext(databases, projectSlug, sessionId);

    return {
      success: true,
      data: {
        project,
        session,
        confirmationText: TRAINING_CONFIRMATION_TEXT,
      },
    };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err, 'Sesiunea publică nu este disponibilă.') };
  }
}

export async function createTrainingSession(data: {
  projectId: string;
  eventName?: string;
  location?: string;
  trainingDate?: string;
  instructorName?: string;
  trainingTypes?: string[];
  topics?: string;
  accessToken?: string;
  status?: TrainingSessionStatus;
}): Promise<ActionResult<TrainingSession>> {
  try {
    const { databases, account } = await createSessionClient();
    const admin = await createAdminClient();
    await ensureTrainingSchema(admin.databases);

    const [project, currentUser] = await Promise.all([
      readProjectSnapshot(admin.databases, data.projectId),
      account.get(),
    ]);

    const sessionPayload: Omit<TrainingSession, '$id'> = {
      projectId: data.projectId,
      projectSlugSnapshot: project.projectSlug || '',
      eventName: data.eventName?.trim() || project.eventName || project.name || 'Instructaj colectiv',
      location:
        data.location?.trim() ||
        [project.city, project.venue].filter(Boolean).join(', ') ||
        project.locationName ||
        'Locație nespecificată',
      trainingDate: data.trainingDate || new Date().toISOString().slice(0, 10),
      instructorName: data.instructorName?.trim() || currentUser.name || '',
      instructorUserId: currentUser.$id,
      status: data.status || 'draft',
      trainingTypes: normalizeTrainingTypes(data.trainingTypes),
      topics: normalizeTrainingTopics(data.topics),
      accessToken: data.accessToken?.trim() || '',
    };

    const created = await databases.createDocument(
      DATABASE_ID,
      TRAINING_SESSIONS_COLLECTION_ID,
      ID.unique(),
      sessionPayload,
    );

    revalidateTrainingPaths(data.projectId, sessionPayload.projectSlugSnapshot);

    return {
      success: true,
      data: JSON.parse(JSON.stringify(created)) as TrainingSession,
    };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err, 'Nu am putut crea sesiunea de instructaj.') };
  }
}

export async function updateTrainingSession(
  sessionId: string,
  data: Partial<TrainingSession> & { allowOverride?: boolean },
): Promise<ActionResult<TrainingSession>> {
  try {
    const { databases } = await createSessionClient();
    const existing = await databases.getDocument(DATABASE_ID, TRAINING_SESSIONS_COLLECTION_ID, sessionId);

    if (existing.status === 'finalized' && !data.allowOverride) {
      return { success: false, error: 'Sesiunea este finalizată. Activează override pentru a o modifica.' };
    }

    const updatePayload = stripTrainingSessionSystemFields(data);
    if (updatePayload.trainingTypes) {
      updatePayload.trainingTypes = normalizeTrainingTypes(updatePayload.trainingTypes as string[]);
    }
    if (updatePayload.topics !== undefined) {
      updatePayload.topics = normalizeTrainingTopics(String(updatePayload.topics || ''));
    }
    if (updatePayload.accessToken !== undefined) {
      updatePayload.accessToken = String(updatePayload.accessToken || '').trim();
    }

    const updated = await databases.updateDocument(
      DATABASE_ID,
      TRAINING_SESSIONS_COLLECTION_ID,
      sessionId,
      updatePayload,
    );

    revalidateTrainingPaths(existing.projectId, existing.projectSlugSnapshot);

    return {
      success: true,
      data: JSON.parse(JSON.stringify(updated)) as TrainingSession,
    };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err, 'Nu am putut actualiza sesiunea.') };
  }
}

export async function updateTrainingSessionStatus(
  sessionId: string,
  status: TrainingSessionStatus,
): Promise<ActionResult<TrainingSession>> {
  try {
    const { databases } = await createSessionClient();
    const existing = await databases.getDocument(DATABASE_ID, TRAINING_SESSIONS_COLLECTION_ID, sessionId);

    if (existing.status === 'finalized' && status !== 'collecting') {
      return { success: false, error: 'Sesiunea finalizată poate fi doar redeschisă în modul override.' };
    }

    const updated = await databases.updateDocument(DATABASE_ID, TRAINING_SESSIONS_COLLECTION_ID, sessionId, {
      status,
    });

    revalidateTrainingPaths(existing.projectId, existing.projectSlugSnapshot);

    return {
      success: true,
      data: JSON.parse(JSON.stringify(updated)) as TrainingSession,
    };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err, 'Nu am putut actualiza statusul sesiunii.') };
  }
}

export async function reopenTrainingSession(sessionId: string): Promise<ActionResult<TrainingSession>> {
  try {
    const { databases } = await createSessionClient();
    const admin = await createAdminClient();
    const sessionDoc = await databases.getDocument(DATABASE_ID, TRAINING_SESSIONS_COLLECTION_ID, sessionId);

    await deleteFileIfExists(admin.storage, TRAINING_ARCHIVES_BUCKET_ID, sessionDoc.archivedPdfFileId);
    await deleteFileIfExists(admin.storage, TRAINING_SIGNATURES_BUCKET_ID, sessionDoc.instructorSignatureImageId);

    const updated = await databases.updateDocument(DATABASE_ID, TRAINING_SESSIONS_COLLECTION_ID, sessionId, {
      status: 'collecting',
      instructorSignatureImageId: null,
      archivedPdfFileId: null,
      archivedFileName: null,
      archivedAt: null,
      finalizedAt: null,
      finalizedByUserId: null,
    });

    revalidateTrainingPaths(sessionDoc.projectId, sessionDoc.projectSlugSnapshot);

    return {
      success: true,
      data: JSON.parse(JSON.stringify(updated)) as TrainingSession,
    };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err, 'Nu am putut redeschide sesiunea finalizată.') };
  }
}

export async function submitTrainingAttendanceAction(data: {
  projectSlug: string;
  sessionId: string;
  volunteerName: string;
  cnp?: string;
  identitySeries?: string;
  identityNumber?: string;
  accessToken?: string;
  confirmedParticipation: boolean;
  signatureDataUrl: string;
  allowDuplicateOverride?: boolean;
  }): Promise<{ success: boolean; duplicate?: boolean; error?: string }> {
  try {
    const { databases, storage } = await createAdminClient();
    await ensureTrainingSchema(databases);
    await ensureTrainingBuckets(storage);
    const { project, session } = await readTrainingSessionByPublicContext(
      databases,
      data.projectSlug,
      data.sessionId,
    );

    if (session.status !== 'collecting') {
      throw new Error('Sesiunea nu este deschisă pentru colectarea semnăturilor.');
    }

    if (session.accessToken && session.accessToken !== (data.accessToken || '').trim()) {
      throw new Error('Token-ul sesiunii este invalid.');
    }

    if (!data.confirmedParticipation) {
      throw new Error('Confirmarea participării este obligatorie.');
    }

    const volunteerName = data.volunteerName.trim();
    const volunteerNameNormalized = normalizeName(volunteerName);
    if (!volunteerNameNormalized) {
      throw new Error('Numele participantului este obligatoriu.');
    }

    const existing = await databases.listDocuments(DATABASE_ID, TRAINING_ATTENDANCE_COLLECTION_ID, [
      Query.equal('sessionId', data.sessionId),
      Query.equal('volunteerNameNormalized', volunteerNameNormalized),
      Query.limit(1),
    ]);

    if (existing.total > 0 && !data.allowDuplicateOverride) {
      return {
        success: false,
        duplicate: true,
        error: 'Există deja o semnătură pentru acest nume în sesiunea curentă.',
      };
    }

    const volunteerId = await resolveVolunteerIdByName(databases, project.$id, volunteerName);
    const signature = await saveTrainingSignature(
      storage,
      data.signatureDataUrl,
      `training-attendance-${data.sessionId}-${Date.now()}`,
    );

    await databases.createDocument(DATABASE_ID, TRAINING_ATTENDANCE_COLLECTION_ID, ID.unique(), {
      sessionId: data.sessionId,
      projectId: project.$id,
      volunteerId,
      volunteerName,
      volunteerNameNormalized,
      cnp: sanitizeTrainingCnp(data.cnp),
      identitySeries: sanitizeIdentitySeries(data.identitySeries),
      identityNumber: sanitizeIdentityNumber(data.identityNumber),
      signatureImageId: signature.fileId,
      signedAt: new Date().toISOString(),
      confirmedParticipation: true,
      source: 'public',
    });

    revalidateTrainingPaths(project.$id, project.projectSlug);

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err, 'Nu am putut salva semnătura.') };
  }
}

export async function updateTrainingAttendanceEntry(
  entryId: string,
  data: Partial<TrainingAttendanceEntry> & { allowOverride?: boolean },
): Promise<ActionResult<TrainingAttendanceEntry>> {
  try {
    const { databases } = await createSessionClient();
    const existing = await databases.getDocument(DATABASE_ID, TRAINING_ATTENDANCE_COLLECTION_ID, entryId);
    const sessionDoc = await databases.getDocument(DATABASE_ID, TRAINING_SESSIONS_COLLECTION_ID, existing.sessionId);

    if (sessionDoc.status === 'finalized' && !data.allowOverride) {
      return { success: false, error: 'Sesiunea este finalizată. Activează override pentru a edita participanții.' };
    }

    const updatePayload = stripTrainingAttendanceSystemFields(data);
    if (updatePayload.volunteerName !== undefined) {
      const volunteerName = String(updatePayload.volunteerName).trim();
      updatePayload.volunteerName = volunteerName;
      updatePayload.volunteerNameNormalized = normalizeName(volunteerName);
    }
    if (updatePayload.cnp !== undefined) {
      updatePayload.cnp = sanitizeTrainingCnp(String(updatePayload.cnp || ''));
    }
    if (updatePayload.identitySeries !== undefined) {
      updatePayload.identitySeries = sanitizeIdentitySeries(String(updatePayload.identitySeries || ''));
    }
    if (updatePayload.identityNumber !== undefined) {
      updatePayload.identityNumber = sanitizeIdentityNumber(String(updatePayload.identityNumber || ''));
    }

    const updated = await databases.updateDocument(
      DATABASE_ID,
      TRAINING_ATTENDANCE_COLLECTION_ID,
      entryId,
      updatePayload,
    );

    revalidateTrainingPaths(existing.projectId, sessionDoc.projectSlugSnapshot);

    return {
      success: true,
      data: JSON.parse(JSON.stringify(updated)) as TrainingAttendanceEntry,
    };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err, 'Nu am putut actualiza participantul.') };
  }
}

export async function deleteTrainingAttendanceEntry(
  entryId: string,
  options?: { allowOverride?: boolean },
): Promise<{ success: boolean; deletedId?: string; error?: string }> {
  try {
    const { databases, storage } = await createSessionClient();
    const entryDoc = await databases.getDocument(DATABASE_ID, TRAINING_ATTENDANCE_COLLECTION_ID, entryId);
    const sessionDoc = await databases.getDocument(DATABASE_ID, TRAINING_SESSIONS_COLLECTION_ID, entryDoc.sessionId);

    if (sessionDoc.status === 'finalized' && !options?.allowOverride) {
      return { success: false, error: 'Sesiunea este finalizată. Activează override pentru a șterge participanți.' };
    }

    await databases.deleteDocument(DATABASE_ID, TRAINING_ATTENDANCE_COLLECTION_ID, entryId);
    await deleteFileIfExists(storage, TRAINING_SIGNATURES_BUCKET_ID, entryDoc.signatureImageId);

    revalidateTrainingPaths(entryDoc.projectId, sessionDoc.projectSlugSnapshot);

    return { success: true, deletedId: entryId };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err, 'Nu am putut șterge participantul.') };
  }
}

export async function linkTrainingAttendanceEntry(
  entryId: string,
  volunteerId?: string,
): Promise<ActionResult<TrainingAttendanceEntry>> {
  try {
    const { databases } = await createSessionClient();
    const entryDoc = await databases.getDocument(DATABASE_ID, TRAINING_ATTENDANCE_COLLECTION_ID, entryId);

    const updated = await databases.updateDocument(DATABASE_ID, TRAINING_ATTENDANCE_COLLECTION_ID, entryId, {
      volunteerId: volunteerId || null,
    });

    const sessionDoc = await databases.getDocument(DATABASE_ID, TRAINING_SESSIONS_COLLECTION_ID, entryDoc.sessionId);
    revalidateTrainingPaths(entryDoc.projectId, sessionDoc.projectSlugSnapshot);

    return {
      success: true,
      data: JSON.parse(JSON.stringify(updated)) as TrainingAttendanceEntry,
    };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err, 'Nu am putut lega participantul de registrul de voluntari.') };
  }
}

export async function finalizeTrainingSession(
  sessionId: string,
  instructorSignatureDataUrl: string,
): Promise<ActionResult<TrainingSession>> {
  try {
    const { databases, account } = await createSessionClient();
    const admin = await createAdminClient();
    await ensureTrainingBuckets(admin.storage);

    const [sessionDoc, actor] = await Promise.all([
      databases.getDocument(DATABASE_ID, TRAINING_SESSIONS_COLLECTION_ID, sessionId),
      account.get(),
    ]);

    const entries = await listTrainingEntries(databases, sessionId);

    if (!sessionDoc.instructorName?.trim() || !sessionDoc.instructorUserId?.trim()) {
      return { success: false, error: 'Sesiunea nu poate fi finalizată fără instructor asignat.' };
    }

    if (entries.length === 0) {
      return { success: false, error: 'Sesiunea nu poate fi finalizată fără participanți.' };
    }

    const finalizedAt = new Date().toISOString();
    const signatureUpload = await saveTrainingSignature(
      admin.storage,
      instructorSignatureDataUrl,
      `training-instructor-${sessionId}-${Date.now()}`,
    );

    const reportContext = await loadTrainingReportContext(sessionId);
    const pdfBuffer = generateTrainingReportPdf({
      ...reportContext,
      session: {
        ...reportContext.session,
        finalizedAt,
      },
      instructorSignatureDataUrl,
    });

    const archiveFileName = buildTrainingArchiveFileName(
      sessionDoc.location || reportContext.session.location,
      sessionDoc.trainingDate || reportContext.session.trainingDate,
    );
    const archiveFileId = await saveTrainingArchivePdf(admin.storage, pdfBuffer, archiveFileName);

    await deleteFileIfExists(admin.storage, TRAINING_SIGNATURES_BUCKET_ID, sessionDoc.instructorSignatureImageId);
    await deleteFileIfExists(admin.storage, TRAINING_ARCHIVES_BUCKET_ID, sessionDoc.archivedPdfFileId);

    const updated = await databases.updateDocument(DATABASE_ID, TRAINING_SESSIONS_COLLECTION_ID, sessionId, {
      status: 'finalized',
      instructorSignatureImageId: signatureUpload.fileId,
      archivedPdfFileId: archiveFileId,
      archivedFileName: archiveFileName,
      archivedAt: finalizedAt,
      finalizedAt,
      finalizedByUserId: actor.$id,
    });

    revalidateTrainingPaths(sessionDoc.projectId, sessionDoc.projectSlugSnapshot);

    return {
      success: true,
      data: JSON.parse(JSON.stringify(updated)) as TrainingSession,
    };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err, 'Nu am putut finaliza sesiunea și genera documentul PDF.') };
  }
}

export async function deleteTrainingSession(
  sessionId: string,
): Promise<{ success: boolean; deletedId?: string; error?: string }> {
  try {
    const { databases } = await createSessionClient();
    const admin = await createAdminClient();
    const sessionDoc = await databases.getDocument(DATABASE_ID, TRAINING_SESSIONS_COLLECTION_ID, sessionId);
    const entries = await listTrainingEntries(admin.databases, sessionId);

    for (const entry of entries) {
      await admin.databases.deleteDocument(DATABASE_ID, TRAINING_ATTENDANCE_COLLECTION_ID, entry.$id!);
      await deleteFileIfExists(admin.storage, TRAINING_SIGNATURES_BUCKET_ID, entry.signatureImageId);
    }

    await deleteFileIfExists(admin.storage, TRAINING_SIGNATURES_BUCKET_ID, sessionDoc.instructorSignatureImageId);
    await deleteFileIfExists(admin.storage, TRAINING_ARCHIVES_BUCKET_ID, sessionDoc.archivedPdfFileId);
    await databases.deleteDocument(DATABASE_ID, TRAINING_SESSIONS_COLLECTION_ID, sessionId);

    revalidateTrainingPaths(sessionDoc.projectId, sessionDoc.projectSlugSnapshot);

    return { success: true, deletedId: sessionId };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err, 'Nu am putut șterge sesiunea de instructaj.') };
  }
}

export async function createTrainingAccessToken(): Promise<ActionResult<{ token: string }>> {
  return { success: true, data: { token: generateAccessToken() } };
}

export async function getTrainingSessionPreviewReportInfo(
  sessionId: string,
): Promise<ActionResult<{ session: TrainingSession; fileName: string }>> {
  try {
    const { databases } = await createSessionClient();
    const sessionDoc = await databases.getDocument(DATABASE_ID, TRAINING_SESSIONS_COLLECTION_ID, sessionId);
    const session = JSON.parse(JSON.stringify(sessionDoc)) as TrainingSession;
    return {
      success: true,
      data: {
        session,
        fileName: buildTrainingArchiveFileName(session.location, session.trainingDate),
      },
    };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err, 'Nu am putut pregăti previzualizarea raportului.') };
  }
}

function stripTrainingSessionSystemFields(data: Partial<TrainingSession> & { allowOverride?: boolean }) {
  const { $id, $createdAt, $updatedAt, allowOverride, ...clean } = data as Record<string, unknown>;
  void $id;
  void $createdAt;
  void $updatedAt;
  void allowOverride;
  return clean;
}

function stripTrainingAttendanceSystemFields(
  data: Partial<TrainingAttendanceEntry> & { allowOverride?: boolean },
) {
  const { $id, $createdAt, $updatedAt, allowOverride, ...clean } = data as Record<string, unknown>;
  void $id;
  void $createdAt;
  void $updatedAt;
  void allowOverride;
  return clean;
}

function revalidateTrainingPaths(projectId: string, projectSlug?: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/training`);
  if (projectSlug) {
    revalidatePath(`/t/${projectSlug}`);
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: string }).message;
    if (message) {
      return message;
    }
  }

  return fallback;
}
