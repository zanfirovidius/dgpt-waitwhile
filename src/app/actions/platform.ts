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
  // Attendance Module Defaults
  defaultAttendanceAccessMode?: string;
  defaultAttendanceTokenTtl?: number;
  defaultAttendanceInstructions?: string;
  defaultAttendancePrivacyNotice?: string;
  defaultAttendanceSuccessMessageCheckIn?: string;
  defaultAttendanceSuccessMessageCheckOut?: string;
  defaultCoordinatorValidationRequired?: boolean;
  defaultSignatureRequiredAtCheckout?: boolean;
  defaultBreakFieldEnabled?: boolean;
  defaultAttendanceRoles?: string[];
  defaultWaitwhileEmailDomainSuffix?: string;
}

const DEFAULT_ATTENDANCE_ROLES = ['ORGANIZATOR', 'ASISTENT', 'MEDIC', 'SECRETARIAT', 'VOLUNTAR', 'PROTOCOL', 'ȘEF-CABINET'];

function normalizeDefaultAttendanceRoles(value?: string[] | null) {
  const normalized = Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((role) => role.trim().toUpperCase())
            .filter(Boolean),
        ),
      )
    : [];

  return normalized.length > 0 ? normalized : [...DEFAULT_ATTENDANCE_ROLES];
}

function normalizePlatformSettings(settings: PlatformSettings) {
  return {
    ...settings,
    defaultAttendanceRoles: normalizeDefaultAttendanceRoles(settings.defaultAttendanceRoles),
    defaultWaitwhileEmailDomainSuffix: settings.defaultWaitwhileEmailDomainSuffix || '@dgpt.ro',
  } as PlatformSettings;
}

/**
 * Gets the global platform settings (singleton).
 * Creates a default document if none exists.
 */
export async function getPlatformSettings(): Promise<{ success: boolean; data?: PlatformSettings; error?: string }> {
  try {
    const { databases } = await createAdminClient();
    await ensurePlatformSettingsAttributes(databases);
    const res = await databases.listDocuments(DATABASE_ID, SETTINGS_COLLECTION_ID, [Query.limit(1)]);

    if (res.total === 0) {
      // Create singleton with some defaults
      const initial = normalizePlatformSettings({
        operatorName: 'Platformă DGPT',
        defaultFeedbackRetentionDays: 365,
        defaultFeedbackFormTitle: 'Feedback Eveniment',
        defaultFeedbackIntroText: 'Opinia dvs. despre evenimentul nostru este foarte importantă pentru noi.',
        defaultFeedbackConsentText: 'Sunt de acord să fiu contactat dacă feedback-ul meu necesită clarificări suplimentare.',
        defaultFeedbackSuccessMessage: 'Vă mulțumim! Răspunsul dvs. a fost înregistrat.',
        defaultPublicFormStatusOnCreate: 'draft',
        // Attendance Defaults
        defaultAttendanceAccessMode: 'token',
        defaultAttendanceTokenTtl: 30, // 30 days
        defaultAttendanceInstructions: 'Vă rugăm să folosiți acest formular pentru a marca prezența la eveniment.',
        defaultAttendancePrivacyNotice: 'Datele dvs. sunt colectate exclusiv în scopul gestionării prezenței voluntarilor și a evidenței orelor de voluntariat.',
        defaultAttendanceSuccessMessageCheckIn: 'Check-in reușit! Spor la treabă!',
        defaultAttendanceSuccessMessageCheckOut: 'Check-out reușit! Vă mulțumim pentru implicare!',
        defaultCoordinatorValidationRequired: true,
        defaultSignatureRequiredAtCheckout: true,
        defaultBreakFieldEnabled: true,
        defaultAttendanceRoles: DEFAULT_ATTENDANCE_ROLES,
        defaultWaitwhileEmailDomainSuffix: '@dgpt.ro'
      });
      const doc = await databases.createDocument(DATABASE_ID, SETTINGS_COLLECTION_ID, ID.unique(), initial);
      return { success: true, data: normalizePlatformSettings(JSON.parse(JSON.stringify(doc)) as PlatformSettings) };
    }

    return { success: true, data: normalizePlatformSettings(JSON.parse(JSON.stringify(res.documents[0])) as PlatformSettings) };
  } catch (err) {
    console.error('[PlatformSettings] get error:', err);
    return { success: false, error: 'Failed to fetch settings' };
  }
}

export async function updatePlatformSettings(data: Partial<PlatformSettings>): Promise<{ success: boolean; error?: string }> {
  try {
    const { databases } = await createAdminClient();
    await ensurePlatformSettingsAttributes(databases);
    const current = await getPlatformSettings();
    
    if (!current.success || !current.data?.$id) {
      throw new Error('Could not find existing settings');
    }

    const payload: Partial<PlatformSettings> = {
      ...data,
      defaultAttendanceRoles: normalizeDefaultAttendanceRoles(data.defaultAttendanceRoles),
    };

    await databases.updateDocument(DATABASE_ID, SETTINGS_COLLECTION_ID, current.data.$id, payload);
    return { success: true };
  } catch (err) {
    console.error('[PlatformSettings] update error:', err);
    return { success: false, error: 'Failed to update settings' };
  }
}

async function ensurePlatformSettingsAttributes(
  databases: Awaited<ReturnType<typeof createAdminClient>>['databases'],
) {
  const res = await databases.listAttributes(DATABASE_ID, SETTINGS_COLLECTION_ID, [Query.limit(100)], true);
  const existing = new Map(res.attributes.map((attribute) => [attribute.key, attribute]));
  const requiredStringAttributes = [{ key: 'defaultWaitwhileEmailDomainSuffix', size: 255 }];
  const requiredStringArrayAttributes = [{ key: 'defaultAttendanceRoles', size: 128 }];

  for (const attribute of requiredStringAttributes) {
    if (existing.has(attribute.key)) {
      continue;
    }

    try {
      await databases.createStringAttribute(
        DATABASE_ID,
        SETTINGS_COLLECTION_ID,
        attribute.key,
        attribute.size,
        false,
      );
    } catch (error) {
      if (!isDuplicateAttributeError(error)) {
        throw error;
      }
    }
  }

  for (const attribute of requiredStringArrayAttributes) {
    if (existing.has(attribute.key)) {
      continue;
    }

    try {
      await databases.createStringAttribute(
        DATABASE_ID,
        SETTINGS_COLLECTION_ID,
        attribute.key,
        attribute.size,
        false,
        undefined,
        true,
      );
    } catch (error) {
      if (!isDuplicateAttributeError(error)) {
        throw error;
      }
    }
  }

  await Promise.all(
    [...requiredStringAttributes, ...requiredStringArrayAttributes].map(async ({ key }) => {
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
    try {
      const attribute = await databases.getAttribute(DATABASE_ID, SETTINGS_COLLECTION_ID, key);

      if (attribute.status === 'available') {
        return;
      }

      if (attribute.status === 'failed' || attribute.status === 'stuck') {
        throw new Error(`Platform settings attribute "${key}" is ${attribute.status}`);
      }
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? Number((error as { code?: number }).code) : undefined;
      if (code !== 404) {
        throw error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Platform settings attribute "${key}" is still processing`);
}

function isDuplicateAttributeError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    (
      ('code' in error && Number((error as { code?: number }).code) === 409) ||
      ('message' in error && String((error as { message?: string }).message || '').toLowerCase().includes('already exists'))
    )
  );
}
