export type IncidentStatus = 'new' | 'in_review' | 'resolved' | 'archived';

export type IncidentRiskLevel = 'low' | 'medium' | 'high';

export type IncidentNotificationStatus =
  | 'pending'
  | 'sent'
  | 'failed'
  | 'missing_recipient'
  | 'unconfigured';

export interface IncidentRecord {
  $id?: string;
  projectId: string;
  projectSlugSnapshot?: string;
  eventName: string;
  location: string;
  reportedAt: string;
  discoveredAt: string;
  reporterName?: string;
  reporterRole?: string;
  reporterContact?: string;
  incidentType: string;
  description: string;
  affectedCategories?: string[];
  affectedCount?: number;
  dataTypes?: string[];
  immediateActions?: string;
  status: IncidentStatus;
  riskLevel?: IncidentRiskLevel;
  requiresNotification?: boolean;
  notificationDeadline?: string;
  dpoNotes?: string;
  evaluatedByUserId?: string;
  evaluatedAt?: string;
  dpoNameSnapshot?: string;
  dpoEmailSnapshot?: string;
  notificationStatus?: IncidentNotificationStatus;
  notificationSentAt?: string;
  notificationError?: string;
  notificationMessageId?: string;
  authorityNotifiedAt?: string;
  authorityNotificationReference?: string;
  archivedPdfFileId?: string;
  archivedFileName?: string;
  archivedAt?: string;
  $createdAt?: string;
  $updatedAt?: string;
}

export interface IncidentAuditLog {
  $id?: string;
  entityType: string;
  entityId: string;
  action: string;
  actorUserId: string;
  beforeJson?: string;
  afterJson?: string;
  $createdAt?: string;
}

export interface IncidentOrganizerSnapshot {
  operatorName?: string;
  operatorLegalName?: string;
  operatorTaxId?: string;
  operatorAddress?: string;
  operatorPhone?: string;
  dpoName?: string;
  dpoEmail?: string;
}

export interface IncidentReportContext {
  incident: IncidentRecord;
  projectName: string;
  projectSlug: string;
  organizer: IncidentOrganizerSnapshot;
}

export interface IncidentRegistryEntry {
  incidentId: string;
  projectId: string;
  incidentDateTime: string;
  description: string;
  affectedCategories: string[];
  immediateActions: string;
  reporterName: string;
  dpoValidatorName: string;
  evaluatedAt?: string;
  dpoValidationReference: string;
  riskLevel?: IncidentRiskLevel;
  status: IncidentStatus;
  requiresNotification: boolean;
  notificationDeadline?: string;
  location: string;
}
