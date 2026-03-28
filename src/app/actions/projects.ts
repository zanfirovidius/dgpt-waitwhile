'use server';
// Trigger HMR update

import { ID, Query } from 'node-appwrite';
import { createAdminClient, createSessionClient } from '../../lib/appwrite-server';
import { normalizeProjectDates } from '@/lib/project-dates';
import { normalizeToSlug, ensureUniqueProjectSlug } from '@/lib/slug';
import { getPlatformSettings } from './platform';
import { validateProjectFeedbackSetup } from '@/lib/setup-validation';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const PROJECTS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID!;
const FEEDBACK_CONFIG_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_FEEDBACK_CONFIG_COLLECTION_ID!;

export interface Project {
  $id: string;
  $createdAt: string;
  name: string;
  locationId: string;
  locationName: string;
  date: string;
  startDate: string;
  endDate: string;
  projectSlug?: string;
  publicFeedbackFormStatus?: string;
  eventName?: string;
  city?: string;
  venue?: string;
  [key: string]: unknown;
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
    // 1. System-level setup (requires Admin Key)
    const admin = await createAdminClient();
    await ensureProjectMetadataAttributes(admin.databases);

    // 2. Slug Generation
    const baseSlug = normalizeToSlug(data.name);
    const uniqueSlug = await ensureUniqueProjectSlug(admin.databases, DATABASE_ID, PROJECTS_COLLECTION_ID, baseSlug);

    // 3. Fetch Platform Defaults for Inheritance
    const settingsRes = await getPlatformSettings();
    const defaults = settingsRes.data;

    // 4. User-level operation (requires Session)
    const { databases } = await createSessionClient();
    
    // Create the project document
    const projectDoc = await databases.createDocument(DATABASE_ID, PROJECTS_COLLECTION_ID, ID.unique(), {
      ...data,
      date: data.startDate,
      projectSlug: uniqueSlug,
      // Metadata for setup
      eventName: data.name,
      city: '', // to be filled by user
      venue: data.locationName,
    });

    const projectId = projectDoc.$id;

    // 5. Create the linked Feedback Config with inherited defaults
    const feedbackConfig = {
      projectId: projectId,
      projectSlug: uniqueSlug,
      operatorName: defaults?.operatorName || '',
      operatorLegalName: defaults?.operatorLegalName || '',
      operatorTaxId: defaults?.operatorTaxId || '',
      operatorAddress: defaults?.operatorAddress || '',
      operatorPhone: defaults?.operatorPhone || '',
      dpoName: defaults?.dpoName || '',
      dpoEmail: defaults?.dpoEmail || '',
      privacyNoticeText: defaults?.defaultPrivacyNoticeTemplate || '',
      feedbackFormTitle: defaults?.defaultFeedbackFormTitle || 'Event Feedback',
      feedbackFormIntroText: defaults?.defaultFeedbackIntroText || '',
      feedbackFormConsentText: defaults?.defaultFeedbackConsentText || '',
      feedbackSuccessMessage: defaults?.defaultFeedbackSuccessMessage || '',
      feedbackRetentionDays: defaults?.defaultFeedbackRetentionDays || 365,
      publicFeedbackFormStatus: defaults?.defaultPublicFormStatusOnCreate || 'draft',
    };

    // Run validation for initial setup status
    const validation = validateProjectFeedbackSetup(feedbackConfig);

    await databases.createDocument(DATABASE_ID, FEEDBACK_CONFIG_COLLECTION_ID, projectId, {
      ...feedbackConfig,
      setupCompleted: validation.setupCompleted,
      setupMissingItemsJson: JSON.stringify(validation.missingItems),
    });

    return { success: true, projectId };
  } catch (err: any) {
    console.error('[Projects] createProject error:', err);
    if (err?.code === 401 || err?.code === 403) {
      return { success: false, error: 'Unauthorized: You must be an admin to create projects.' };
    }
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create project' };
  }
}

export async function getProjects(): Promise<{ success: boolean; data?: Project[]; error?: string }> {
  try {
    const { databases } = await createSessionClient();
    const res = await databases.listDocuments(DATABASE_ID, PROJECTS_COLLECTION_ID, [
      Query.orderDesc('$createdAt'),
    ]);
    
    // Explicitly map to POJO to avoid serialization errors with Appwrite Document objects
    const data = res.documents.map((doc) => {
      const normalized = normalizeProjectDates(doc as any);
      return {
        $id: normalized.$id,
        $createdAt: normalized.$createdAt,
        name: normalized.name,
        locationId: normalized.locationId,
        locationName: normalized.locationName,
        startDate: normalized.startDate,
        endDate: normalized.endDate,
        date: normalized.date,
        projectSlug: normalized.projectSlug,
        publicFeedbackFormStatus: normalized.publicFeedbackFormStatus,
        eventName: normalized.eventName,
        city: normalized.city,
        venue: normalized.venue,
      } as Project;
    });

    return { success: true, data };
  } catch (err: any) {
    console.error('[Projects] getProjects error:', err);
    if (err?.code === 401 || err?.code === 403) {
      return { success: false, error: 'Unauthorized: Please log in as an administrator.' };
    }
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch projects' };
  }
}

export async function getProject(id: string): Promise<{ success: boolean; data?: Project; error?: string }> {
  try {
    const { databases } = await createSessionClient();
    const doc = await databases.getDocument(DATABASE_ID, PROJECTS_COLLECTION_ID, id);
    
    // Explicitly map to POJO
    const normalized = normalizeProjectDates(doc as any);
    const data: Project = {
      $id: normalized.$id,
      $createdAt: normalized.$createdAt,
      name: normalized.name,
      locationId: normalized.locationId,
      locationName: normalized.locationName,
      startDate: normalized.startDate,
      endDate: normalized.endDate,
      date: normalized.date,
      projectSlug: normalized.projectSlug,
      publicFeedbackFormStatus: normalized.publicFeedbackFormStatus,
      eventName: normalized.eventName,
      city: normalized.city,
      venue: normalized.venue,
    };

    return { success: true, data };
  } catch (err: any) {
    console.error('[Projects] getProject error:', err);
    return { success: false, error: 'Project not found' };
  }
}

export async function updateProject(id: string, data: Partial<Project>): Promise<{ success: boolean; error?: string }> {
  try {
    const { databases } = await createSessionClient();
    
    // 1. Ensure metadata attributes exist (for legacy projects being updated)
    const admin = await createAdminClient();
    await ensureProjectMetadataAttributes(admin.databases);

    // 2. Perform update
    const { $id, $createdAt, $updatedAt, $permissions, $databaseId, $collectionId, ...cleanData } = data as any;
    
    await databases.updateDocument(DATABASE_ID, PROJECTS_COLLECTION_ID, id, cleanData);
    return { success: true };
  } catch (err: any) {
    console.error('[Projects] update error:', err);
    return { success: false, error: err.message || 'Failed to update project' };
  }
}

export async function deleteProject(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { databases } = await createSessionClient();
    
    // 1. Delete associated configuration
    try {
        await databases.deleteDocument(DATABASE_ID, FEEDBACK_CONFIG_COLLECTION_ID, id);
    } catch (e) {
        // Silently skip if config doesn't exist
    }

    // 2. Delete the project itself
    await databases.deleteDocument(DATABASE_ID, PROJECTS_COLLECTION_ID, id);
    
    return { success: true };
  } catch (err: any) {
    console.error('[Projects] delete error:', err);
    return { success: false, error: err.message || 'Failed to delete project' };
  }
}

/**
 * Publicly fetches project and its feedback configuration by slug.
 * Uses createAdminClient.
 */
export async function getProjectBySlug(slug: string): Promise<{ success: boolean; data?: { project: Project; config: any }; error?: string }> {
  try {
    const { databases } = await createAdminClient();
    
    // 1. Get Project
    const projRes = await databases.listDocuments(DATABASE_ID, PROJECTS_COLLECTION_ID, [
        Query.equal('projectSlug', slug),
        Query.limit(1)
    ]);
    
    if (projRes.total === 0) return { success: false, error: 'Project not found' };
    const projectDoc = projRes.documents[0];
    const normalized = normalizeProjectDates(projectDoc as any);
    const project: Project = {
        $id: normalized.$id,
        $createdAt: normalized.$createdAt,
        name: normalized.name,
        locationId: normalized.locationId,
        locationName: normalized.locationName,
        startDate: normalized.startDate,
        endDate: normalized.endDate,
        date: normalized.date,
        projectSlug: normalized.projectSlug,
        publicFeedbackFormStatus: normalized.publicFeedbackFormStatus,
        eventName: normalized.eventName,
        city: normalized.city,
        venue: normalized.venue,
    };

    // 2. Get Config
    const confRes = await databases.listDocuments(DATABASE_ID, FEEDBACK_CONFIG_COLLECTION_ID, [
        Query.equal('projectSlug', slug),
        Query.limit(1)
    ]);

    if (confRes.total === 0) return { success: false, error: 'Configuration not found' };
    const config = JSON.parse(JSON.stringify(confRes.documents[0]));

    return { 
        success: true, 
        data: { project, config } 
    };
  } catch (err) {
    console.error('[Projects] getBySlug error:', err);
    return { success: false, error: 'Failed to fetch project details' };
  }
}

async function ensureProjectMetadataAttributes(
  databases: Awaited<ReturnType<typeof createAdminClient>>['databases'],
) {
  const res = await databases.listAttributes(DATABASE_ID, PROJECTS_COLLECTION_ID);
  const existing = new Map(res.attributes.map((attribute) => [attribute.key, attribute]));
  const requiredKeys = ['startDate', 'endDate', 'projectSlug', 'publicFeedbackFormStatus', 'eventName', 'city', 'venue'];

  for (const key of requiredKeys) {
    if (existing.has(key)) {
      continue;
    }

    // Default sizes
    const size = (key === 'projectSlug' || key === 'publicFeedbackFormStatus' || key === 'eventName' || key === 'city' || key === 'venue') ? 255 : 10;
    await databases.createStringAttribute(DATABASE_ID, PROJECTS_COLLECTION_ID, key, size, false);
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
