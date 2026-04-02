import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Query } from 'node-appwrite';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Databases, Storage } from 'node-appwrite';
import type { CabinetDailyPacket } from '@/lib/cabinet-types';
import {
  PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID,
  PROJECT_CABINETS_COLLECTION_ID,
} from '@/lib/cabinets-server';
import {
  getCabinetPrintTemplateFileBuffer,
  getResolvedCabinetPrintTemplate,
  resolveCabinetPrintTemplateLibraryReference,
} from '@/lib/cabinets-server';
import { buildCabinetDailyPackets, buildCabinetTemplatePlaceholders } from '@/lib/cabinet-print-utils';
import { getDoctor } from '@/lib/doctors-server';
import type { DoctorRecord } from '@/lib/doctor-types';
import { getPlatformTemplateFileBuffer } from '@/lib/platform-templates-server';

type ProjectSummary = {
  $id: string;
  name: string;
  eventName?: string;
  city?: string;
  locationName?: string;
  venue?: string;
};

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const PROJECTS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID!;
const DEFAULT_CABINET_TEMPLATE_PATH = path.join(process.cwd(), 'default-assets', 'plansa.pptx');
const CABINET_TEMPLATE_MAX_BYTES = 10 * 1024 * 1024;
const CABINET_TEMPLATE_ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

export async function getCabinetDailyPlanContext(
  databases: Databases,
  projectId: string,
  assignmentDate: string,
) {
  const [projectDoc, cabinetsRes, assignmentsRes] = await Promise.all([
    databases.getDocument(DATABASE_ID, PROJECTS_COLLECTION_ID, projectId),
    databases.listDocuments(DATABASE_ID, PROJECT_CABINETS_COLLECTION_ID, [
      Query.equal('projectId', projectId),
      Query.orderAsc('identifierNormalized'),
      Query.orderAsc('nameNormalized'),
      Query.limit(500),
    ]),
    databases.listDocuments(DATABASE_ID, PROJECT_CABINET_ASSIGNMENTS_COLLECTION_ID, [
      Query.equal('projectId', projectId),
      Query.equal('assignmentDate', assignmentDate),
      Query.orderAsc('startTime'),
      Query.orderAsc('cabinetIdentifier'),
      Query.limit(500),
    ]),
  ]);

  const project = JSON.parse(JSON.stringify(projectDoc)) as ProjectSummary;
  const cabinets = JSON.parse(JSON.stringify(cabinetsRes.documents)) as Array<{
    $id: string;
    name: string;
    identifier: string;
    specialty?: string;
    ultrasoundAvailable?: boolean;
    materialsJson?: string;
    notes?: string;
  }>;
  const assignments = JSON.parse(JSON.stringify(assignmentsRes.documents)) as Array<{
    $id: string;
    projectId: string;
    cabinetId: string;
    cabinetName: string;
    cabinetIdentifier: string;
    cabinetSpecialty?: string;
    materialsJson?: string;
    assignmentDate: string;
    startTime: string;
    endTime: string;
    assigneeType: 'doctor' | 'responsible' | 'unassigned';
    doctorId?: string;
    doctorName?: string;
    responsibleName?: string;
    notes?: string;
  }>;

  const doctorIds = [...new Set(assignments.map((assignment) => assignment.doctorId).filter(Boolean))] as string[];
  const doctors = await Promise.all(
    doctorIds.map(async (doctorId) => {
      try {
        return await getDoctor(databases, doctorId);
      } catch {
        return null;
      }
    }),
  );

  const hydratedCabinets = cabinets.map((cabinet) => ({
    ...cabinet,
    projectId,
    materials: parseCabinetMaterials(cabinet.materialsJson),
    ultrasoundAvailable: Boolean(cabinet.ultrasoundAvailable),
    defaultAssigneeType: 'unassigned' as const,
  }));

  const packets = buildCabinetDailyPackets({
    cabinets: hydratedCabinets,
    assignments: assignments.map((assignment) => ({
      ...assignment,
      materials: parseCabinetMaterials(assignment.materialsJson),
      assigneeType: assignment.assigneeType,
      slotKey: `${assignment.assignmentDate}|${assignment.startTime}|${assignment.endTime}`,
    })),
    doctors: doctors.filter(Boolean) as DoctorRecord[],
  });

  return {
    project,
    packets,
  };
}

export async function resolveCabinetPlacardTemplate(
  databases: Databases,
  storage: Storage,
  projectId: string,
) {
  const templateState = await getResolvedCabinetPrintTemplate(databases, projectId);
  const libraryTemplate = await resolveCabinetPrintTemplateLibraryReference(databases, templateState.activeTemplate);

  if (libraryTemplate?.templateFileId) {
    return {
      source: templateState.activeSource,
      templateName: libraryTemplate.templateName,
      fileName: libraryTemplate.originalFileName || 'cabinet-template.pptx',
      buffer: await getPlatformTemplateFileBuffer(storage, libraryTemplate.templateFileId),
    } as const;
  }

  if (templateState.activeTemplate?.templateFileId) {
    return {
      source: templateState.activeSource,
      templateName: templateState.activeTemplate.templateName,
      fileName: templateState.activeTemplate.originalFileName || 'cabinet-template.pptx',
      buffer: await getCabinetPrintTemplateFileBuffer(storage, templateState.activeTemplate.templateFileId),
    } as const;
  }

  return {
    source: 'bundled',
    templateName: 'Template inclus',
    fileName: 'plansa.pptx',
    buffer: await readFile(DEFAULT_CABINET_TEMPLATE_PATH),
  } as const;
}

export async function buildCabinetPlacardDocument(args: {
  templateBuffer: Buffer;
  packet: CabinetDailyPacket;
  project: ProjectSummary;
}) {
  const archive = unzipSync(new Uint8Array(args.templateBuffer));
  const placeholders = buildCabinetTemplatePlaceholders(args.packet, args.project);

  for (const [fileName, content] of Object.entries(archive)) {
    if (!fileName.startsWith('ppt/slides/slide') || !fileName.endsWith('.xml')) {
      continue;
    }

    let xml = strFromU8(content);
    xml = xml.replace(/<a:noAutofit\/>/g, '<a:spAutoFit/>');
    xml = applySizedPlaceholder(xml, 'name', placeholders.name, getAdaptiveFontSize(placeholders.name, 8000, 3600, 22, 56));
    xml = applySizedPlaceholder(
      xml,
      'cabinet',
      placeholders.cabinet,
      getAdaptiveFontSize(placeholders.cabinet, 9600, 4200, 18, 42),
    );

    for (const [key, value] of Object.entries(placeholders)) {
      xml = xml.replace(new RegExp(escapeRegExp(`{{${key}}}`), 'g'), escapeXml(value));
    }

    archive[fileName] = strToU8(xml);
  }

  return Buffer.from(zipSync(archive, { level: 0 }));
}

export function validateCabinetPrintTemplateFile(file: File) {
  if (!file || file.size === 0) {
    throw new Error('Selectează un fișier PPTX valid.');
  }

  if (file.size > CABINET_TEMPLATE_MAX_BYTES) {
    throw new Error('Template-ul este prea mare. Maxim 10 MB.');
  }

  const hasValidMime = CABINET_TEMPLATE_ALLOWED_MIME_TYPES.includes(
    file.type as (typeof CABINET_TEMPLATE_ALLOWED_MIME_TYPES)[number],
  );
  const hasValidExtension = file.name.toLowerCase().endsWith('.pptx');

  if (!hasValidMime && !hasValidExtension) {
    throw new Error('Format invalid. Sunt acceptate doar fișiere .pptx.');
  }
}

function parseCabinetMaterials(value?: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getAdaptiveFontSize(
  value: string,
  baseSize: number,
  minSize: number,
  softLimit: number,
  hardLimit: number,
) {
  const length = [...value.trim()].length;
  if (!length || length <= softLimit) {
    return baseSize;
  }

  if (length >= hardLimit) {
    return minSize;
  }

  const ratio = (length - softLimit) / (hardLimit - softLimit);
  return Math.round(baseSize - (baseSize - minSize) * ratio);
}

function applySizedPlaceholder(xml: string, placeholder: string, value: string, fontSize: number) {
  const token = `{{${placeholder}}}`;
  const escapedValue = escapeXml(value);
  const pattern = new RegExp(
    `(<a:rPr\\b[^>]*\\bsz=\")\\d+(\"[^>]*>[\\s\\S]*?<\\/a:rPr>\\s*<a:t>)${escapeRegExp(token)}(<\\/a:t>)`,
    'g',
  );

  const sized = xml.replace(pattern, (_match, start, middle, end) => `${start}${fontSize}${middle}${escapedValue}${end}`);
  return sized.replace(new RegExp(escapeRegExp(token), 'g'), escapedValue);
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
