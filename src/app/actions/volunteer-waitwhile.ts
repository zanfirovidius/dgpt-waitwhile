'use server';

import { createAdminClient } from '@/lib/appwrite-server';
import { Query } from 'node-appwrite';
import { getVolunteer, updateVolunteer } from './volunteers';
import { getProject } from './projects';
import { createUser, deleteUser, UserPayload } from './waitwhile';
import { normalizeToSlug } from '@/lib/slug';
import { revalidatePath } from 'next/cache';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const VOLUNTEERS_COLLECTION_ID = 'project_volunteers';

/**
 * Generates a unique Waitwhile email for a volunteer within a project.
 */
async function generateWaitwhileEmail(
    firstName: string, 
    lastName: string, 
    domainSuffix: string, 
    projectId: string
): Promise<string> {
    const baseLocalPart = `${normalizeToSlug(firstName)}.${normalizeToSlug(lastName)}`.replace(/-+/g, '.');
    const suffix = domainSuffix.startsWith('@') ? domainSuffix : `@${domainSuffix}`;
    
    const { databases } = await createAdminClient();
    
    let currentLocalPart = baseLocalPart;
    let counter = 1;
    let isUnique = false;

    while (!isUnique) {
        const email = `${currentLocalPart}${suffix}`;
        const existing = await databases.listDocuments(DATABASE_ID, VOLUNTEERS_COLLECTION_ID, [
            Query.equal('projectId', projectId),
            Query.equal('waitwhileEmailUsed', email),
            Query.limit(1)
        ]);

        if (existing.total === 0) {
            isUnique = true;
            return email;
        } else {
            counter++;
            currentLocalPart = `${baseLocalPart}.${counter}`;
        }
    }
    
    return `${baseLocalPart}${suffix}`;
}

/**
 * Creates a Waitwhile account for a volunteer.
 */
export async function createWaitwhileAccountAction(volunteerId: string): Promise<{ success: boolean; error?: string }> {
    try {
        // 1. Get Volunteer & Project
        const volRes = await getVolunteer(volunteerId);
        if (!volRes.success || !volRes.data) throw new Error('Voluntarul nu a fost găsit');
        const volunteer = volRes.data;

        if (volunteer.waitwhileAccountCreated) throw new Error('Voluntarul are deja un cont Waitwhile');

        const projRes = await getProject(volunteer.projectId);
        if (!projRes.success || !projRes.data) throw new Error('Proiectul nu a fost găsit');
        const project = projRes.data;

        if (!project.locationId) throw new Error('Proiectul nu este legat de o locație Waitwhile');

        // 2. Generate Email
        const emailSuffix = project.waitwhileEmailDomainSuffix || '@dgpt.ro';
        const generatedEmail = await generateWaitwhileEmail(volunteer.firstName, volunteer.lastName, emailSuffix, project.$id);

        // 3. Create Waitwhile User
        const payload: UserPayload = {
            name: `${volunteer.firstName} ${volunteer.lastName}`,
            email: generatedEmail,
            locationIds: [project.locationId],
            defaultLocationId: project.locationId,
            roles: ['Staff'], // Default role for volunteers
            password: Math.random().toString(36).slice(-12) + '!' // Random safe password
        };

        const wwRes = await createUser(payload);
        if (!wwRes.success) {
            if (wwRes.error === 'user_email_exists') {
                throw new Error(`Email-ul ${generatedEmail} este deja utilizat în Waitwhile.`);
            }
            throw new Error(wwRes.error || 'Eroare la crearea contului Waitwhile');
        }

        // 4. Update Database
        await updateVolunteer(volunteerId, {
            waitwhileAccountCreated: true,
            waitwhileCustomerId: wwRes.data.id,
            waitwhileEmailUsed: generatedEmail,
            waitwhileCreatedAt: new Date().toISOString()
        });

        revalidatePath(`/projects/${project.$id}/volunteers`);
        return { success: true };
    } catch (err: unknown) {
        console.error('[WaitwhileSync] create error:', err);
        return { success: false, error: getErrorMessage(err, 'Eroare la crearea contului Waitwhile') };
    }
}

/**
 * Deletes a Waitwhile account.
 */
export async function deleteWaitwhileAccountAction(volunteerId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const volRes = await getVolunteer(volunteerId);
        if (!volRes.success || !volRes.data) throw new Error('Voluntarul nu a fost găsit');
        const volunteer = volRes.data;

        if (!volunteer.waitwhileCustomerId) throw new Error('Voluntarul nu are un ID Waitwhile valid');

        // 2. Delete from Waitwhile
        const wwRes = await deleteUser(volunteer.waitwhileCustomerId);
        if (!wwRes.success) throw new Error(wwRes.error || 'Eroare la ștergerea din Waitwhile');

        // 3. Update Database
        await updateVolunteer(volunteerId, {
            waitwhileAccountCreated: false,
            // We keep the old email info if needed for audit, or clear it
            waitwhileDeletedAt: new Date().toISOString()
        });

        revalidatePath(`/projects/${volunteer.projectId}/volunteers`);
        return { success: true };
    } catch (err: unknown) {
        console.error('[WaitwhileSync] delete error:', err);
        return { success: false, error: getErrorMessage(err, 'Eroare la ștergerea contului Waitwhile') };
    }
}

/**
 * Bulk create Waitwhile accounts.
 */
export async function bulkCreateWaitwhileAccountsAction(volunteerIds: string[]): Promise<{ success: boolean; results: { id: string, success: boolean, error?: string }[] }> {
    const results = [];
    for (const id of volunteerIds) {
        const res = await createWaitwhileAccountAction(id);
        results.push({ id, success: res.success, error: res.error });
    }
    return { success: results.every(r => r.success), results };
}

/**
 * Bulk delete Waitwhile accounts.
 */
export async function bulkDeleteWaitwhileAccountsAction(volunteerIds: string[]): Promise<{ success: boolean; results: { id: string, success: boolean, error?: string }[] }> {
    const results = [];
    for (const id of volunteerIds) {
        const res = await deleteWaitwhileAccountAction(id);
        results.push({ id, success: res.success, error: res.error });
    }
    return { success: results.every(r => r.success), results };
}

function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    if (typeof error === 'object' && error !== null && 'message' in error) {
        const candidate = error as { message?: unknown };
        if (typeof candidate.message === 'string' && candidate.message.trim()) {
            return candidate.message;
        }
    }

    return fallback;
}
