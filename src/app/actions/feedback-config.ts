'use server';

import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import type { ProjectFeedbackConfig as FeedbackValidationInput } from '@/lib/setup-validation';
import { validateProjectFeedbackSetup } from '@/lib/setup-validation';
import { ID } from 'node-appwrite';
import { getPlatformSettings } from './platform';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const CONFIG_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_FEEDBACK_CONFIG_COLLECTION_ID!;
const AUDIT_LOGS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_AUDIT_LOGS_COLLECTION_ID!;

type AppwriteLikeError = {
  code?: number;
  message?: string;
};

type ProjectMetadataRecord = {
  name?: string;
  projectSlug?: string;
  eventName?: string;
  city?: string;
  venue?: string;
  locationName?: string;
};

function getErrorCode(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as AppwriteLikeError).code;
    return typeof code === 'number' ? code : undefined;
  }

  return undefined;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as AppwriteLikeError).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return fallback;
}

export interface FeedbackConfig {
  $id?: string;
  projectId: string;
  projectSlug: string;
  publicFeedbackFormStatus: string;
  feedbackRetentionDays: number;
  operatorName: string;
  operatorLegalName: string;
  operatorTaxId: string;
  operatorAddress: string;
  operatorPhone: string;
  dpoName: string;
  dpoEmail: string;
  privacyNoticeText: string;
  feedbackFormTitle: string;
  feedbackFormIntroText: string;
  feedbackFormConsentText: string;
  feedbackSuccessMessage: string;
  setupCompleted: boolean;
  setupMissingItemsJson: string;
}

export async function getProjectFeedbackConfig(projectId: string): Promise<{ success: boolean; data?: FeedbackConfig; error?: string }> {
  try {
    const { databases } = await createSessionClient();
    const doc = await databases.getDocument(DATABASE_ID, CONFIG_COLLECTION_ID, projectId);
    return { success: true, data: JSON.parse(JSON.stringify(doc)) as FeedbackConfig };
  } catch (err: unknown) {
    if (getErrorCode(err) === 404) {
        return { success: false, error: 'Configurația de feedback nu a fost găsită' };
    }
    console.error('[FeedbackConfig] get error:', err);
    return { success: false, error: 'Eroare la preluarea configurației de feedback' };
  }
}

export async function updateProjectFeedbackConfig(projectId: string, data: Partial<FeedbackConfig>): Promise<{ success: boolean; error?: string }> {
  try {
    const { databases, account } = await createSessionClient();
    
    // 1. Get current for audit log or handle missing
    let currentDoc: FeedbackConfig;
    try {
        currentDoc = JSON.parse(
          JSON.stringify(await databases.getDocument(DATABASE_ID, CONFIG_COLLECTION_ID, projectId)),
        ) as FeedbackConfig;
    } catch (err: unknown) {
        if (getErrorCode(err) === 404) {
            // Missing config (likely a legacy project), provision it now
            const settingsRes = await getPlatformSettings();
            const defaults = settingsRes.data;
            const { databases: adminDb } = await createAdminClient();
            const projectDoc = JSON.parse(
              JSON.stringify(
                await adminDb.getDocument(
                  DATABASE_ID,
                  process.env.NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID!,
                  projectId,
                ),
              ),
            ) as ProjectMetadataRecord;
            
            const initial: Omit<FeedbackConfig, '$id' | 'setupCompleted' | 'setupMissingItemsJson'> = {
                projectId,
                projectSlug: projectDoc.projectSlug || '',
                publicFeedbackFormStatus: 'draft',
                operatorName: defaults?.operatorName || '',
                operatorLegalName: defaults?.operatorLegalName || '',
                operatorTaxId: defaults?.operatorTaxId || '',
                operatorAddress: defaults?.operatorAddress || '',
                operatorPhone: defaults?.operatorPhone || '',
                dpoName: defaults?.dpoName || '',
                dpoEmail: defaults?.dpoEmail || '',
                privacyNoticeText: defaults?.defaultPrivacyNoticeTemplate || 'Șablon Notă de Confidențialitate... (aceasta trebuie să aibă cel puțin 50 de caractere pentru a trece validarea).',
                feedbackFormTitle: defaults?.defaultFeedbackFormTitle || 'Feedback Eveniment',
                feedbackFormIntroText: defaults?.defaultFeedbackIntroText || '',
                feedbackFormConsentText: defaults?.defaultFeedbackConsentText || '',
                feedbackSuccessMessage: defaults?.defaultFeedbackSuccessMessage || '',
                feedbackRetentionDays: defaults?.defaultFeedbackRetentionDays || 365,
            };
            currentDoc = JSON.parse(
              JSON.stringify(await databases.createDocument(DATABASE_ID, CONFIG_COLLECTION_ID, projectId, initial)),
            ) as FeedbackConfig;
        } else {
            throw err;
        }
    }

    let actorUserId = 'system';
    try {
        const actor = await account.get();
        actorUserId = actor.$id;
    } catch {
        // Fallback for missing session or scopes (e.g. dev mode)
        console.warn('[FeedbackConfig] Could not identify actor for audit log');
    }

    // 2. Perform validation - FETCH PROJECT FOR METADATA
    const { databases: adminDbLocal } = await createAdminClient();
    const projectDoc = JSON.parse(
      JSON.stringify(
        await adminDbLocal.getDocument(
          DATABASE_ID,
          process.env.NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID!,
          projectId,
        ),
      ),
    ) as ProjectMetadataRecord;
    
    const updated: FeedbackValidationInput = { 
        ...currentDoc, 
        ...data,
        // Sync metadata from project level for validation
        eventName: projectDoc.eventName || projectDoc.name || '',
        city: projectDoc.city || '',
        venue: projectDoc.venue || projectDoc.locationName || '',
    };
    
    const validation = validateProjectFeedbackSetup(updated);
    
    // 3. Prepare clean data for update (strip system fields and metadata fields we now store at project level)
    const cleanData: Partial<FeedbackConfig> = { ...data };
    delete cleanData.$id;

    const finalData = {
      ...cleanData,
      setupCompleted: validation.setupCompleted,
      setupMissingItemsJson: JSON.stringify(validation.missingItems),
    };

    // 4. Update document
    await databases.updateDocument(DATABASE_ID, CONFIG_COLLECTION_ID, projectId, finalData);

    // 5. Audit Log (Truncated to avoid 1500 char limit errors)
    const { databases: adminDb } = await createAdminClient();
    const strBefore = JSON.stringify(currentDoc);
    const strAfter = JSON.stringify({ ...currentDoc, ...finalData });

    await adminDb.createDocument(DATABASE_ID, AUDIT_LOGS_COLLECTION_ID, ID.unique(), {
      entityType: 'project_feedback_config',
      entityId: projectId,
      action: 'update',
      actorUserId,
      beforeJson: strBefore.length > 1500 ? strBefore.substring(0, 1497) + '...' : strBefore,
      afterJson: strAfter.length > 1500 ? strAfter.substring(0, 1497) + '...' : strAfter,
    });

    return { success: true };
  } catch (err: unknown) {
    console.error('[FeedbackConfig] update error:', err);
    return { success: false, error: getErrorMessage(err, 'Nu am putut actualiza configurația de feedback') };
  }
}

export async function resetProjectFeedbackConfigToDefaults(projectId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const settingsRes = await getPlatformSettings();
    const defaults = settingsRes.data;

    if (!defaults) throw new Error('Platform defaults not found');

    const resetData: Partial<FeedbackConfig> = {
      operatorName: defaults.operatorName,
      operatorLegalName: defaults.operatorLegalName,
      operatorTaxId: defaults.operatorTaxId,
      operatorAddress: defaults.operatorAddress,
      operatorPhone: defaults.operatorPhone,
      dpoName: defaults.dpoName,
      dpoEmail: defaults.dpoEmail,
      privacyNoticeText: defaults.defaultPrivacyNoticeTemplate,
      feedbackFormTitle: defaults.defaultFeedbackFormTitle,
      feedbackFormIntroText: defaults.defaultFeedbackIntroText,
      feedbackFormConsentText: defaults.defaultFeedbackConsentText,
      feedbackSuccessMessage: defaults.defaultFeedbackSuccessMessage,
      feedbackRetentionDays: defaults.defaultFeedbackRetentionDays,
    };

    return await updateProjectFeedbackConfig(projectId, resetData);
  } catch (err) {
    console.error('[FeedbackConfig] reset error:', err);
    return { success: false, error: 'Eroare la resetarea configurației' };
  }
}
