export const INCIDENT_TYPE_OPTIONS = [
  'Loss/Theft of documents',
  'Unauthorized access',
  'Accidental disclosure',
  'Cyber attack',
] as const;

export const INCIDENT_AFFECTED_CATEGORY_OPTIONS = [
  'patients',
  'volunteers',
  'staff',
] as const;

export const INCIDENT_DATA_TYPE_OPTIONS = [
  'identification',
  'medical',
  'contact',
] as const;

export const INCIDENT_STATUS_OPTIONS = [
  'new',
  'in_review',
  'resolved',
  'archived',
] as const;

export const INCIDENT_RISK_LEVEL_OPTIONS = [
  'low',
  'medium',
  'high',
] as const;

export const INCIDENT_FORM_INTRO =
  'Raportați imediat orice incident de securitate sau protecția datelor. Formularul creează o fișă oficială de incident și notifică responsabilul GDPR.';

export const INCIDENT_NOTIFICATION_SUBJECT_PREFIX = '[DGPT] Incident GDPR / securitate';
