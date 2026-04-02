import { revalidatePath } from 'next/cache';
import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import {
  DOCTOR_IMAGES_BUCKET_ID,
  deleteDoctorImageFile,
  ensureDoctorBuckets,
  ensureDoctorsSchema,
  getDoctor,
  saveDoctorImage,
  validateDoctorImageFile,
  writeDoctorAuditLog,
} from '@/lib/doctors-server';
import { buildDoctorImageUrl } from '@/lib/doctor-utils';

type RouteContext = {
  params: Promise<{
    doctorId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireSession();

    const { doctorId } = await context.params;
    const { storage, databases } = await createAdminClient();
    await ensureDoctorsSchema(databases);
    await ensureDoctorBuckets(storage);

    const doctor = await getDoctor(databases, doctorId);
    if (!doctor.profileImageFileId) {
      return new Response('Imagine inexistentă.', { status: 404 });
    }

    const file = await storage.getFile(DOCTOR_IMAGES_BUCKET_ID, doctor.profileImageFileId);
    const fileView = await storage.getFileView(DOCTOR_IMAGES_BUCKET_ID, doctor.profileImageFileId);

    return new Response(fileView, {
      headers: {
        'Content-Type': file.mimeType || 'image/jpeg',
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': `inline; filename="${file.name}"`,
      },
    });
  } catch (error: unknown) {
    return new Response(
      error instanceof Error ? error.message : 'Nu am putut încărca imaginea medicului.',
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const actor = await requireSession();
    const { doctorId } = await context.params;
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return Response.json({ error: 'Nu a fost trimisă nicio imagine.' }, { status: 400 });
    }

    validateDoctorImageFile(file);

    const { storage, databases } = await createAdminClient();
    await ensureDoctorsSchema(databases);
    await ensureDoctorBuckets(storage);

    const before = await getDoctor(databases, doctorId);
    const fileId = await saveDoctorImage(
      storage,
      doctorId,
      file.name,
      file.type,
      Buffer.from(await file.arrayBuffer()),
    );

    if (before.profileImageFileId) {
      await deleteDoctorImageFile(storage, before.profileImageFileId);
    }

    const uploadedAt = new Date().toISOString();
    const afterDoc = await databases.updateDocument(
      process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
      DOCTORS_COLLECTION_ID,
      doctorId,
      {
        profileImageFileId: fileId,
        profileImageUploadedAt: uploadedAt,
        profileImageUrl: buildDoctorImageUrl(doctorId, uploadedAt),
        updatedAt: uploadedAt,
        updatedByUserId: actor.$id,
      },
    );

    await writeDoctorAuditLog({
      databases,
      entityId: doctorId,
      action: before.profileImageFileId ? 'image_replace' : 'image_upload',
      actorUserId: actor.$id,
      before,
      after: afterDoc,
    });

    revalidateDoctorPaths(doctorId);
    return Response.json({ success: true });
  } catch (error: unknown) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Imaginea nu a putut fi încărcată.' },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const actor = await requireSession();
    const { doctorId } = await context.params;
    const { storage, databases } = await createAdminClient();
    await ensureDoctorsSchema(databases);
    await ensureDoctorBuckets(storage);

    const before = await getDoctor(databases, doctorId);
    await deleteDoctorImageFile(storage, before.profileImageFileId);

    const updatedAt = new Date().toISOString();
    const afterDoc = await databases.updateDocument(
      process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
      DOCTORS_COLLECTION_ID,
      doctorId,
      {
        profileImageFileId: '',
        profileImageUrl: '',
        profileImageUploadedAt: '',
        updatedAt,
        updatedByUserId: actor.$id,
      },
    );

    await writeDoctorAuditLog({
      databases,
      entityId: doctorId,
      action: 'image_remove',
      actorUserId: actor.$id,
      before,
      after: afterDoc,
    });

    revalidateDoctorPaths(doctorId);
    return Response.json({ success: true });
  } catch (error: unknown) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Imaginea nu a putut fi eliminată.' },
      { status: 500 },
    );
  }
}

async function requireSession() {
  const { account } = await createSessionClient();
  return account.get();
}

function revalidateDoctorPaths(doctorId: string) {
  revalidatePath('/doctors');
  revalidatePath(`/doctors/${doctorId}`);
}

const DOCTORS_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_DOCTORS_COLLECTION_ID || 'platform_doctors';
