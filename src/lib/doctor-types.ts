export type DoctorStatus = 'active' | 'inactive' | 'archived';

export interface DoctorRecord {
  $id?: string;
  fullName: string;
  professionalGrade: string;
  phone?: string;
  email?: string;
  cuim?: string;
  specialty?: string;
  notes?: string;
  status: DoctorStatus;
  profileImageFileId?: string;
  profileImageUrl?: string;
  profileImageUploadedAt?: string;
  cvFileId?: string;
  cvFileName?: string;
  cvUploadedAt?: string;
  practiceLicenseFileId?: string;
  practiceLicenseFileName?: string;
  practiceLicenseUploadedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  createdByUserId?: string;
  updatedByUserId?: string;
  fullNameNormalized?: string;
  emailNormalized?: string;
  phoneNormalized?: string;
  cuimNormalized?: string;
  $createdAt?: string;
  $updatedAt?: string;
}

export interface DoctorFormInput {
  fullName: string;
  professionalGrade: string;
  phone?: string;
  email?: string;
  cuim?: string;
  specialty?: string;
  notes?: string;
  status?: DoctorStatus;
}

export type DoctorDuplicateReason = 'cuim' | 'email' | 'phone' | 'fullName';
export type DoctorResolutionAction = 'skip' | 'update_existing' | 'overwrite_existing' | 'create_anyway';

export interface DoctorDuplicateMatch {
  doctorId: string;
  fullName: string;
  professionalGrade: string;
  phone?: string;
  email?: string;
  cuim?: string;
  status: DoctorStatus;
  profileImageUrl?: string;
  hasImage: boolean;
  matchReasons: DoctorDuplicateReason[];
  differingFields: string[];
  recommendedAction: Exclude<DoctorResolutionAction, 'create_anyway'>;
}

export interface DoctorConflictResolution {
  action: Exclude<DoctorResolutionAction, 'skip'>;
  targetDoctorId?: string;
}

export interface DoctorImportPreviewRow {
  rowNumber: number;
  data: DoctorFormInput;
  isValid: boolean;
  errors: string[];
  warnings: string[];
  matches: DoctorDuplicateMatch[];
  recommendedAction: DoctorResolutionAction;
  selectedAction?: DoctorResolutionAction;
  selectedMatchDoctorId?: string;
}

export interface DoctorImportResultRow {
  rowNumber: number;
  action: DoctorResolutionAction;
  outcome: 'created' | 'updated' | 'overwritten' | 'skipped' | 'failed';
  doctorId?: string;
  message: string;
  doctorName: string;
}

export interface DoctorImportSummary {
  totalRows: number;
  imported: number;
  updated: number;
  overwritten: number;
  skipped: number;
  failed: number;
  results: DoctorImportResultRow[];
}

export interface DoctorAuditLog {
  $id?: string;
  entityType: string;
  entityId: string;
  action: string;
  actorUserId: string;
  beforeJson?: string;
  afterJson?: string;
  $createdAt?: string;
}

export type DoctorPortalChannel = 'email' | 'sms';

export type DoctorPortalProjectAssignment = {
  assignmentId: string;
  assignmentDate: string;
  startTime: string;
  endTime: string;
  cabinetId?: string;
  cabinetName: string;
  cabinetIdentifier?: string;
  cabinetSpecialty?: string;
};

export type DoctorPortalProject = {
  projectId: string;
  name: string;
  eventName?: string;
  projectSlug?: string;
  locationName?: string;
  city?: string;
  venue?: string;
  startDate?: string;
  endDate?: string;
  assignments: DoctorPortalProjectAssignment[];
};
