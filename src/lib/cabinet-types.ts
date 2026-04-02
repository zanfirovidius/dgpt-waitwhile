export type CabinetAssigneeType = 'doctor' | 'responsible' | 'unassigned';
export type CabinetPrintTemplateScope = 'project' | 'platform';

export interface CabinetMaterialItem {
  id: string;
  label: string;
  checked: boolean;
}

export interface ProjectCabinet {
  $id?: string;
  projectId: string;
  name: string;
  identifier: string;
  specialty?: string;
  ultrasoundAvailable: boolean;
  materialsJson?: string;
  materials?: CabinetMaterialItem[];
  defaultAssigneeType: CabinetAssigneeType;
  defaultDoctorId?: string;
  defaultDoctorName?: string;
  defaultResponsibleName?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  createdByUserId?: string;
  updatedByUserId?: string;
  nameNormalized?: string;
  identifierNormalized?: string;
  $createdAt?: string;
  $updatedAt?: string;
}

export interface ProjectCabinetAssignment {
  $id?: string;
  projectId: string;
  cabinetId: string;
  cabinetName: string;
  cabinetIdentifier: string;
  cabinetSpecialty?: string;
  materialsJson?: string;
  materials?: CabinetMaterialItem[];
  assignmentDate: string;
  startTime: string;
  endTime: string;
  slotKey: string;
  assigneeType: CabinetAssigneeType;
  doctorId?: string;
  doctorName?: string;
  responsibleName?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  createdByUserId?: string;
  updatedByUserId?: string;
  $createdAt?: string;
  $updatedAt?: string;
}

export interface CabinetFormInput {
  projectId: string;
  name: string;
  identifier: string;
  specialty?: string;
  ultrasoundAvailable?: boolean;
  materials?: CabinetMaterialItem[];
  defaultAssigneeType?: CabinetAssigneeType;
  defaultDoctorId?: string;
  defaultResponsibleName?: string;
  notes?: string;
}

export interface CabinetAssignmentFormInput {
  projectId: string;
  cabinetId: string;
  cabinetSpecialty?: string;
  materials?: CabinetMaterialItem[];
  assignmentDate: string;
  startTime: string;
  endTime: string;
  assigneeType?: CabinetAssigneeType;
  doctorId?: string;
  responsibleName?: string;
  notes?: string;
}

export interface CabinetPrintTemplateRecord {
  $id?: string;
  scopeType: CabinetPrintTemplateScope;
  projectId?: string;
  libraryTemplateId?: string;
  templateName: string;
  templateFileId: string;
  originalFileName: string;
  placeholdersJson?: string;
  createdAt?: string;
  updatedAt?: string;
  createdByUserId?: string;
  updatedByUserId?: string;
  $createdAt?: string;
  $updatedAt?: string;
}

export interface CabinetDailyPacket {
  assignmentId: string;
  projectId: string;
  assignmentDate: string;
  startTime: string;
  endTime: string;
  intervalLabel: string;
  cabinetId: string;
  cabinetName: string;
  cabinetIdentifier: string;
  cabinetLabel: string;
  specialty?: string;
  ultrasoundAvailable: boolean;
  assigneeType: CabinetAssigneeType;
  assigneeName: string;
  assigneeDisplayName: string;
  notes?: string;
  materials: CabinetMaterialItem[];
  readyMaterialsCount: number;
  totalMaterialsCount: number;
}
