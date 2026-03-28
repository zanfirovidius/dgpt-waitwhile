'use server';
// Trigger HMR update

import { ID, Query } from 'node-appwrite';
import { createAdminClient, createSessionClient } from '../../lib/appwrite-server';
import { normalizeProjectDates } from '@/lib/project-dates';
import { normalizeToSlug, ensureUniqueProjectSlug } from '@/lib/slug';
import { getPlatformSettings } from './platform';
import {
  deleteProjectVolunteerSettings,
  resolveProjectWaitwhileEmailDomainSuffix,
  upsertProjectVolunteerSettings,
} from './project-volunteer-settings';
import { validateProjectFeedbackSetup, validateProjectAttendanceSetup } from '@/lib/setup-validation';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const PROJECTS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID!;
const FEEDBACK_CONFIG_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_FEEDBACK_CONFIG_COLLECTION_ID!;
const ATTENDANCE_CONFIG_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ATTENDANCE_CONFIG_COLLECTION_ID || 'project_attendance_config';

type AppwriteLikeError = {
  code?: number;
  message?: string;
};

type ProjectDocument = Project & {
  $updatedAt?: string;
  $permissions?: string[];
  $databaseId?: string;
  $collectionId?: string;
};

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
  waitwhileEmailDomainSuffix?: string;
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

    // 6. Create the linked Attendance Config with inherited defaults
    const attendanceConfig = {
      projectId: projectId,
      projectSlug: uniqueSlug,
      attendanceEnabled: true,
      attendanceAccessMode: defaults?.defaultAttendanceAccessMode || 'token',
      attendanceAccessToken: defaults?.defaultAttendanceAccessMode === 'token' ? Math.random().toString(36).substring(2, 12) : '',
      instructions: defaults?.defaultAttendanceInstructions || '',
      privacyNotice: defaults?.defaultAttendancePrivacyNotice || '',
      successMessageCheckIn: defaults?.defaultAttendanceSuccessMessageCheckIn || '',
      successMessageCheckOut: defaults?.defaultAttendanceSuccessMessageCheckOut || '',
      coordinatorValidationRequired: defaults?.defaultCoordinatorValidationRequired ?? true,
      signatureRequiredAtCheckout: defaults?.defaultSignatureRequiredAtCheckout ?? true,
      breakFieldEnabled: defaults?.defaultBreakFieldEnabled ?? true,
    };

    const attValidation = validateProjectAttendanceSetup(attendanceConfig);

    await databases.createDocument(DATABASE_ID, ATTENDANCE_CONFIG_COLLECTION_ID, projectId, {
      ...attendanceConfig,
      setupCompleted: attValidation.setupCompleted,
      setupMissingItemsJson: JSON.stringify(attValidation.missingItems),
    });

    const volunteerSettingsRes = await upsertProjectVolunteerSettings(
      projectId,
      {
        waitwhileEmailDomainSuffix: defaults?.defaultWaitwhileEmailDomainSuffix || '@dgpt.ro',
      },
      { useAdmin: true },
    );

    if (!volunteerSettingsRes.success) {
      console.warn('[Projects] volunteer settings seed warning:', volunteerSettingsRes.error);
    }

    return { success: true, projectId };
  } catch (err: unknown) {
    console.error('[Projects] createProject error:', err);
    const errorCode = getErrorCode(err);

    if (errorCode === 401 || errorCode === 403) {
      return { success: false, error: 'Unauthorized: You must be an admin to create projects.' };
    }

    return { success: false, error: getErrorMessage(err, 'Failed to create project') };
  }
}

export async function getProjects(): Promise<{ success: boolean; data?: Project[]; error?: string }> {
  try {
    const { databases } = await createSessionClient();
    const res = await databases.listDocuments(DATABASE_ID, PROJECTS_COLLECTION_ID, [
      Query.orderDesc('$createdAt'),
    ]);
    
    // Explicitly map to POJO to avoid serialization errors with Appwrite Document objects
    const data = await Promise.all(res.documents.map(async (doc) => {
      const normalized = normalizeProjectDates(doc as ProjectDocument);
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
        waitwhileEmailDomainSuffix: await resolveProjectWaitwhileEmailDomainSuffix(
          normalized.$id,
          normalized.waitwhileEmailDomainSuffix,
        ),
      } as Project;
    }));

    return { success: true, data };
  } catch (err: unknown) {
    console.error('[Projects] getProjects error:', err);
    const errorCode = getErrorCode(err);

    if (errorCode === 401 || errorCode === 403) {
      return { success: false, error: 'Unauthorized: Please log in as an administrator.' };
    }

    return { success: false, error: getErrorMessage(err, 'Failed to fetch projects') };
  }
}

export async function getProject(id: string): Promise<{ success: boolean; data?: Project; error?: string }> {
  try {
    const { databases } = await createSessionClient();
    const doc = await databases.getDocument(DATABASE_ID, PROJECTS_COLLECTION_ID, id);
    
    // Explicitly map to POJO
    const normalized = normalizeProjectDates(doc as ProjectDocument);
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
      waitwhileEmailDomainSuffix: await resolveProjectWaitwhileEmailDomainSuffix(
        normalized.$id,
        normalized.waitwhileEmailDomainSuffix,
      ),
    };

    return { success: true, data };
  } catch (err: unknown) {
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
    const cleanData: Record<string, unknown> = { ...data };
    const waitwhileEmailDomainSuffix = data.waitwhileEmailDomainSuffix;

    delete cleanData.$id;
    delete cleanData.$createdAt;
    delete cleanData.waitwhileEmailDomainSuffix;
    delete cleanData.$updatedAt;
    delete cleanData.$permissions;
    delete cleanData.$databaseId;
    delete cleanData.$collectionId;

    if (waitwhileEmailDomainSuffix !== undefined) {
      const currentProject = await getProject(id);
      const settingsRes = await upsertProjectVolunteerSettings(
        id,
        { waitwhileEmailDomainSuffix },
        {
          legacySuffix: currentProject.success ? currentProject.data?.waitwhileEmailDomainSuffix : undefined,
        },
      );

      if (!settingsRes.success) {
        throw new Error(settingsRes.error || 'Failed to update project volunteer settings');
      }
    }

    if (cleanData.startDate !== undefined) {
      cleanData.date = cleanData.startDate;
    }

    if (Object.keys(cleanData).length > 0) {
      await databases.updateDocument(DATABASE_ID, PROJECTS_COLLECTION_ID, id, cleanData);
    }

    return { success: true };
  } catch (err: unknown) {
    console.error('[Projects] update error:', err);
    return { success: false, error: getErrorMessage(err, 'Failed to update project') };
  }
}

export async function deleteProject(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { databases } = await createSessionClient();
    
    // 1. Delete associated configuration
    try {
        await databases.deleteDocument(DATABASE_ID, FEEDBACK_CONFIG_COLLECTION_ID, id);
    } catch {
        // Silently skip if config doesn't exist
    }

    // 1b. Delete associated attendance configuration
    try {
        await databases.deleteDocument(DATABASE_ID, ATTENDANCE_CONFIG_COLLECTION_ID, id);
    } catch {
        // Silently skip if config doesn't exist
    }

    const volunteerSettingsDeleteRes = await deleteProjectVolunteerSettings(id);
    if (!volunteerSettingsDeleteRes.success) {
        console.warn('[Projects] volunteer settings delete warning:', volunteerSettingsDeleteRes.error);
    }

    // 2. Delete the project itself
    await databases.deleteDocument(DATABASE_ID, PROJECTS_COLLECTION_ID, id);
    
    return { success: true };
  } catch (err: unknown) {
    console.error('[Projects] delete error:', err);
    return { success: false, error: getErrorMessage(err, 'Failed to delete project') };
  }
}

/**
 * Publicly fetches project and its feedback configuration by slug.
 * Uses createAdminClient.
 */
export async function getProjectBySlug(
  slug: string,
): Promise<{ success: boolean; data?: { project: Project; config: Record<string, unknown> }; error?: string }> {
  try {
    const { databases } = await createAdminClient();
    
    // 1. Get Project
    const projRes = await databases.listDocuments(DATABASE_ID, PROJECTS_COLLECTION_ID, [
        Query.equal('projectSlug', slug),
        Query.limit(1)
    ]);
    
    if (projRes.total === 0) return { success: false, error: 'Project not found' };
    const projectDoc = projRes.documents[0];
    const normalized = normalizeProjectDates(projectDoc as ProjectDocument);
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
        waitwhileEmailDomainSuffix: await resolveProjectWaitwhileEmailDomainSuffix(
          normalized.$id,
          normalized.waitwhileEmailDomainSuffix,
          { useAdmin: true },
        ),
    };

    // 2. Get Config
    const confRes = await databases.listDocuments(DATABASE_ID, FEEDBACK_CONFIG_COLLECTION_ID, [
        Query.equal('projectSlug', slug),
        Query.limit(1)
    ]);

    if (confRes.total === 0) return { success: false, error: 'Configuration not found' };
    const config = JSON.parse(JSON.stringify(confRes.documents[0])) as Record<string, unknown>;

    return {
        success: true,
        data: { project, config }
    };
  } catch (err: unknown) {
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

function getErrorCode(error: unknown) {
  return toAppwriteLikeError(error).code;
}

function getErrorMessage(error: unknown, fallback: string) {
  return toAppwriteLikeError(error).message || fallback;
}

function toAppwriteLikeError(error: unknown): AppwriteLikeError {
  if (error instanceof Error) {
    return error as AppwriteLikeError;
  }

  if (typeof error === 'object' && error !== null) {
    return error as AppwriteLikeError;
  }

  return { message: undefined };
}
