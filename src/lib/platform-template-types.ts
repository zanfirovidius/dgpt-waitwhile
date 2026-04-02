export type PlatformTemplateCategory =
  | 'cabinet-placard-a4'
  | 'medical-document'
  | 'training-document'
  | 'contract'
  | 'general';

export type PlatformTemplateFileType = 'pptx' | 'docx' | 'xlsx' | 'pdf' | 'other';

export interface PlatformTemplateRecord {
  $id?: string;
  templateName: string;
  category: PlatformTemplateCategory | string;
  fileType: PlatformTemplateFileType | string;
  originalFileName: string;
  mimeType?: string;
  templateFileId: string;
  description?: string;
  placeholdersJson?: string;
  createdAt?: string;
  updatedAt?: string;
  createdByUserId?: string;
  updatedByUserId?: string;
  nameNormalized?: string;
  $createdAt?: string;
  $updatedAt?: string;
}

export interface PlatformTemplateCreateInput {
  templateName: string;
  category: PlatformTemplateCategory | string;
  fileType: PlatformTemplateFileType | string;
  originalFileName: string;
  mimeType?: string;
  templateFileId: string;
  description?: string;
  placeholdersJson?: string;
}

export const PLATFORM_TEMPLATE_CATEGORY_OPTIONS = [
  { value: 'cabinet-placard-a4', label: 'Planșe A4 cabinete' },
  { value: 'medical-document', label: 'Documente medicale' },
  { value: 'training-document', label: 'Documente training / instructaj' },
  { value: 'contract', label: 'Contracte și formulare' },
  { value: 'general', label: 'General' },
] as const;

export const PLATFORM_TEMPLATE_FILE_TYPE_OPTIONS = [
  { value: 'pptx', label: 'PPTX' },
  { value: 'docx', label: 'DOCX' },
  { value: 'xlsx', label: 'XLSX' },
  { value: 'pdf', label: 'PDF' },
  { value: 'other', label: 'Alt format' },
] as const;

export function getPlatformTemplateCategoryLabel(category?: string | null) {
  return (
    PLATFORM_TEMPLATE_CATEGORY_OPTIONS.find((option) => option.value === category)?.label ||
    category ||
    'Necategorizat'
  );
}

export function getPlatformTemplateFileTypeLabel(fileType?: string | null) {
  return (
    PLATFORM_TEMPLATE_FILE_TYPE_OPTIONS.find((option) => option.value === fileType)?.label ||
    (fileType || 'Alt format').toUpperCase()
  );
}
