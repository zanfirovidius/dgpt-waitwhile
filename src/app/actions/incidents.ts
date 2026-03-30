'use server';

import { addHours } from 'date-fns';
import { ID } from 'node-appwrite';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createSessionClient } from '@/lib/appwrite-server';
import { generateIncidentReportPdf } from '@/lib/incident-report';
import {
  INCIDENT_ARCHIVES_BUCKET_ID,
  INCIDENTS_COLLECTION_ID,
  buildIncidentAdminUrl,
  buildIncidentArchiveFileName,
  deleteFileIfExists,
  ensureIncidentBuckets,
  ensureIncidentSchema,
  listIncidentAuditLogs,
  listProjectIncidents,
  loadIncidentReportContext,
  normalizeAffectedCategories,
  normalizeDataTypes,
  normalizeIncidentStatus,
  normalizeIncidentType,
  normalizeRiskLevel,
  notifyDpoOfIncident,
  readOrganizerSnapshot,
  readProjectIncidentSnapshot,
  readPublicIncidentProjectContext,
  sanitizeAffectedCount,
  sanitizeIncidentLongText,
  sanitizeIncidentText,
  saveIncidentArchivePdf,
  writeIncidentAuditLog,
} from '@/lib/incident-server';
import type { IncidentAuditLog, IncidentRecord, IncidentRegistryEntry } from '@/lib/incident-types';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

type PublicIncidentContext = {
  project: {
    $id: string;
    name?: string;
    eventName?: string;
    projectSlug?: string;
    locationName?: string;
    city?: string;
    venue?: string;
  };
  organizer: {
    dpoName?: string;
    dpoEmail?: string;
  };
};

export async function getPublicIncidentReportingContext(
  projectSlug: string,
): Promise<ActionResult<PublicIncidentContext>> {
  try {
    const { project, organizer } = await readPublicIncidentProjectContext(projectSlug);
    return {
      success: true,
      data: {
        project,
        organizer: {
          dpoName: organizer.dpoName,
          dpoEmail: organizer.dpoEmail,
        },
      },
    };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Nu am putut încărca formularul de incident.') };
  }
}

export async function createIncidentReport(data: {
  projectSlug: string;
  discoveredAt: string;
  location?: string;
  reporterName?: string;
  reporterRole?: string;
  reporterContact?: string;
  incidentType: string;
  description: string;
  affectedCategories?: string[];
  affectedCount?: number | string;
  dataTypes?: string[];
  immediateActions?: string;
  website?: string;
}): Promise<ActionResult<IncidentRecord>> {
  try {
    if (sanitizeIncidentText(data.website)) {
      throw new Error('Formular invalid.');
    }

    const discoveredAt = sanitizeIncidentText(data.discoveredAt);
    if (!discoveredAt) {
      throw new Error('Data și ora descoperirii sunt obligatorii.');
    }

    const description = sanitizeIncidentLongText(data.description);
    if (!description) {
      throw new Error('Descrierea incidentului este obligatorie.');
    }

    const { databases, users, messaging } = await createAdminClient();
    await ensureIncidentSchema(databases);

    const { project, organizer } = await readPublicIncidentProjectContext(data.projectSlug);
    const reportedAt = new Date().toISOString();
    const location =
      sanitizeIncidentText(data.location) ||
      [project.city, project.venue].filter(Boolean).join(', ') ||
      project.locationName ||
      'Locație nespecificată';

    const incidentPayload: Omit<IncidentRecord, '$id'> = {
      projectId: project.$id,
      projectSlugSnapshot: project.projectSlug || data.projectSlug,
      eventName: project.eventName || project.name || 'Incident GDPR / securitate',
      location,
      reportedAt,
      discoveredAt,
      reporterName: sanitizeIncidentText(data.reporterName),
      reporterRole: sanitizeIncidentText(data.reporterRole),
      reporterContact: sanitizeIncidentText(data.reporterContact),
      incidentType: normalizeIncidentType(data.incidentType),
      description,
      affectedCategories: normalizeAffectedCategories(data.affectedCategories),
      affectedCount: sanitizeAffectedCount(data.affectedCount),
      dataTypes: normalizeDataTypes(data.dataTypes),
      immediateActions: sanitizeIncidentLongText(data.immediateActions),
      status: 'new',
      dpoNameSnapshot: sanitizeIncidentText(organizer.dpoName),
      dpoEmailSnapshot: sanitizeIncidentText(organizer.dpoEmail)?.toLowerCase(),
      notificationStatus: 'pending',
      requiresNotification: false,
    };

    const created = await databases.createDocument(
      DATABASE_ID,
      INCIDENTS_COLLECTION_ID,
      ID.unique(),
      incidentPayload,
    );

    const incident = JSON.parse(JSON.stringify(created)) as IncidentRecord;
    await writeIncidentAuditLog({
      databases,
      entityId: incident.$id!,
      action: 'create_public_report',
      actorUserId: 'public_reporter',
      after: incident,
    });

    const notificationResult = await notifyDpoOfIncident({
      users,
      messaging,
      incident,
      incidentUrl: buildIncidentAdminUrl(project.$id, incident.$id!),
    });

    const updated = await databases.updateDocument(DATABASE_ID, INCIDENTS_COLLECTION_ID, incident.$id!, {
      notificationStatus: notificationResult.status,
      notificationSentAt: notificationResult.sentAt || null,
      notificationError: notificationResult.error || null,
      notificationMessageId: notificationResult.messageId || null,
    });

    await writeIncidentAuditLog({
      databases,
      entityId: incident.$id!,
      action: 'notify_dpo',
      actorUserId: 'system',
      before: incident,
      after: {
        notificationStatus: notificationResult.status,
        notificationSentAt: notificationResult.sentAt || null,
        notificationError: notificationResult.error || null,
        notificationMessageId: notificationResult.messageId || null,
      },
    });

    revalidateIncidentPaths(project.$id, project.projectSlug);

    return {
      success: true,
      data: JSON.parse(JSON.stringify(updated)) as IncidentRecord,
    };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Nu am putut salva incidentul.') };
  }
}

export async function getProjectIncidents(projectId: string): Promise<ActionResult<IncidentRecord[]>> {
  try {
    const { databases } = await createSessionClient();
    const admin = await createAdminClient();
    await ensureIncidentSchema(admin.databases);
    const incidents = await listProjectIncidents(databases, projectId);
    return { success: true, data: incidents };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Nu am putut încărca registrul de incidente.') };
  }
}

export async function getIncidentRegistryEntries(
  projectId: string,
): Promise<ActionResult<IncidentRegistryEntry[]>> {
  try {
    const { databases } = await createSessionClient();
    const admin = await createAdminClient();
    await ensureIncidentSchema(admin.databases);

    const incidents = await listProjectIncidents(databases, projectId);
    const evaluatorIds = [...new Set(
      incidents
        .map((incident) => incident.evaluatedByUserId)
        .filter((value): value is string => Boolean(value)),
    )];

    const evaluatorEntries = await Promise.all(
      evaluatorIds.map(async (userId) => {
        try {
          const user = await admin.users.get(userId);
          return [userId, user.name || user.email || userId] as const;
        } catch {
          return [userId, userId] as const;
        }
      }),
    );

    const evaluatorNames = new Map<string, string>(evaluatorEntries);
    const registryEntries = incidents.map((incident) =>
      buildIncidentRegistryEntry(incident, evaluatorNames.get(incident.evaluatedByUserId || '')),
    );

    return { success: true, data: registryEntries };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Nu am putut încărca registrul oficial de incidente.') };
  }
}

export async function getIncidentById(incidentId: string): Promise<ActionResult<IncidentRecord>> {
  try {
    const { databases } = await createSessionClient();
    const incident = await databases.getDocument(DATABASE_ID, INCIDENTS_COLLECTION_ID, incidentId);
    return { success: true, data: JSON.parse(JSON.stringify(incident)) as IncidentRecord };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Nu am putut încărca incidentul.') };
  }
}

export async function getIncidentAuditTrail(
  incidentId: string,
): Promise<ActionResult<IncidentAuditLog[]>> {
  try {
    const { databases } = await createSessionClient();
    const auditLogs = await listIncidentAuditLogs(databases, incidentId);
    return { success: true, data: auditLogs };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Nu am putut încărca audit trail-ul incidentului.') };
  }
}

export async function updateIncidentRecord(
  incidentId: string,
  data: Partial<IncidentRecord>,
): Promise<ActionResult<IncidentRecord>> {
  try {
    const { databases, account } = await createSessionClient();
    const admin = await createAdminClient();
    await ensureIncidentSchema(admin.databases);
    await ensureIncidentBuckets(admin.storage);

    const [incidentDoc, actor] = await Promise.all([
      databases.getDocument(DATABASE_ID, INCIDENTS_COLLECTION_ID, incidentId),
      account.get(),
    ]);

    const existing = JSON.parse(JSON.stringify(incidentDoc)) as IncidentRecord;
    if (existing.status === 'archived') {
      return { success: false, error: 'Incidentul este arhivat și nu mai poate fi modificat.' };
    }

    const nextStatus =
      data.status !== undefined ? normalizeIncidentStatus(data.status) : existing.status;

    if (!isValidIncidentStatusTransition(existing.status, nextStatus)) {
      return {
        success: false,
        error: `Tranziția de status ${existing.status} → ${nextStatus} nu este permisă.`,
      };
    }

    const updatePayload: Record<string, unknown> = {};

    if (data.location !== undefined) {
      updatePayload.location = sanitizeIncidentText(data.location);
    }
    if (data.reporterName !== undefined) {
      updatePayload.reporterName = sanitizeIncidentText(data.reporterName);
    }
    if (data.reporterRole !== undefined) {
      updatePayload.reporterRole = sanitizeIncidentText(data.reporterRole);
    }
    if (data.reporterContact !== undefined) {
      updatePayload.reporterContact = sanitizeIncidentText(data.reporterContact);
    }
    if (data.incidentType !== undefined) {
      updatePayload.incidentType = normalizeIncidentType(data.incidentType);
    }
    if (data.description !== undefined) {
      const description = sanitizeIncidentLongText(data.description);
      if (!description) {
        return { success: false, error: 'Descrierea incidentului este obligatorie.' };
      }
      updatePayload.description = description;
    }
    if (data.discoveredAt !== undefined) {
      const discoveredAt = sanitizeIncidentText(data.discoveredAt);
      if (!discoveredAt) {
        return { success: false, error: 'Data și ora descoperirii sunt obligatorii.' };
      }
      updatePayload.discoveredAt = discoveredAt;
    }
    if (data.affectedCategories !== undefined) {
      updatePayload.affectedCategories = normalizeAffectedCategories(data.affectedCategories);
    }
    if (data.affectedCount !== undefined) {
      updatePayload.affectedCount = sanitizeAffectedCount(data.affectedCount);
    }
    if (data.dataTypes !== undefined) {
      updatePayload.dataTypes = normalizeDataTypes(data.dataTypes);
    }
    if (data.immediateActions !== undefined) {
      updatePayload.immediateActions = sanitizeIncidentLongText(data.immediateActions);
    }
    if (data.status !== undefined) {
      updatePayload.status = nextStatus;
    }
    if (data.riskLevel !== undefined) {
      updatePayload.riskLevel = normalizeRiskLevel(data.riskLevel) || null;
    }
    if (data.requiresNotification !== undefined) {
      updatePayload.requiresNotification = Boolean(data.requiresNotification);
    }
    if (data.notificationDeadline !== undefined) {
      updatePayload.notificationDeadline = sanitizeIncidentText(data.notificationDeadline) || null;
    }
    if (data.dpoNotes !== undefined) {
      updatePayload.dpoNotes = sanitizeIncidentLongText(data.dpoNotes);
    }
    if (data.authorityNotifiedAt !== undefined) {
      updatePayload.authorityNotifiedAt = sanitizeIncidentText(data.authorityNotifiedAt) || null;
    }
    if (data.authorityNotificationReference !== undefined) {
      updatePayload.authorityNotificationReference =
        sanitizeIncidentText(data.authorityNotificationReference) || null;
    }

    const evaluationTouched =
      data.riskLevel !== undefined ||
      data.requiresNotification !== undefined ||
      data.notificationDeadline !== undefined ||
      data.dpoNotes !== undefined ||
      data.status !== undefined ||
      data.authorityNotifiedAt !== undefined ||
      data.authorityNotificationReference !== undefined;

    if (evaluationTouched) {
      updatePayload.evaluatedAt = new Date().toISOString();
      updatePayload.evaluatedByUserId = actor.$id;
    }

    const requiresNotification =
      (updatePayload.requiresNotification as boolean | undefined) ?? existing.requiresNotification;
    const nextDiscoveredAt =
      (updatePayload.discoveredAt as string | undefined) ?? existing.discoveredAt;

    if (requiresNotification && !updatePayload.notificationDeadline && !existing.notificationDeadline) {
      updatePayload.notificationDeadline = addHours(new Date(nextDiscoveredAt || existing.reportedAt), 72).toISOString();
    }

    const nextIncident = {
      ...existing,
      ...updatePayload,
      $id: existing.$id,
      $createdAt: existing.$createdAt,
      $updatedAt: existing.$updatedAt,
    } as IncidentRecord;

    if (nextStatus === 'archived') {
      const [project, organizer] = await Promise.all([
        readProjectIncidentSnapshot(admin.databases, existing.projectId),
        readOrganizerSnapshot(admin.databases, existing.projectId),
      ]);

      const archivedAt = new Date().toISOString();
      const reportContext = {
        incident: {
          ...nextIncident,
          status: 'archived' as const,
          archivedAt,
        },
        projectName: project.eventName || project.name || nextIncident.eventName,
        projectSlug: project.projectSlug || nextIncident.projectSlugSnapshot || '',
        organizer,
      };

      const pdfBuffer = generateIncidentReportPdf(reportContext);
      const archiveFileName = buildIncidentArchiveFileName(
        reportContext.incident.location,
        reportContext.incident.discoveredAt || reportContext.incident.reportedAt,
        existing.$id,
      );
      const archiveFileId = await saveIncidentArchivePdf(admin.storage, pdfBuffer, archiveFileName);

      await deleteFileIfExists(admin.storage, INCIDENT_ARCHIVES_BUCKET_ID, existing.archivedPdfFileId);

      updatePayload.archivedAt = archivedAt;
      updatePayload.archivedPdfFileId = archiveFileId;
      updatePayload.archivedFileName = archiveFileName;
      updatePayload.status = 'archived';
    }

    const updated = await databases.updateDocument(
      DATABASE_ID,
      INCIDENTS_COLLECTION_ID,
      incidentId,
      updatePayload,
    );

    const incident = JSON.parse(JSON.stringify(updated)) as IncidentRecord;
    await writeIncidentAuditLog({
      databases: admin.databases,
      entityId: incidentId,
      action: 'update_dpo_evaluation',
      actorUserId: actor.$id,
      before: existing,
      after: incident,
    });

    revalidateIncidentPaths(existing.projectId, existing.projectSlugSnapshot);

    return { success: true, data: incident };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Nu am putut actualiza incidentul.') };
  }
}

export async function getIncidentReportPreviewInfo(
  incidentId: string,
): Promise<ActionResult<{ incident: IncidentRecord; fileName: string }>> {
  try {
    const { databases } = await createSessionClient();
    const incidentDoc = await databases.getDocument(DATABASE_ID, INCIDENTS_COLLECTION_ID, incidentId);
    const incident = JSON.parse(JSON.stringify(incidentDoc)) as IncidentRecord;

    return {
      success: true,
      data: {
        incident,
        fileName:
          incident.archivedFileName ||
          buildIncidentArchiveFileName(incident.location, incident.discoveredAt || incident.reportedAt, incident.$id),
      },
    };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Nu am putut pregăti exportul PDF.') };
  }
}

export async function archiveIncidentRecord(
  incidentId: string,
): Promise<ActionResult<IncidentRecord>> {
  return updateIncidentRecord(incidentId, { status: 'archived' });
}

export async function getIncidentReportContextForApi(
  incidentId: string,
): Promise<ActionResult<ReturnType<typeof loadIncidentReportContext> extends Promise<infer T> ? T : never>> {
  try {
    const context = await loadIncidentReportContext(incidentId);
    return { success: true, data: context };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, 'Nu am putut încărca raportul PDF.') };
  }
}

function revalidateIncidentPaths(projectId: string, projectSlug?: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/incidents`);
  revalidatePath(`/projects/${projectId}/incident-registry`);
  if (projectSlug) {
    revalidatePath(`/i/${projectSlug}/incident`);
  }
}

function buildIncidentRegistryEntry(
  incident: IncidentRecord,
  evaluatorName?: string,
): IncidentRegistryEntry {
  const dpoValidatorName =
    evaluatorName ||
    incident.dpoNameSnapshot ||
    incident.evaluatedByUserId ||
    '';
  const dpoValidationReference = dpoValidatorName
    ? `${dpoValidatorName}${incident.evaluatedAt ? ` · ${incident.evaluatedAt}` : ''}`
    : incident.evaluatedAt || '';

  return {
    incidentId: incident.$id || '',
    projectId: incident.projectId,
    incidentDateTime: incident.discoveredAt || incident.reportedAt,
    description: incident.description || '',
    affectedCategories: incident.affectedCategories || [],
    immediateActions: incident.immediateActions || '',
    reporterName: incident.reporterName || '',
    dpoValidatorName,
    evaluatedAt: incident.evaluatedAt,
    dpoValidationReference,
    riskLevel: incident.riskLevel,
    status: incident.status,
    requiresNotification: Boolean(incident.requiresNotification),
    notificationDeadline: incident.notificationDeadline,
    location: incident.location || '',
  };
}

function isValidIncidentStatusTransition(current: string, next: string) {
  if (current === next) {
    return true;
  }

  const transitions: Record<string, string[]> = {
    new: ['in_review'],
    in_review: ['resolved', 'archived'],
    resolved: ['archived'],
    archived: [],
  };

  return transitions[current]?.includes(next) ?? false;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: string }).message;
    if (message) {
      return message;
    }
  }

  return fallback;
}
