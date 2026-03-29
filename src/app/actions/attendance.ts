'use server';

import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import { ID, Query } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { normalizeName } from '@/lib/name-utils';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const PROJECTS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID!;
const ATTENDANCE_CONFIG_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ATTENDANCE_CONFIG_COLLECTION_ID || 'project_attendance_config';
const ENTRIES_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_VOLUNTEER_ATTENDANCE_ENTRIES_COLLECTION_ID || 'volunteer_attendance_entries';
const ATTENDANCE_SIGNATURES_BUCKET_ID =
  process.env.NEXT_PUBLIC_APPWRITE_ATTENDANCE_SIGNATURES_BUCKET_ID || 'attendance_signatures';

export interface AttendanceEntry {
  $id?: string;
  projectId: string;
  sessionId?: string;
  attendanceDate: string;
  volunteerFullName: string;
  volunteerEmail?: string;
  volunteerPhone?: string;
  cnp?: string;
  identitySeries?: string;
  identityNumber?: string;
  departmentRole: string;
  projectVolunteerId?: string;
  checkInAt?: string;
  checkOutAt?: string;
  breakMinutes?: number;
  totalMinutes?: number;
  totalHoursDecimal?: number;
  signatureImageId?: string;
  checkOutConfirmed: boolean;
  coordinatorValidated: boolean;
  coordinatorValidatedAt?: string;
  coordinatorValidatedByUserId?: string;
  notes?: string;
  projectSlugSnapshot?: string;
  eventNameSnapshot?: string;
  citySnapshot?: string;
  venueSnapshot?: string;
  $createdAt?: string;
}

/**
 * Public/Staff action for check-in or check-out.
 */
export async function submitAttendanceAction(data: {
    projectSlug: string;
    action: 'check-in' | 'check-out';
    volunteerFullName: string;
    volunteerEmail?: string;
    volunteerPhone?: string;
    cnp?: string;
    identitySeries?: string;
    identityNumber?: string;
    departmentRole: string;
    attendanceDate: string;
    token?: string;
    pin?: string;
    breakMinutes?: number;
    signatureImageId?: string;
    notes?: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        const { databases, storage } = await createAdminClient();
        await ensureAttendanceIdentityAttributes(databases);

        // 1. Verify Project & Config
        const projRes = await databases.listDocuments(DATABASE_ID, PROJECTS_COLLECTION_ID, [
            Query.equal('projectSlug', data.projectSlug),
            Query.limit(1)
        ]);
        if (projRes.total === 0) throw new Error('Proiectul nu a fost găsit.');
        const project = projRes.documents[0];
        const projectId = project.$id;

        const configDoc = await databases.getDocument(DATABASE_ID, ATTENDANCE_CONFIG_COLLECTION_ID, projectId);
        if (!configDoc.attendanceEnabled) throw new Error('Modulul de prezență este dezactivat pentru acest proiect.');

        // 2. Verify Access
        if (configDoc.attendanceAccessMode === 'token' && configDoc.attendanceAccessToken !== data.token) {
            throw new Error('Token de acces invalid.');
        }
        // PIN validation would happen here (needs hashing/comparison)

        let projectVolunteerId: string | undefined = undefined;
        try {
            // Build a query that matches any of the identifiers
            const identifierQueries = [];
            if (data.volunteerPhone) {
                identifierQueries.push(Query.equal('phone', data.volunteerPhone));
            }
            if (data.volunteerEmail) {
                identifierQueries.push(Query.equal('email', data.volunteerEmail.toLowerCase()));
            }
            
            // 1. Try exact Phone/Email match first
            if (identifierQueries.length > 0) {
                const matchRes = await databases.listDocuments(DATABASE_ID, 'project_volunteers', [
                    Query.equal('projectId', projectId),
                    Query.or(identifierQueries),
                    Query.limit(1)
                ]);
                if (matchRes.total > 0) {
                    projectVolunteerId = matchRes.documents[0].$id;
                }
            }

            // 2. Fallback to Name matching if no match found yet
            if (!projectVolunteerId) {
                const normalizedSearchName = normalizeName(data.volunteerFullName);
                const volunteerMatch = await databases.listDocuments(DATABASE_ID, 'project_volunteers', [
                    Query.equal('projectId', projectId),
                    Query.equal('fullNameNormalized', normalizedSearchName),
                    Query.limit(1)
                ]);
                if (volunteerMatch.total > 0) {
                    projectVolunteerId = volunteerMatch.documents[0].$id;
                }
            }
        } catch (e) {
            console.error('[Attendance] Match volunteer failed:', e);
        }

        // 3. Process Action
        if (data.action === 'check-in') {
            const cnp = sanitizeAttendanceIdentityValue(data.cnp);
            const identitySeries = sanitizeAttendanceIdentityValue(data.identitySeries)?.toUpperCase();
            const identityNumber = sanitizeAttendanceIdentityValue(data.identityNumber)?.toUpperCase();

            if (!cnp || !identitySeries || !identityNumber) {
                throw new Error('CNP-ul, seria CI și numărul CI sunt obligatorii la check-in.');
            }

            // Check for existing open check-in
            const existing = await databases.listDocuments(DATABASE_ID, ENTRIES_COLLECTION_ID, [
                Query.equal('projectId', projectId),
                Query.equal('volunteerFullName', data.volunteerFullName),
                Query.equal('attendanceDate', data.attendanceDate),
                Query.equal('checkOutConfirmed', false),
                Query.limit(1)
            ]);
            if (existing.total > 0) throw new Error('Ai deja un check-in activ pentru această dată.');

            const entry: Partial<AttendanceEntry> = {
                projectId,
                projectSlugSnapshot: data.projectSlug,
                eventNameSnapshot: project.name,
                citySnapshot: project.city,
                venueSnapshot: project.venue,
                attendanceDate: data.attendanceDate,
                volunteerFullName: data.volunteerFullName,
                volunteerEmail: data.volunteerEmail,
                volunteerPhone: data.volunteerPhone,
                cnp,
                identitySeries,
                identityNumber,
                departmentRole: data.departmentRole,
                projectVolunteerId,
                checkInAt: new Date().toISOString(),
                checkOutConfirmed: false,
                coordinatorValidated: false,
            };

            await databases.createDocument(DATABASE_ID, ENTRIES_COLLECTION_ID, ID.unique(), entry);
        } else {
            // Check-out
            const existing = await databases.listDocuments(DATABASE_ID, ENTRIES_COLLECTION_ID, [
                Query.equal('projectId', projectId),
                Query.equal('volunteerFullName', data.volunteerFullName),
                Query.equal('attendanceDate', data.attendanceDate),
                Query.equal('checkOutConfirmed', false),
                Query.orderDesc('$createdAt'),
                Query.limit(1)
            ]);

            if (existing.total === 0) throw new Error('Nu am găsit un check-in activ pentru tine astăzi.');
            const entryDoc = existing.documents[0];
            const checkOutAt = new Date().toISOString();
            
            // Calculate totals
            const checkInAt = new Date(entryDoc.checkInAt);
            const checkOutDate = new Date(checkOutAt);
            const diffMs = checkOutDate.getTime() - checkInAt.getTime();
            const rawMinutes = Math.floor(diffMs / 60000);
            const totalMinutes = Math.max(0, rawMinutes - (data.breakMinutes || 0));
            const totalHoursDecimal = Number((totalMinutes / 60).toFixed(2));
            const signatureImageId = data.signatureImageId
              ? await saveAttendanceSignature(storage, data.signatureImageId, entryDoc.$id)
              : undefined;

            await databases.updateDocument(DATABASE_ID, ENTRIES_COLLECTION_ID, entryDoc.$id, {
                checkOutAt,
                breakMinutes: data.breakMinutes || 0,
                totalMinutes,
                totalHoursDecimal,
                signatureImageId,
                checkOutConfirmed: true,
                notes: data.notes
            });
        }

        return { success: true };
    } catch (err: unknown) {
        console.error('[Attendance] action error:', err);
        return { success: false, error: getErrorMessage(err, 'Eroare la procesarea prezenței') };
    }
}

async function saveAttendanceSignature(
    storage: Awaited<ReturnType<typeof createAdminClient>>['storage'],
    signatureDataUrl: string,
    entryId: string,
) {
    await ensureAttendanceSignaturesBucket(storage);

    const match = signatureDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
        throw new Error('Semnătura are un format invalid.');
    }

    const mimeType = match[1];
    const base64Payload = match[2];
    const extension = mimeType.split('/')[1] || 'png';
    const file = InputFile.fromBuffer(
        Buffer.from(base64Payload, 'base64'),
        `attendance-signature-${entryId}.${extension}`,
    );

    const uploaded = await storage.createFile(
        ATTENDANCE_SIGNATURES_BUCKET_ID,
        ID.unique(),
        file,
    );

    return uploaded.$id;
}

async function ensureAttendanceSignaturesBucket(
    storage: Awaited<ReturnType<typeof createAdminClient>>['storage'],
) {
    try {
        await storage.getBucket(ATTENDANCE_SIGNATURES_BUCKET_ID);
    } catch (err: unknown) {
        const code =
            typeof err === 'object' && err !== null && 'code' in err
                ? Number((err as { code?: number }).code)
                : undefined;

        if (code !== 404) {
            throw err;
        }

        await storage.createBucket(
            ATTENDANCE_SIGNATURES_BUCKET_ID,
            'Attendance Signatures',
            [],
            false,
            true,
            5 * 1024 * 1024,
            ['png', 'jpg', 'jpeg', 'webp'],
        );
    }
}

async function ensureAttendanceIdentityAttributes(
    databases: Awaited<ReturnType<typeof createAdminClient>>['databases'],
) {
    const list = await databases.listAttributes(DATABASE_ID, ENTRIES_COLLECTION_ID);
    const existing = new Map(list.attributes.map((attribute) => [attribute.key, attribute]));
    const requiredAttributes = [
        { key: 'cnp', size: 32 },
        { key: 'identitySeries', size: 32 },
        { key: 'identityNumber', size: 32 },
    ];
    const createdKeys: string[] = [];

    for (const attribute of requiredAttributes) {
        if (existing.has(attribute.key)) {
            continue;
        }

        try {
            await databases.createStringAttribute(
                DATABASE_ID,
                ENTRIES_COLLECTION_ID,
                attribute.key,
                attribute.size,
                false,
            );
        } catch (err: unknown) {
            const code =
                typeof err === 'object' && err !== null && 'code' in err
                    ? Number((err as { code?: number }).code)
                    : undefined;

            if (code !== 409) {
                throw err;
            }
        }
        createdKeys.push(attribute.key);
    }

    const keysToAwait = requiredAttributes
        .map((attribute) => attribute.key)
        .filter((key) => createdKeys.includes(key) || existing.get(key)?.status !== 'available');

    for (const key of keysToAwait) {
        for (let attempt = 0; attempt < 20; attempt += 1) {
            const attribute = await databases.getAttribute(DATABASE_ID, ENTRIES_COLLECTION_ID, key);

            if (attribute.status === 'available') {
                break;
            }

            if (attribute.status === 'failed' || attribute.status === 'stuck') {
                throw new Error(`Attendance attribute "${key}" is ${attribute.status}`);
            }

            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    }
}

function sanitizeAttendanceIdentityValue(value?: string | null) {
    return (value || '').replace(/\s+/g, ' ').trim();
}

export async function getProjectAttendanceEntries(projectId: string): Promise<{ success: boolean; data?: AttendanceEntry[]; error?: string }> {
    try {
        const { databases } = await createSessionClient();
        const res = await databases.listDocuments(DATABASE_ID, ENTRIES_COLLECTION_ID, [
            Query.equal('projectId', projectId),
            Query.orderDesc('attendanceDate'),
            Query.orderDesc('$createdAt')
        ]);
        return { success: true, data: JSON.parse(JSON.stringify(res.documents)) as AttendanceEntry[] };
    } catch (err: unknown) {
        console.error('[Attendance] getProjectAttendanceEntries error:', err);
        return { success: false, error: 'Eroare la preluarea datelor de prezență' };
    }
}

export async function validateAttendanceEntry(
    entryId: string,
    validated: boolean,
): Promise<{ success: boolean; data?: AttendanceEntry; error?: string }> {
    try {
        const { databases, account } = await createSessionClient();
        const entryDoc = await databases.getDocument(DATABASE_ID, ENTRIES_COLLECTION_ID, entryId);

        if (validated && !entryDoc.checkOutConfirmed) {
            return { success: false, error: 'Rândul poate fi validat doar după check-out.' };
        }

        let coordinatorValidatedByUserId: string | null = null;
        try {
            const user = await account.get();
            coordinatorValidatedByUserId = user.$id;
        } catch (err) {
            console.warn('[Attendance] validate user lookup warning:', err);
        }

        const updated = await databases.updateDocument(DATABASE_ID, ENTRIES_COLLECTION_ID, entryId, {
            coordinatorValidated: validated,
            coordinatorValidatedAt: validated ? new Date().toISOString() : null,
            coordinatorValidatedByUserId: validated ? coordinatorValidatedByUserId : null
        });
        return {
            success: true,
            data: JSON.parse(JSON.stringify(updated)) as AttendanceEntry,
        };
    } catch (err: unknown) {
        console.error('[Attendance] validateAttendanceEntry error:', err);
        return { success: false, error: getErrorMessage(err, 'Eroare la validarea rândului') };
    }
}

export async function deleteAttendanceEntry(
    entryId: string,
): Promise<{ success: boolean; deletedId?: string; error?: string }> {
    try {
        const { databases, storage } = await createSessionClient();
        const entryDoc = await databases.getDocument(DATABASE_ID, ENTRIES_COLLECTION_ID, entryId);

        await databases.deleteDocument(DATABASE_ID, ENTRIES_COLLECTION_ID, entryId);

        if (entryDoc.signatureImageId && !String(entryDoc.signatureImageId).startsWith('data:')) {
            try {
                await storage.deleteFile(
                    ATTENDANCE_SIGNATURES_BUCKET_ID,
                    String(entryDoc.signatureImageId),
                );
            } catch (err) {
                console.warn('[Attendance] delete signature warning:', err);
            }
        }

        return { success: true, deletedId: entryId };
    } catch (err: unknown) {
        console.error('[Attendance] deleteAttendanceEntry error:', err);
        return { success: false, error: getErrorMessage(err, 'Eroare la ștergerea înregistrării') };
    }
}

export async function getVolunteerAttendanceEntries(volunteerId: string): Promise<{ success: boolean; data?: AttendanceEntry[]; error?: string }> {
    try {
        const { databases } = await createAdminClient();
        const res = await databases.listDocuments(DATABASE_ID, ENTRIES_COLLECTION_ID, [
            Query.equal('projectVolunteerId', volunteerId),
            Query.orderDesc('attendanceDate'),
            Query.orderDesc('$createdAt'),
            Query.limit(100)
        ]);
        return { success: true, data: JSON.parse(JSON.stringify(res.documents)) as AttendanceEntry[] };
    } catch (err: unknown) {
        console.error('[Attendance] getVolunteerAttendanceEntries error:', err);
        return { success: false, error: 'Eroare la preluarea prezențelor voluntarului' };
    }
}

function getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}
