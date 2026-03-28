'use server';

import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import { ID, Query } from 'node-appwrite';
import { revalidatePath } from 'next/cache';
import { normalizeName } from '@/lib/name-utils';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const VOLUNTEERS_COLLECTION_ID = 'project_volunteers';

export interface ProjectVolunteer {
  $id?: string;
  projectId: string;
  firstName: string;
  lastName: string;
  fullNameNormalized: string;
  phone?: string;
  email?: string;
  activityCategory: string;
  status: 'active' | 'inactive' | 'archived';
  notes?: string;
  waitwhileAccountCreated: boolean;
  waitwhileCustomerId?: string;
  waitwhileEmailUsed?: string;
  waitwhileCreatedAt?: string;
  waitwhileDeletedAt?: string;
  $createdAt?: string;
  $updatedAt?: string;
}

export async function getProjectVolunteers(projectId: string, options: { 
    search?: string, 
    category?: string, 
    waitwhileStatus?: 'has_account' | 'no_account',
    limit?: number,
    offset?: number
} = {}): Promise<{ success: boolean; data?: ProjectVolunteer[]; total?: number; error?: string }> {
  try {
    const { databases } = await createSessionClient();
    const queries = [
        Query.equal('projectId', projectId),
        Query.orderAsc('fullNameNormalized'),
    ];

    if (options.search) {
        queries.push(Query.contains('fullNameNormalized', options.search.toLowerCase()));
    }
    if (options.category && options.category !== 'all') {
        queries.push(Query.equal('activityCategory', options.category));
    }
    if (options.waitwhileStatus === 'has_account') {
        queries.push(Query.equal('waitwhileAccountCreated', true));
    } else if (options.waitwhileStatus === 'no_account') {
        queries.push(Query.equal('waitwhileAccountCreated', false));
    }

    if (options.limit) queries.push(Query.limit(options.limit));
    if (options.offset) queries.push(Query.offset(options.offset));

    const res = await databases.listDocuments(DATABASE_ID, VOLUNTEERS_COLLECTION_ID, queries);
    return { 
        success: true, 
        data: JSON.parse(JSON.stringify(res.documents)) as ProjectVolunteer[],
        total: res.total 
    };
  } catch (err: any) {
    console.error('[Volunteers] getProjectVolunteers error:', err);
    return { success: false, error: err.message || 'Eroare la preluarea voluntarilor' };
  }
}

export async function getVolunteer(volunteerId: string): Promise<{ success: boolean; data?: ProjectVolunteer; error?: string }> {
  try {
    const { databases } = await createSessionClient();
    const doc = await databases.getDocument(DATABASE_ID, VOLUNTEERS_COLLECTION_ID, volunteerId);
    return { success: true, data: JSON.parse(JSON.stringify(doc)) as ProjectVolunteer };
  } catch (err: any) {
    console.error('[Volunteers] getVolunteer error:', err);
    return { success: false, error: err.message || 'Voluntarul nu a fost găsit' };
  }
}

export async function createVolunteer(data: Partial<ProjectVolunteer>): Promise<{ success: boolean; data?: ProjectVolunteer; error?: string }> {
  try {
    const { databases } = await createSessionClient();
    
    if (!data.projectId || !data.firstName || !data.lastName || !data.activityCategory) {
        throw new Error('Câmpurile obligatorii lipsesc');
    }

    const fullNameNormalized = normalizeName(`${data.firstName} ${data.lastName}`);
    
    const volunteer: Partial<ProjectVolunteer> = {
      ...data,
      fullNameNormalized,
      status: data.status || 'active',
      waitwhileAccountCreated: false,
    };

    const doc = await databases.createDocument(DATABASE_ID, VOLUNTEERS_COLLECTION_ID, ID.unique(), volunteer);
    
    revalidatePath(`/projects/${data.projectId}/volunteers`);
    return { success: true, data: JSON.parse(JSON.stringify(doc)) as ProjectVolunteer };
  } catch (err: any) {
    console.error('[Volunteers] create error:', err);
    return { success: false, error: err.message || 'Eroare la crearea voluntarului' };
  }
}

export async function updateVolunteer(volunteerId: string, data: Partial<ProjectVolunteer>): Promise<{ success: boolean; error?: string }> {
    try {
        const { databases } = await createSessionClient();
        
        let updatePayload = { ...data };
        if (data.firstName || data.lastName) {
            // Need to re-normalize name if changed
            const current = await databases.getDocument(DATABASE_ID, VOLUNTEERS_COLLECTION_ID, volunteerId);
            const firstName = data.firstName || current.firstName;
            const lastName = data.lastName || current.lastName;
            updatePayload.fullNameNormalized = normalizeName(`${firstName} ${lastName}`);
        }

        // Clean up internal fields
        const { $id, $createdAt, $updatedAt, $permissions, $databaseId, $collectionId, ...cleanData } = updatePayload as any;

        await databases.updateDocument(DATABASE_ID, VOLUNTEERS_COLLECTION_ID, volunteerId, cleanData);
        
        revalidatePath(`/projects/${cleanData.projectId}/volunteers`);
        return { success: true };
    } catch (err: any) {
        console.error('[Volunteers] update error:', err);
        return { success: false, error: err.message || 'Eroare la actualizarea voluntarului' };
    }
}

export async function deleteVolunteer(volunteerId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { databases } = await createSessionClient();
    const doc = await databases.getDocument(DATABASE_ID, VOLUNTEERS_COLLECTION_ID, volunteerId);
    await databases.deleteDocument(DATABASE_ID, VOLUNTEERS_COLLECTION_ID, volunteerId);
    
    revalidatePath(`/projects/${doc.projectId}/volunteers`);
    return { success: true };
  } catch (err: any) {
    console.error('[Volunteers] delete error:', err);
    return { success: false, error: err.message || 'Eroare la ștergerea voluntarului' };
  }
}

export async function bulkDeleteVolunteers(volunteerIds: string[]): Promise<{ success: boolean; results: { id: string, success: boolean, error?: string }[] }> {
    const { databases } = await createSessionClient();
    const results = [];
    
    let projectId: string | null = null;

    for (const id of volunteerIds) {
        try {
            if (!projectId) {
                const doc = await databases.getDocument(DATABASE_ID, VOLUNTEERS_COLLECTION_ID, id);
                projectId = doc.projectId;
            }
            await databases.deleteDocument(DATABASE_ID, VOLUNTEERS_COLLECTION_ID, id);
            results.push({ id, success: true });
        } catch (err: any) {
            results.push({ id, success: false, error: err.message });
        }
    }
    
    if (projectId) revalidatePath(`/projects/${projectId}/volunteers`);
    return { success: results.every(r => r.success), results };
}
