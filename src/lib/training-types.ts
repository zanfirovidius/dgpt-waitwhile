export type TrainingSessionStatus = 'draft' | 'collecting' | 'finalized';

export interface TrainingSession {
  $id?: string;
  projectId: string;
  projectSlugSnapshot?: string;
  eventName: string;
  location: string;
  trainingDate: string;
  instructorName: string;
  instructorUserId: string;
  status: TrainingSessionStatus;
  trainingTypes?: string[];
  topics?: string;
  accessToken?: string;
  instructorSignatureImageId?: string;
  archivedPdfFileId?: string;
  archivedFileName?: string;
  archivedAt?: string;
  finalizedAt?: string;
  finalizedByUserId?: string;
  $createdAt?: string;
  $updatedAt?: string;
}

export interface TrainingAttendanceEntry {
  $id?: string;
  sessionId: string;
  projectId: string;
  volunteerId?: string;
  volunteerName: string;
  volunteerNameNormalized: string;
  cnp?: string;
  identitySeries?: string;
  identityNumber?: string;
  signatureImageId?: string;
  signedAt: string;
  confirmedParticipation: boolean;
  source?: 'public' | 'admin';
  $createdAt?: string;
  $updatedAt?: string;
}

export interface TrainingReportParticipant extends TrainingAttendanceEntry {
  signatureDataUrl?: string | null;
}

export interface TrainingOrganizerSnapshot {
  operatorName?: string;
  operatorLegalName?: string;
  operatorTaxId?: string;
  operatorAddress?: string;
  operatorPhone?: string;
}

export interface TrainingReportContext {
  session: TrainingSession;
  projectName: string;
  projectSlug: string;
  organizer: TrainingOrganizerSnapshot;
  entries: TrainingReportParticipant[];
  instructorSignatureDataUrl?: string | null;
}
