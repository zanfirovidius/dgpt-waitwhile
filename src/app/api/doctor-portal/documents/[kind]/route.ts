import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import {
  DOCTOR_DOCUMENTS_BUCKET_ID,
  deleteDoctorDocumentFile,
  ensureDoctorBuckets,
  ensureDoctorsSchema,
  getDoctor,
  saveDoctorDocumentFile,
  writeDoctorAuditLog,
} from '@/lib/doctors-server';
import {
  DOCTOR_PORTAL_COOKIE,
  verifyDoctorPortalToken,
} from '@/lib/doctor-portal-auth';
import { validateDoctorDocumentFile } from '@/lib/doctor-utils';
import type { DoctorRecord } from '@/lib/doctor-types';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const DOCTORS_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_DOCTORS_COLLECTION_ID || 'platform_doctors';

type RouteContext = {
  params: Promise<{
    kind: string;
  }>;
};

type DoctorDocumentKind = 'cv' | 'practice-license';

export async function GET(request: Request, context: RouteContext) {
  try {
    const { kind } = await context.params;
    const documentKind = normalizeDoctorDocumentKind(kind);
    const doctorId = await resolveDoctorIdFromRequest(request);

    const { storage, databases } = await createAdminClient();
    await ensureDoctorsSchema(databases);
    await ensureDoctorBuckets(storage);

    const doctor = await getDoctor(databases, doctorId);
    const fileId = getDoctorDocumentField(doctor, documentKind, 'fileId');
    if (!fileId) {
      return new Response('Document inexistent.', { status: 404 });
    }

    const file = await storage.getFile(DOCTOR_DOCUMENTS_BUCKET_ID, fileId);
    const fileView = await storage.getFileView(DOCTOR_DOCUMENTS_BUCKET_ID, fileId);

    return new Response(fileView, {
      headers: {
        'Content-Type': file.mimeType || 'application/pdf',
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': `inline; filename="${file.name}"`,
      },
    });
  } catch (error: unknown) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Nu am putut încărca documentul.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { kind } = await context.params;
    const documentKind = normalizeDoctorDocumentKind(kind);
    const access = await resolveDoctorAccess(request);
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return Response.json({ error: 'Nu a fost trimis niciun document.' }, { status: 400 });
    }

    validateDoctorDocumentFile(file);

    const { storage, databases } = await createAdminClient();
    await ensureDoctorsSchema(databases);
    await ensureDoctorBuckets(storage);

    const before = await getDoctor(databases, access.doctorId);
    const currentFileId = getDoctorDocumentField(before, documentKind, 'fileId');
    const uploadedAt = new Date().toISOString();

    const fileId = await saveDoctorDocumentFile(
      storage,
      access.doctorId,
      documentKind,
      file.name,
      Buffer.from(await file.arrayBuffer()),
    );

    if (currentFileId) {
      await deleteDoctorDocumentFile(storage, currentFileId);
    }

    const payload = buildDoctorDocumentUpdatePayload(documentKind, {
      fileId,
      fileName: file.name,
      uploadedAt,
      actorUserId: access.actorUserId,
    });

    const afterDoc = await databases.updateDocument(
      DATABASE_ID,
      DOCTORS_COLLECTION_ID,
      access.doctorId,
      payload,
    );

    await writeDoctorAuditLog({
      databases,
      entityId: access.doctorId,
      action: currentFileId ? `${documentKind}_replace` : `${documentKind}_upload`,
      actorUserId: access.actorUserId.slice(0, 50),
      before,
      after: afterDoc,
    });

    revalidateDoctorPortalPaths(access.doctorId);
    return Response.json({ success: true });
  } catch (error: unknown) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Documentul nu a putut fi încărcat.' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { kind } = await context.params;
    const documentKind = normalizeDoctorDocumentKind(kind);
    const access = await resolveDoctorAccess(request);

    const { storage, databases } = await createAdminClient();
    await ensureDoctorsSchema(databases);
    await ensureDoctorBuckets(storage);

    const before = await getDoctor(databases, access.doctorId);
    const fileId = getDoctorDocumentField(before, documentKind, 'fileId');
    await deleteDoctorDocumentFile(storage, fileId);

    const updatedAt = new Date().toISOString();
    const afterDoc = await databases.updateDocument(
      DATABASE_ID,
      DOCTORS_COLLECTION_ID,
      access.doctorId,
      buildDoctorDocumentUpdatePayload(documentKind, {
        fileId: '',
        fileName: '',
        uploadedAt: '',
        actorUserId: access.actorUserId,
        updatedAt,
      }),
    );

    await writeDoctorAuditLog({
      databases,
      entityId: access.doctorId,
      action: `${documentKind}_remove`,
      actorUserId: access.actorUserId.slice(0, 50),
      before,
      after: afterDoc,
    });

    revalidateDoctorPortalPaths(access.doctorId);
    return Response.json({ success: true });
  } catch (error: unknown) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Documentul nu a putut fi eliminat.' },
      { status: 500 },
    );
  }
}

async function resolveDoctorAccess(request: Request) {
  const portalDoctorId = await resolveDoctorIdFromPortalCookie();
  if (portalDoctorId) {
    return {
      doctorId: portalDoctorId,
      actorUserId: `doctor_portal:${portalDoctorId}`,
    };
  }

  const requestedDoctorId = new URL(request.url).searchParams.get('doctorId') || '';
  if (!requestedDoctorId) {
    throw new Error('Sesiunea portalului a expirat. Cere un cod nou.');
  }

  const { account } = await createSessionClient();
  const actor = await account.get();

  return {
    doctorId: requestedDoctorId,
    actorUserId: actor.$id,
  };
}

async function resolveDoctorIdFromRequest(request: Request) {
  const portalDoctorId = await resolveDoctorIdFromPortalCookie();
  if (portalDoctorId) {
    return portalDoctorId;
  }

  const requestedDoctorId = new URL(request.url).searchParams.get('doctorId') || '';
  if (!requestedDoctorId) {
    throw new Error('Acces interzis.');
  }

  const { account } = await createSessionClient();
  await account.get();
  return requestedDoctorId;
}

async function resolveDoctorIdFromPortalCookie() {
  const cookieStore = await cookies();
  const session = verifyDoctorPortalToken(cookieStore.get(DOCTOR_PORTAL_COOKIE)?.value);
  return session?.doctorId || '';
}

function normalizeDoctorDocumentKind(value: string): DoctorDocumentKind {
  if (value === 'cv' || value === 'practice-license') {
    return value;
  }

  throw new Error('Tip de document invalid.');
}

function getDoctorDocumentField(
  doctor: DoctorRecord,
  kind: DoctorDocumentKind,
  field: 'fileId' | 'fileName' | 'uploadedAt',
) {
  if (kind === 'cv') {
    if (field === 'fileId') return typeof doctor.cvFileId === 'string' ? doctor.cvFileId : '';
    if (field === 'fileName') return typeof doctor.cvFileName === 'string' ? doctor.cvFileName : '';
    return typeof doctor.cvUploadedAt === 'string' ? doctor.cvUploadedAt : '';
  }

  if (field === 'fileId') {
    return typeof doctor.practiceLicenseFileId === 'string' ? doctor.practiceLicenseFileId : '';
  }
  if (field === 'fileName') {
    return typeof doctor.practiceLicenseFileName === 'string' ? doctor.practiceLicenseFileName : '';
  }
  return typeof doctor.practiceLicenseUploadedAt === 'string' ? doctor.practiceLicenseUploadedAt : '';
}

function buildDoctorDocumentUpdatePayload(
  kind: DoctorDocumentKind,
  values: {
    fileId: string;
    fileName: string;
    uploadedAt: string;
    actorUserId: string;
    updatedAt?: string;
  },
) {
  const updatedAt = values.updatedAt || values.uploadedAt || new Date().toISOString();

  return kind === 'cv'
    ? {
        cvFileId: values.fileId,
        cvFileName: values.fileName,
        cvUploadedAt: values.uploadedAt,
        updatedAt,
        updatedByUserId: values.actorUserId,
      }
    : {
        practiceLicenseFileId: values.fileId,
        practiceLicenseFileName: values.fileName,
        practiceLicenseUploadedAt: values.uploadedAt,
        updatedAt,
        updatedByUserId: values.actorUserId,
      };
}

function revalidateDoctorPortalPaths(doctorId: string) {
  revalidatePath('/m');
  revalidatePath('/doctors');
  revalidatePath(`/doctors/${doctorId}`);
}
