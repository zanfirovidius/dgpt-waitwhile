'use server';

import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import { ID, Query } from 'node-appwrite';
import { revalidatePath } from 'next/cache';
import { normalizeName } from '@/lib/name-utils';
import {
  sanitizeVolunteerEmail,
  sanitizeVolunteerPhone,
  sanitizeVolunteerValue,
} from '@/lib/volunteer-utils';

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
  address?: string;
  cnp?: string;
  identitySeries?: string;
  identityNumber?: string;
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
  } catch (err: unknown) {
    console.error('[Volunteers] getProjectVolunteers error:', err);
    return { success: false, error: getVolunteerErrorMessage(err, 'Eroare la preluarea voluntarilor') };
  }
}

export async function getVolunteer(volunteerId: string): Promise<{ success: boolean; data?: ProjectVolunteer; error?: string }> {
  try {
    const { databases } = await createSessionClient();
    const doc = await databases.getDocument(DATABASE_ID, VOLUNTEERS_COLLECTION_ID, volunteerId);
    return { success: true, data: JSON.parse(JSON.stringify(doc)) as ProjectVolunteer };
  } catch (err: unknown) {
    console.error('[Volunteers] getVolunteer error:', err);
    return { success: false, error: getVolunteerErrorMessage(err, 'Voluntarul nu a fost găsit') };
  }
}

export async function createVolunteer(data: Partial<ProjectVolunteer>): Promise<{ success: boolean; data?: ProjectVolunteer; error?: string }> {
  try {
    const admin = await createAdminClient();
    await ensureVolunteerProfileAttributes(admin.databases);
    const { databases } = await createSessionClient();
    
    if (!data.projectId || !data.firstName || !data.lastName || !data.activityCategory) {
        throw new Error('Câmpurile obligatorii lipsesc');
    }

    const firstName = sanitizeVolunteerValue(data.firstName);
    const lastName = sanitizeVolunteerValue(data.lastName);
    const fullNameNormalized = normalizeName(`${firstName} ${lastName}`);
    
    const volunteer: Partial<ProjectVolunteer> = {
      ...data,
      firstName,
      lastName,
      fullNameNormalized,
      phone: sanitizeVolunteerPhone(data.phone),
      email: sanitizeVolunteerEmail(data.email),
      address: sanitizeVolunteerValue(data.address, 255),
      cnp: sanitizeVolunteerValue(data.cnp, 32),
      identitySeries: sanitizeVolunteerValue(data.identitySeries, 16)?.toUpperCase(),
      identityNumber: sanitizeVolunteerValue(data.identityNumber, 32)?.toUpperCase(),
      status: data.status || 'active',
      waitwhileAccountCreated: false,
    };

    const doc = await databases.createDocument(DATABASE_ID, VOLUNTEERS_COLLECTION_ID, ID.unique(), volunteer);
    
    revalidatePath(`/projects/${data.projectId}/volunteers`);
    return { success: true, data: JSON.parse(JSON.stringify(doc)) as ProjectVolunteer };
  } catch (err: unknown) {
    console.error('[Volunteers] create error:', err);
    return { success: false, error: getVolunteerErrorMessage(err, 'Eroare la crearea voluntarului') };
  }
}

export async function updateVolunteer(volunteerId: string, data: Partial<ProjectVolunteer>): Promise<{ success: boolean; error?: string }> {
    try {
        const admin = await createAdminClient();
        await ensureVolunteerProfileAttributes(admin.databases);
        const { databases } = await createSessionClient();
        
        const updatePayload = { ...data };
        if (data.firstName || data.lastName) {
            // Need to re-normalize name if changed
            const current = await databases.getDocument(DATABASE_ID, VOLUNTEERS_COLLECTION_ID, volunteerId);
            const firstName = sanitizeVolunteerValue(data.firstName || current.firstName);
            const lastName = sanitizeVolunteerValue(data.lastName || current.lastName);
            updatePayload.firstName = firstName;
            updatePayload.lastName = lastName;
            updatePayload.fullNameNormalized = normalizeName(`${firstName} ${lastName}`);
        }

        if ('email' in updatePayload) {
            updatePayload.email = sanitizeVolunteerEmail(updatePayload.email);
        }
        if ('phone' in updatePayload) {
            updatePayload.phone = sanitizeVolunteerPhone(updatePayload.phone);
        }
        if ('address' in updatePayload) {
            updatePayload.address = sanitizeVolunteerValue(updatePayload.address, 255);
        }
        if ('cnp' in updatePayload) {
            updatePayload.cnp = sanitizeVolunteerValue(updatePayload.cnp, 32);
        }
        if ('identitySeries' in updatePayload) {
            updatePayload.identitySeries = sanitizeVolunteerValue(updatePayload.identitySeries, 16)?.toUpperCase();
        }
        if ('identityNumber' in updatePayload) {
            updatePayload.identityNumber = sanitizeVolunteerValue(updatePayload.identityNumber, 32)?.toUpperCase();
        }

        const cleanData = { ...updatePayload } as Record<string, unknown>;
        delete cleanData.$id;
        delete cleanData.$createdAt;
        delete cleanData.$updatedAt;
        delete cleanData.$permissions;
        delete cleanData.$databaseId;
        delete cleanData.$collectionId;
        const currentDoc = await databases.getDocument(DATABASE_ID, VOLUNTEERS_COLLECTION_ID, volunteerId);
        await databases.updateDocument(DATABASE_ID, VOLUNTEERS_COLLECTION_ID, volunteerId, cleanData);
        
        revalidatePath(`/projects/${currentDoc.projectId}/volunteers`);
        revalidatePath(`/projects/${currentDoc.projectId}/volunteers/${volunteerId}`);
        return { success: true };
    } catch (err: unknown) {
        console.error('[Volunteers] update error:', err);
        return { success: false, error: getVolunteerErrorMessage(err, 'Eroare la actualizarea voluntarului') };
    }
}

export async function deleteVolunteer(volunteerId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { databases } = await createSessionClient();
    const doc = await databases.getDocument(DATABASE_ID, VOLUNTEERS_COLLECTION_ID, volunteerId);
    await databases.deleteDocument(DATABASE_ID, VOLUNTEERS_COLLECTION_ID, volunteerId);
    
    revalidatePath(`/projects/${doc.projectId}/volunteers`);
    return { success: true };
  } catch (err: unknown) {
    console.error('[Volunteers] delete error:', err);
    return { success: false, error: getVolunteerErrorMessage(err, 'Eroare la ștergerea voluntarului') };
  }
}

export async function bulkDeleteVolunteers(volunteerIds: string[]): Promise<{ success: boolean; results: { id: string, success: boolean, error?: string }[] }> {
    const { databases } = await createSessionClient();
    const results: { id: string; success: boolean; error?: string }[] = [];
    
    let projectId: string | null = null;

    for (const id of volunteerIds) {
        try {
            if (!projectId) {
                const doc = await databases.getDocument(DATABASE_ID, VOLUNTEERS_COLLECTION_ID, id);
                projectId = doc.projectId;
            }
            await databases.deleteDocument(DATABASE_ID, VOLUNTEERS_COLLECTION_ID, id);
            results.push({ id, success: true });
        } catch (err: unknown) {
            results.push({ id, success: false, error: getVolunteerErrorMessage(err, 'Eroare la ștergere') });
        }
    }
    
    if (projectId) revalidatePath(`/projects/${projectId}/volunteers`);
    return { success: results.every(r => r.success), results };
}

export async function ensureVolunteerProfileAttributes(
  databases: Awaited<ReturnType<typeof createAdminClient>>['databases'],
) {
  const requiredAttributes = [
    { key: 'address', size: 255 },
    { key: 'cnp', size: 32 },
    { key: 'identitySeries', size: 16 },
    { key: 'identityNumber', size: 32 },
  ] as const;

  const list = await databases.listAttributes(DATABASE_ID, VOLUNTEERS_COLLECTION_ID);
  const existing = new Map(list.attributes.map((attribute) => [attribute.key, attribute]));
  const createdKeys: string[] = [];

  for (const attribute of requiredAttributes) {
    if (existing.has(attribute.key)) {
      continue;
    }

    try {
      await databases.createStringAttribute(
        DATABASE_ID,
        VOLUNTEERS_COLLECTION_ID,
        attribute.key,
        attribute.size,
        false,
      );
    } catch (err: unknown) {
      const errorCode =
        typeof err === 'object' && err !== null && 'code' in err
          ? Number((err as { code?: number }).code)
          : 0;

      if (errorCode !== 409) {
        throw err;
      }
    }

    createdKeys.push(attribute.key);
  }

  for (const key of createdKeys) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const attribute = await databases.getAttribute(DATABASE_ID, VOLUNTEERS_COLLECTION_ID, key);

      if (attribute.status === 'available') {
        break;
      }

      if (attribute.status === 'failed' || attribute.status === 'stuck') {
        throw new Error(`Volunteer attribute "${key}" is ${attribute.status}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

function getVolunteerErrorMessage(error: unknown, fallback: string) {
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
