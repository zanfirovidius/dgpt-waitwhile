'use server';

import { createAdminClient } from '@/lib/appwrite-server';
import { Query, ID } from 'node-appwrite';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const SETTINGS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PLATFORM_SETTINGS_COLLECTION_ID!;

export interface PlatformSettings {
  $id?: string;
  operatorName?: string;
  operatorLegalName?: string;
  operatorTaxId?: string;
  operatorAddress?: string;
  operatorPhone?: string;
  dpoName?: string;
  dpoEmail?: string;
  defaultFeedbackRetentionDays?: number;
  defaultPrivacyNoticeTemplate?: string;
  defaultFeedbackFormTitle?: string;
  defaultFeedbackIntroText?: string;
  defaultFeedbackConsentText?: string;
  defaultFeedbackSuccessMessage?: string;
  defaultPublicFormStatusOnCreate?: string;
}

/**
 * Gets the global platform settings (singleton).
 * Creates a default document if none exists.
 */
export async function getPlatformSettings(): Promise<{ success: boolean; data?: PlatformSettings; error?: string }> {
  try {
    const { databases } = await createAdminClient();
    const res = await databases.listDocuments(DATABASE_ID, SETTINGS_COLLECTION_ID, [Query.limit(1)]);

    if (res.total === 0) {
      // Create singleton with some defaults
      const initial: PlatformSettings = {
        operatorName: 'Platformă DGPT',
        defaultFeedbackRetentionDays: 365,
        defaultFeedbackFormTitle: 'Feedback Eveniment',
        defaultFeedbackIntroText: 'Opinia dvs. despre evenimentul nostru este foarte importantă pentru noi.',
        defaultFeedbackConsentText: 'Sunt de acord să fiu contactat dacă feedback-ul meu necesită clarificări suplimentare.',
        defaultFeedbackSuccessMessage: 'Vă mulțumim! Răspunsul dvs. a fost înregistrat.',
        defaultPublicFormStatusOnCreate: 'draft'
      };
      const doc = await databases.createDocument(DATABASE_ID, SETTINGS_COLLECTION_ID, ID.unique(), initial);
      return { success: true, data: JSON.parse(JSON.stringify(doc)) as PlatformSettings };
    }

    return { success: true, data: JSON.parse(JSON.stringify(res.documents[0])) as PlatformSettings };
  } catch (err) {
    console.error('[PlatformSettings] get error:', err);
    return { success: false, error: 'Failed to fetch settings' };
  }
}

export async function updatePlatformSettings(data: Partial<PlatformSettings>): Promise<{ success: boolean; error?: string }> {
  try {
    const { databases } = await createAdminClient();
    const current = await getPlatformSettings();
    
    if (!current.success || !current.data?.$id) {
      throw new Error('Could not find existing settings');
    }

    await databases.updateDocument(DATABASE_ID, SETTINGS_COLLECTION_ID, current.data.$id, data);
    return { success: true };
  } catch (err) {
    console.error('[PlatformSettings] update error:', err);
    return { success: false, error: 'Failed to update settings' };
  }
}
