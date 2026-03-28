'use server';

import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import { Query, ID } from 'node-appwrite';
import { validateProjectAttendanceSetup } from '@/lib/setup-validation';
import { getPlatformSettings } from './platform';
import { getProject } from './projects';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const ATTENDANCE_CONFIG_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ATTENDANCE_CONFIG_COLLECTION_ID || 'project_attendance_config';

export interface AttendanceConfig {
  $id?: string;
  projectId: string;
  projectSlug?: string;
  attendanceEnabled: boolean;
  attendanceAccessMode: 'token' | 'pin' | 'qr';
  attendanceAccessToken?: string;
  attendanceAccessPinHash?: string;
  instructions?: string;
  privacyNotice?: string;
  successMessageCheckIn?: string;
  successMessageCheckOut?: string;
  coordinatorValidationRequired: boolean;
  signatureRequiredAtCheckout: boolean;
  breakFieldEnabled: boolean;
  attendanceRoles?: string[];
  setupCompleted?: boolean;
  setupMissingItemsJson?: string;
}

export async function getProjectAttendanceConfig(projectId: string): Promise<{ success: boolean; data?: AttendanceConfig; error?: string }> {
  try {
    const { databases } = await createAdminClient();
    try {
      const doc = await databases.getDocument(DATABASE_ID, ATTENDANCE_CONFIG_COLLECTION_ID, projectId);
      return { success: true, data: JSON.parse(JSON.stringify(doc)) as AttendanceConfig };
    } catch (err: any) {
      if (err.code === 404) {
        // LAZY INITIALIZATION for existing projects
        const { databases: adminDb } = await createAdminClient();
        const settingsRes = await getPlatformSettings();
        const projectRes = await getProject(projectId);
        
        if (!projectRes.success || !projectRes.data) throw new Error('Project not found');

        const defaults = settingsRes.data;
        const initial: AttendanceConfig = {
          projectId,
          projectSlug: projectRes.data.projectSlug,
          attendanceEnabled: false,
          attendanceAccessMode: (defaults?.defaultAttendanceAccessMode as any) || 'token',
          attendanceAccessToken: Math.random().toString(36).substring(2, 12).toUpperCase(),
          instructions: defaults?.defaultAttendanceInstructions,
          privacyNotice: defaults?.defaultAttendancePrivacyNotice,
          successMessageCheckIn: defaults?.defaultAttendanceSuccessMessageCheckIn,
          successMessageCheckOut: defaults?.defaultAttendanceSuccessMessageCheckOut,
          coordinatorValidationRequired: defaults?.defaultCoordinatorValidationRequired ?? true,
          signatureRequiredAtCheckout: defaults?.defaultSignatureRequiredAtCheckout ?? true,
          breakFieldEnabled: defaults?.defaultBreakFieldEnabled ?? true,
          attendanceRoles: defaults?.defaultAttendanceRoles || []
        };

        const doc = await adminDb.createDocument(DATABASE_ID, ATTENDANCE_CONFIG_COLLECTION_ID, projectId, initial);
        return { success: true, data: JSON.parse(JSON.stringify(doc)) as AttendanceConfig };
      }
      throw err;
    }
  } catch (err: any) {
    console.error('[AttendanceConfig] get error:', err);
    return { success: false, error: err.message || 'Configuration error' };
  }
}

export async function updateProjectAttendanceConfig(projectId: string, data: Partial<AttendanceConfig>): Promise<{ success: boolean; error?: string }> {
  try {
    const { databases } = await createSessionClient();
    
    // 1. Fetch current for validation
    const currentRes = await getProjectAttendanceConfig(projectId);
    if (!currentRes.success || !currentRes.data) throw new Error('Config not found');
    
    const updated = { ...currentRes.data, ...data };
    const validation = validateProjectAttendanceSetup(updated);
    
    // 2. Perform update
    const { $id, $createdAt, $updatedAt, $permissions, $databaseId, $collectionId, ...cleanData } = updated as any;
    
    await databases.updateDocument(DATABASE_ID, ATTENDANCE_CONFIG_COLLECTION_ID, projectId, {
      ...cleanData,
      setupCompleted: validation.setupCompleted,
      setupMissingItemsJson: JSON.stringify(validation.missingItems),
    });
    
    return { success: true };
  } catch (err: any) {
    console.error('[AttendanceConfig] update error:', err);
    return { success: false, error: err.message || 'Failed to update config' };
  }
}

export async function getAttendanceConfigBySlug(slug: string): Promise<{ success: boolean; data?: AttendanceConfig; error?: string }> {
    try {
        const { databases } = await createAdminClient();
        const res = await databases.listDocuments(DATABASE_ID, ATTENDANCE_CONFIG_COLLECTION_ID, [
            Query.equal('projectSlug', slug),
            Query.limit(1)
        ]);

        if (res.total === 0) {
            // If not found by slug directly (maybe legacy or not yet initialized), 
            // we'd need to find the project by slug first, but our projects store slug too.
            return { success: false, error: 'Config not found for this slug' };
        }

        return { success: true, data: JSON.parse(JSON.stringify(res.documents[0])) as AttendanceConfig };
    } catch (err: any) {
        console.error('[AttendanceConfig] getBySlug error:', err);
        return { success: false, error: 'Configuration error' };
    }
}
