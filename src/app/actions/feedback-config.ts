'use server';

import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import { ID, Query } from 'node-appwrite';
import { getPlatformSettings } from './platform';
import { validateProjectFeedbackSetup } from '@/lib/setup-validation';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const CONFIG_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_FEEDBACK_CONFIG_COLLECTION_ID!;
const AUDIT_LOGS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_AUDIT_LOGS_COLLECTION_ID!;

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
  } catch (err: any) {
    if (err.code === 404) {
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
    let currentDoc: any;
    try {
        currentDoc = await databases.getDocument(DATABASE_ID, CONFIG_COLLECTION_ID, projectId);
    } catch (err: any) {
        if (err.code === 404) {
            // Missing config (likely a legacy project), provision it now
            const settingsRes = await getPlatformSettings();
            const defaults = settingsRes.data;
            const { databases: adminDb } = await createAdminClient();
            const projectDoc = await adminDb.getDocument(DATABASE_ID, process.env.NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID!, projectId);
            
            const initial = {
                projectId,
                projectSlug: (projectDoc as any).projectSlug || '',
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
            currentDoc = await databases.createDocument(DATABASE_ID, CONFIG_COLLECTION_ID, projectId, initial);
        } else {
            throw err;
        }
    }

    let actorUserId = 'system';
    try {
        const actor = await account.get();
        actorUserId = actor.$id;
    } catch (e) {
        // Fallback for missing session or scopes (e.g. dev mode)
        console.warn('[FeedbackConfig] Could not identify actor for audit log');
    }

    // 2. Perform validation - FETCH PROJECT FOR METADATA
    const { databases: adminDbLocal } = await createAdminClient();
    const projectDoc = await adminDbLocal.getDocument(DATABASE_ID, process.env.NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID!, projectId);
    
    const updated = { 
        ...currentDoc, 
        ...data,
        // Sync metadata from project level for validation
        eventName: (projectDoc as any).eventName || projectDoc.name || '',
        city: (projectDoc as any).city || '',
        venue: (projectDoc as any).venue || projectDoc.locationName || '',
    } as any;
    
    const validation = validateProjectFeedbackSetup(updated);
    
    // 3. Prepare clean data for update (strip system fields and metadata fields we now store at project level)
    const { $id, $createdAt, $updatedAt, $permissions, $databaseId, $collectionId, projectId: pId, eventName, city, venue, ...cleanData } = data as any;

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
  } catch (err: any) {
    console.error('[FeedbackConfig] update error:', err);
    return { success: false, error: err.message || 'Failed to update configuration' };
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
