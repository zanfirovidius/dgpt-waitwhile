'use server';

import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import { ID, Query } from 'node-appwrite';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const PROJECTS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID!;
const ATTENDANCE_CONFIG_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ATTENDANCE_CONFIG_COLLECTION_ID || 'project_attendance_config';
const SESSIONS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_VOLUNTEER_ATTENDANCE_SESSIONS_COLLECTION_ID || 'volunteer_attendance_sessions';
const ENTRIES_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_VOLUNTEER_ATTENDANCE_ENTRIES_COLLECTION_ID || 'volunteer_attendance_entries';

export interface AttendanceEntry {
  $id?: string;
  projectId: string;
  sessionId?: string;
  attendanceDate: string;
  volunteerFullName: string;
  volunteerEmail?: string;
  volunteerPhone?: string;
  departmentRole: string;
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
    departmentRole: string;
    attendanceDate: string;
    token?: string;
    pin?: string;
    breakMinutes?: number;
    signatureImageId?: string;
    notes?: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        const { databases } = await createAdminClient();

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

        // 3. Process Action
        if (data.action === 'check-in') {
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
                departmentRole: data.departmentRole,
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

            await databases.updateDocument(DATABASE_ID, ENTRIES_COLLECTION_ID, entryDoc.$id, {
                checkOutAt,
                breakMinutes: data.breakMinutes || 0,
                totalMinutes,
                totalHoursDecimal,
                signatureImageId: data.signatureImageId,
                checkOutConfirmed: true,
                notes: data.notes
            });
        }

        return { success: true };
    } catch (err: any) {
        console.error('[Attendance] action error:', err);
        return { success: false, error: err.message || 'Eroare la procesarea prezenței' };
    }
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
    } catch (err) {
        return { success: false, error: 'Eroare la preluarea datelor de prezență' };
    }
}

export async function validateAttendanceEntry(entryId: string, validated: boolean): Promise<{ success: boolean; error?: string }> {
    try {
        const { databases, account } = await createSessionClient();
        const user = await account.get();
        
        await databases.updateDocument(DATABASE_ID, ENTRIES_COLLECTION_ID, entryId, {
            coordinatorValidated: validated,
            coordinatorValidatedAt: validated ? new Date().toISOString() : null,
            coordinatorValidatedByUserId: validated ? user.$id : null
        });
        return { success: true };
    } catch (err) {
        return { success: false, error: 'Eroare la validarea rândului' };
    }
}
