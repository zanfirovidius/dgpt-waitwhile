'use server';

import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import { ID, Query } from 'node-appwrite';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const SUBMISSIONS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_FEEDBACK_SUBMISSIONS_COLLECTION_ID!;

type AppwriteLikeError = {
  message?: string;
};

type ProjectSnapshotDocument = {
  name?: string;
  city?: string;
  locationName?: string;
};

type ConfigSnapshotDocument = {
  projectSlug?: string;
  publicFeedbackFormStatus?: string;
  operatorName?: string;
};

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

export interface FeedbackSubmission {
  $id?: string;
  projectId: string;
  projectSlugSnapshot: string;
  eventNameSnapshot: string;
  citySnapshot: string;
  venueSnapshot: string;
  operatorNameSnapshot: string;
  participationDate: string;
  subLocation?: string;
  category: string;
  message: string;
  fullName?: string;
  email?: string;
  phone?: string;
  consentToBeContacted: boolean;
  isAnonymous: boolean;
  status: string; // new | in_review | resolved | archived
  sourceIpHash?: string;
  userAgentHash?: string;
  $createdAt?: string;
}

export async function submitFeedback(data: Partial<FeedbackSubmission>): Promise<{ success: boolean; error?: string }> {
  try {
    const { databases } = await createAdminClient(); // Unauthenticated public submission

    // 1. Resolve Project and Config to ensure it's active
    const projectId = data.projectId;
    if (!projectId) throw new Error('Missing project ID');
    
    // Fetch directly via admin client to avoid session restrictions
    const projectDoc = JSON.parse(
      JSON.stringify(
        await databases.getDocument(DATABASE_ID, process.env.NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID!, projectId),
      ),
    ) as ProjectSnapshotDocument;
    const configDoc = JSON.parse(
      JSON.stringify(
        await databases.getDocument(
          DATABASE_ID,
          process.env.NEXT_PUBLIC_APPWRITE_PROJECT_FEEDBACK_CONFIG_COLLECTION_ID!,
          projectId,
        ),
      ),
    ) as ConfigSnapshotDocument;
    
    if (!projectDoc) throw new Error('Project not found');
    if (!configDoc) throw new Error('Feedback config not found');
    
    if (configDoc.publicFeedbackFormStatus !== 'active') {
       throw new Error('This feedback form is currently inactive');
    }

    // 2. Snapshots for historical integrity
    const snapshot = {
        projectSlugSnapshot: configDoc.projectSlug || '',
        eventNameSnapshot: projectDoc.name || '',
        citySnapshot: projectDoc.city || '',
        venueSnapshot: projectDoc.locationName || '',
        operatorNameSnapshot: configDoc.operatorName || '',
    };

    // 3. Validation and basic anti-spam (already done partially by type-safety, but let's be explicit)
    if (!data.participationDate || !data.category || !data.message) {
        throw new Error('Missing required feedback fields');
    }

    // 4. Determine anonymity
    const isAnonymous = !data.fullName && !data.email && !data.phone;
    if (!isAnonymous && !data.consentToBeContacted) {
        throw new Error('Consent is required when providing contact details');
    }

    // 5. Save to Appwrite
    const submission: FeedbackSubmission = {
        projectId,
        participationDate: data.participationDate,
        category: data.category,
        message: data.message,
        subLocation: data.subLocation,
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        consentToBeContacted: Boolean(data.consentToBeContacted),
        ...snapshot,
        isAnonymous,
        status: 'new',
    };

    await databases.createDocument(DATABASE_ID, SUBMISSIONS_COLLECTION_ID, ID.unique(), submission);
    
    return { success: true };
  } catch (err: unknown) {
    console.error('[Submissions] submit error:', err);
    return { success: false, error: getErrorMessage(err, 'Nu am putut trimite feedback-ul') };
  }
}

export async function getProjectSubmissions(projectId: string): Promise<{ success: boolean; data?: FeedbackSubmission[]; error?: string }> {
  try {
    const { databases } = await createSessionClient();
    const res = await databases.listDocuments(DATABASE_ID, SUBMISSIONS_COLLECTION_ID, [
        Query.equal('projectId', projectId),
        Query.orderDesc('$createdAt'),
    ]);
    return { success: true, data: JSON.parse(JSON.stringify(res.documents)) as FeedbackSubmission[] };
  } catch (err) {
    console.error('[Submissions] get error:', err);
    return { success: false, error: 'Eroare la preluarea trimiterilor' };
  }
}

export async function updateSubmissionStatus(submissionId: string, status: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { databases } = await createSessionClient();
      await databases.updateDocument(DATABASE_ID, SUBMISSIONS_COLLECTION_ID, submissionId, { status });
      return { success: true };
    } catch (err) {
      console.error('[Submissions] update status error:', err);
      return { success: false, error: 'Eroare la actualizarea statusului' };
    }
}

export async function deleteSubmission(submissionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { databases } = await createSessionClient();
      await databases.deleteDocument(DATABASE_ID, SUBMISSIONS_COLLECTION_ID, submissionId);
      return { success: true };
    } catch (err) {
      console.error('[Submissions] delete error:', err);
      return { success: false, error: 'Failed to delete submission' };
    }
}
export async function getProjectSubmissionsCSV(projectId: string): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const res = await getProjectSubmissions(projectId);
    if (!res.success || !res.data) throw new Error(res.error || 'No data found');

    const headers = [
      'ID', 'Date', 'Category', 'Message', 'Project', 'Location', 
      'Participant Name', 'Email', 'Phone', 'Participation Date', 
      'Sub-Location', 'Status', 'Is Anonymous'
    ];

    const rows = res.data.map(s => [
      s.$id,
      s.$createdAt ? new Date(s.$createdAt).toLocaleString('ro-RO') : '',
      s.category,
      `"${s.message.replace(/"/g, '""')}"`,
      `"${s.eventNameSnapshot.replace(/"/g, '""')}"`,
      `"${s.venueSnapshot.replace(/"/g, '""')}"`,
      s.isAnonymous ? 'Anonymous' : `"${s.fullName?.replace(/"/g, '""')}"`,
      s.isAnonymous ? '' : s.email,
      s.isAnonymous ? '' : s.phone,
      s.participationDate,
      s.subLocation || '',
      s.status,
      s.isAnonymous ? 'Yes' : 'No'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    return { success: true, data: csvContent };
  } catch (err) {
    console.error('[Submissions] CSV error:', err);
    return { success: false, error: 'Eroare la generarea CSV-ului' };
  }
}
