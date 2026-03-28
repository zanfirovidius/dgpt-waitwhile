'use server';
// Trigger HMR update

import { ID, Query } from 'node-appwrite';
import { createAdminClient } from '../../lib/appwrite-server';
import { normalizeProjectDates } from '@/lib/project-dates';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const PROJECTS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID!;

export interface Project {
  $id: string;
  $createdAt: string;
  name: string;
  locationId: string;
  locationName: string;
  date: string;
  startDate: string;
  endDate: string;
  [key: string]: unknown; // allows future fields
}

export async function createProject(data: {
  name: string;
  locationId: string;
  locationName: string;
  startDate: string;
  endDate: string;
}): Promise<{ success: boolean; projectId?: string; error?: string }> {
  if (data.endDate < data.startDate) {
    return { success: false, error: 'End date must be on or after the start date' };
  }

  try {
    const { databases } = await createAdminClient();
    await ensureProjectDateRangeAttributes(databases);

    const doc = await databases.createDocument(DATABASE_ID, PROJECTS_COLLECTION_ID, ID.unique(), {
      ...data,
      date: data.startDate,
    });

    return { success: true, projectId: doc.$id };
  } catch (err) {
    console.error('[Projects] createProject error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create project' };
  }
}

export async function getProjects(): Promise<{ success: boolean; data?: Project[]; error?: string }> {
  try {
    const { databases } = await createAdminClient();
    const res = await databases.listDocuments(DATABASE_ID, PROJECTS_COLLECTION_ID, [
      Query.orderDesc('$createdAt'),
    ]);
    return {
      success: true,
      data: res.documents.map((doc) => normalizeProjectDates(doc as unknown as Project)),
    };
  } catch (err) {
    console.error('[Projects] getProjects error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch projects' };
  }
}

export async function getProject(projectId: string): Promise<{ success: boolean; data?: Project; error?: string }> {
  try {
    const { databases } = await createAdminClient();
    const doc = await databases.getDocument(DATABASE_ID, PROJECTS_COLLECTION_ID, projectId);
    return { success: true, data: normalizeProjectDates(doc as unknown as Project) };
  } catch (err) {
    console.error('[Projects] getProject error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Project not found' };
  }
}

async function ensureProjectDateRangeAttributes(
  databases: Awaited<ReturnType<typeof createAdminClient>>['databases'],
) {
  const res = await databases.listAttributes(DATABASE_ID, PROJECTS_COLLECTION_ID);
  const existing = new Map(res.attributes.map((attribute) => [attribute.key, attribute]));
  const requiredKeys = ['startDate', 'endDate'];

  for (const key of requiredKeys) {
    if (existing.has(key)) {
      continue;
    }

    await databases.createStringAttribute(DATABASE_ID, PROJECTS_COLLECTION_ID, key, 10, false);
  }

  await Promise.all(
    requiredKeys.map(async (key) => {
      if (existing.get(key)?.status === 'available') {
        return;
      }

      await waitForAttributeAvailability(databases, key);
    }),
  );
}

async function waitForAttributeAvailability(
  databases: Awaited<ReturnType<typeof createAdminClient>>['databases'],
  key: string,
) {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const attribute = await databases.getAttribute(DATABASE_ID, PROJECTS_COLLECTION_ID, key);

    if (attribute.status === 'available') {
      return;
    }

    if (attribute.status === 'failed' || attribute.status === 'stuck') {
      throw new Error(`Project attribute "${key}" is ${attribute.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Project attribute "${key}" is still processing`);
}
