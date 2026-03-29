'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import SignatureCanvas from 'react-signature-canvas';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  KeyRound,
  PenSquare,
  Plus,
  Save,
  ShieldCheck,
  Signature,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { getProject, Project } from '@/app/actions/projects';
import { getProjectVolunteers, ProjectVolunteer } from '@/app/actions/volunteers';
import {
  createTrainingAccessToken,
  createTrainingSession,
  deleteTrainingAttendanceEntry,
  deleteTrainingSession,
  finalizeTrainingSession,
  getProjectTrainingSessions,
  getTrainingAttendanceEntries,
  reopenTrainingSession,
  updateTrainingAttendanceEntry,
  updateTrainingSession,
  updateTrainingSessionStatus,
} from '@/app/actions/training';
import { DEFAULT_TRAINING_TOPICS, DEFAULT_TRAINING_TYPES } from '@/lib/training-defaults';
import type { TrainingAttendanceEntry, TrainingSession } from '@/lib/training-types';

type SessionFormState = {
  eventName: string;
  location: string;
  trainingDate: string;
  instructorName: string;
  trainingTypes: string[];
  topics: string;
  accessToken: string;
};

type EntryEditState = {
  volunteerName: string;
  cnp: string;
  identitySeries: string;
  identityNumber: string;
  volunteerId: string;
};

function getTrainingSignaturePreviewSrc(signatureImageId?: string) {
  return signatureImageId ? `/api/training-signatures/${encodeURIComponent(signatureImageId)}` : null;
}

function createEmptySessionForm(project?: Project | null): SessionFormState {
  return {
    eventName: project?.eventName || project?.name || '',
    location: [project?.city, project?.venue].filter(Boolean).join(', ') || project?.locationName || '',
    trainingDate: project?.startDate || new Date().toISOString().slice(0, 10),
    instructorName: '',
    trainingTypes: [...DEFAULT_TRAINING_TYPES],
    topics: DEFAULT_TRAINING_TOPICS,
    accessToken: '',
  };
}

function hydrateSessionForm(session: TrainingSession): SessionFormState {
  return {
    eventName: session.eventName || '',
    location: session.location || '',
    trainingDate: session.trainingDate || new Date().toISOString().slice(0, 10),
    instructorName: session.instructorName || '',
    trainingTypes: session.trainingTypes?.length ? session.trainingTypes : [...DEFAULT_TRAINING_TYPES],
    topics: session.topics || DEFAULT_TRAINING_TOPICS,
    accessToken: session.accessToken || '',
  };
}

export default function ProjectTrainingPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [entries, setEntries] = useState<TrainingAttendanceEntry[]>([]);
  const [volunteers, setVolunteers] = useState<ProjectVolunteer[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<TrainingAttendanceEntry | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [sessionForm, setSessionForm] = useState<SessionFormState>(createEmptySessionForm(null));
  const [createForm, setCreateForm] = useState<SessionFormState>(createEmptySessionForm(null));
  const [entryEdit, setEntryEdit] = useState<EntryEditState>({
    volunteerName: '',
    cnp: '',
    identitySeries: '',
    identityNumber: '',
    volunteerId: '',
  });
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [isLoadingEntries, setIsLoadingEntries] = useState(false);
  const [isSavingEntry, setIsSavingEntry] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  const instructorSignatureRef = useRef<SignatureCanvas>(null);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.$id === selectedSessionId) || null,
    [selectedSessionId, sessions],
  );

  const volunteerNamesById = useMemo(
    () =>
      new Map(
        volunteers.map((volunteer) => [
          volunteer.$id || '',
          `${volunteer.lastName} ${volunteer.firstName}`.trim(),
        ]),
      ),
    [volunteers],
  );

  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();

    for (const entry of entries) {
      const key = entry.volunteerNameNormalized || entry.volunteerName.toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    return new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([key]) => key),
    );
  }, [entries]);

  const publicSessionUrl = useMemo(() => {
    if (!selectedSession?.$id || !project?.projectSlug || typeof window === 'undefined') {
      return '';
    }

    const baseUrl = `${window.location.origin}/t/${project.projectSlug}/training/${selectedSession.$id}`;
    return selectedSession.accessToken
      ? `${baseUrl}?token=${encodeURIComponent(selectedSession.accessToken)}`
      : baseUrl;
  }, [project?.projectSlug, selectedSession]);

  const loadEntries = useCallback(async (sessionId: string) => {
    setIsLoadingEntries(true);
    try {
      const result = await getTrainingAttendanceEntries(sessionId);
      if (!result.success) {
        throw new Error(result.error || 'Nu am putut încărca participanții.');
      }

      setEntries(result.data);
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Nu am putut încărca participanții.',
      });
      setEntries([]);
    } finally {
      setIsLoadingEntries(false);
    }
  }, []);

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const [projectResult, sessionsResult, volunteersResult] = await Promise.all([
        getProject(projectId),
        getProjectTrainingSessions(projectId),
        getProjectVolunteers(projectId, { limit: 500 }),
      ]);

      if (!projectResult.success || !projectResult.data) {
        throw new Error(projectResult.error || 'Proiectul nu a fost găsit.');
      }

      if (!sessionsResult.success) {
        throw new Error(sessionsResult.error || 'Nu am putut încărca sesiunile.');
      }

      setProject(projectResult.data);
      setSessions(sessionsResult.data);
      setVolunteers(volunteersResult.success ? volunteersResult.data || [] : []);

      const nextSelectedId = sessionsResult.data[0]?.$id || null;
      setSelectedSessionId((current) => current && sessionsResult.data.some((item) => item.$id === current) ? current : nextSelectedId);
      setCreateForm(createEmptySessionForm(projectResult.data));
      setSessionForm(hydrateSessionForm(sessionsResult.data[0] || {
        projectId,
        eventName: projectResult.data.eventName || projectResult.data.name,
        location: [projectResult.data.city, projectResult.data.venue].filter(Boolean).join(', ') || projectResult.data.locationName,
        trainingDate: projectResult.data.startDate,
        instructorName: '',
        instructorUserId: '',
        status: 'draft',
        trainingTypes: [...DEFAULT_TRAINING_TYPES],
        topics: DEFAULT_TRAINING_TOPICS,
      }));
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Nu am putut încărca modulul de instructaj.',
      });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (!selectedSession) {
      setEntries([]);
      return;
    }

    setSessionForm(hydrateSessionForm(selectedSession));
    void loadEntries(selectedSession.$id!);
  }, [loadEntries, selectedSession]);

  useEffect(() => {
    if (!selectedEntry) {
      return;
    }

    setEntryEdit({
      volunteerName: selectedEntry.volunteerName,
      cnp: selectedEntry.cnp || '',
      identitySeries: selectedEntry.identitySeries || '',
      identityNumber: selectedEntry.identityNumber || '',
      volunteerId: selectedEntry.volunteerId || '',
    });
  }, [selectedEntry]);

  const handleCreateSession = async () => {
    setIsSubmittingCreate(true);
    setMessage(null);

    try {
      const result = await createTrainingSession({
        projectId,
        ...createForm,
        status: 'draft',
      });

      if (!result.success) {
        throw new Error(result.error || 'Nu am putut crea sesiunea.');
      }

      setSessions((current) => [result.data, ...current]);
      setSelectedSessionId(result.data.$id || null);
      setShowCreateForm(false);
      setCreateForm(createEmptySessionForm(project));
      setMessage({ type: 'success', text: 'Sesiunea de instructaj a fost creată.' });
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Nu am putut crea sesiunea.',
      });
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleSaveSession = async () => {
    if (!selectedSession?.$id) {
      return;
    }

    setIsSavingSession(true);
    setMessage(null);

    try {
      const result = await updateTrainingSession(selectedSession.$id, sessionForm);
      if (!result.success) {
        throw new Error(result.error || 'Nu am putut salva sesiunea.');
      }

      setSessions((current) =>
        current.map((session) => (session.$id === result.data.$id ? result.data : session)),
      );
      setMessage({ type: 'success', text: 'Sesiunea a fost actualizată.' });
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Nu am putut salva sesiunea.',
      });
    } finally {
      setIsSavingSession(false);
    }
  };

  const handleStatusChange = async (status: TrainingSession['status']) => {
    if (!selectedSession?.$id) {
      return;
    }

    setMessage(null);
    try {
      const result = await updateTrainingSessionStatus(selectedSession.$id, status);
      if (!result.success) {
        throw new Error(result.error || 'Nu am putut schimba statusul.');
      }

      setSessions((current) =>
        current.map((session) => (session.$id === result.data.$id ? result.data : session)),
      );
      setMessage({ type: 'success', text: `Status actualizat la "${status}".` });
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Nu am putut schimba statusul sesiunii.',
      });
    }
  };

  const handleReopenSession = async () => {
    if (!selectedSession?.$id) {
      return;
    }

    const confirmed = window.confirm(
      'Redeschiderea va elimina PDF-ul final arhivat și va permite o nouă colectare / finalizare. Continui?',
    );

    if (!confirmed) {
      return;
    }

    try {
      const result = await reopenTrainingSession(selectedSession.$id);
      if (!result.success) {
        throw new Error(result.error || 'Nu am putut redeschide sesiunea.');
      }

      setSessions((current) =>
        current.map((session) => (session.$id === result.data.$id ? result.data : session)),
      );
      setMessage({ type: 'success', text: 'Sesiunea a fost redeschisă pentru override administrativ.' });
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Nu am putut redeschide sesiunea.',
      });
    }
  };

  const handleDeleteSession = async () => {
    if (!selectedSession?.$id) {
      return;
    }

    const confirmed = window.confirm('Ștergi definitiv această sesiune și toate semnăturile aferente?');
    if (!confirmed) {
      return;
    }

    setIsDeletingSession(true);
    try {
      const result = await deleteTrainingSession(selectedSession.$id);
      if (!result.success) {
        throw new Error(result.error || 'Nu am putut șterge sesiunea.');
      }

      setSessions((current) => current.filter((session) => session.$id !== result.deletedId));
      const nextSessions = sessions.filter((session) => session.$id !== result.deletedId);
      setSelectedSessionId(nextSessions[0]?.$id || null);
      setSelectedEntry(null);
      setEntries([]);
      setMessage({ type: 'success', text: 'Sesiunea a fost ștearsă.' });
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Nu am putut șterge sesiunea.',
      });
    } finally {
      setIsDeletingSession(false);
    }
  };

  const handleGenerateToken = async (target: 'create' | 'edit') => {
    const result = await createTrainingAccessToken();
    if (!result.success) {
      setMessage({ type: 'error', text: result.error || 'Nu am putut genera token-ul.' });
      return;
    }

    if (target === 'create') {
      setCreateForm((current) => ({ ...current, accessToken: result.data.token }));
      return;
    }

    setSessionForm((current) => ({ ...current, accessToken: result.data.token }));
  };

  const handleSaveEntry = async () => {
    if (!selectedEntry?.$id) {
      return;
    }

    setIsSavingEntry(true);
    try {
      const result = await updateTrainingAttendanceEntry(selectedEntry.$id, {
        volunteerName: entryEdit.volunteerName,
        cnp: entryEdit.cnp,
        identitySeries: entryEdit.identitySeries,
        identityNumber: entryEdit.identityNumber,
        volunteerId: entryEdit.volunteerId || undefined,
      });

      if (!result.success) {
        throw new Error(result.error || 'Nu am putut salva participantul.');
      }

      setEntries((current) =>
        current.map((entry) => (entry.$id === result.data.$id ? result.data : entry)),
      );
      setSelectedEntry(result.data);
      setMessage({ type: 'success', text: 'Participantul a fost actualizat.' });
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Nu am putut salva participantul.',
      });
    } finally {
      setIsSavingEntry(false);
    }
  };

  const handleDeleteEntry = async (entry: TrainingAttendanceEntry) => {
    if (!entry.$id) {
      return;
    }

    const confirmed = window.confirm(`Ștergi semnătura lui ${entry.volunteerName}?`);
    if (!confirmed) {
      return;
    }

    setDeletingEntryId(entry.$id);
    try {
      const result = await deleteTrainingAttendanceEntry(entry.$id);
      if (!result.success) {
        throw new Error(result.error || 'Nu am putut șterge participantul.');
      }

      setEntries((current) => current.filter((item) => item.$id !== entry.$id));
      if (selectedEntry?.$id === entry.$id) {
        setSelectedEntry(null);
      }
      setMessage({ type: 'success', text: 'Participantul a fost șters.' });
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Nu am putut șterge participantul.',
      });
    } finally {
      setDeletingEntryId(null);
    }
  };

  const handleFinalize = async () => {
    if (!selectedSession?.$id) {
      return;
    }

    if (!selectedSession.instructorName?.trim()) {
      setMessage({ type: 'error', text: 'Instructorul este obligatoriu înainte de finalizare.' });
      return;
    }

    if (entries.length === 0) {
      setMessage({ type: 'error', text: 'Nu poți finaliza o sesiune fără participanți.' });
      return;
    }

    if (instructorSignatureRef.current?.isEmpty()) {
      setMessage({ type: 'error', text: 'Semnătura instructorului este obligatorie pentru validare.' });
      return;
    }

    setIsFinalizing(true);
    try {
      const result = await finalizeTrainingSession(
        selectedSession.$id,
        instructorSignatureRef.current?.getTrimmedCanvas().toDataURL('image/png') || '',
      );

      if (!result.success) {
        throw new Error(result.error || 'Nu am putut finaliza sesiunea.');
      }

      instructorSignatureRef.current?.clear();
      setSessions((current) =>
        current.map((session) => (session.$id === result.data.$id ? result.data : session)),
      );
      setMessage({ type: 'success', text: 'Procesul verbal a fost generat și arhivat.' });
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Nu am putut finaliza sesiunea.',
      });
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleExportExcel = () => {
    if (!selectedSession || entries.length === 0) {
      return;
    }

    const rows = entries.map((entry, index) => ({
      'Nr. crt.': index + 1,
      'Nume și Prenume': entry.volunteerName,
      CNP: entry.cnp || '',
      'Serie CI': entry.identitySeries || '',
      'Număr CI': entry.identityNumber || '',
      'Semnat la': entry.signedAt ? format(new Date(entry.signedAt), 'dd.MM.yyyy HH:mm', { locale: ro }) : '',
      'Voluntar legat': entry.volunteerId ? volunteerNamesById.get(entry.volunteerId) || entry.volunteerId : '',
    }));

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Instructaj');
    XLSX.writeFile(
      workbook,
      `instructaj_${(project?.projectSlug || projectId).toLowerCase()}_${selectedSession.trainingDate || format(new Date(), 'yyyy-MM-dd')}.xlsx`,
    );
  };

  const sessionStats = useMemo(() => ({
    participants: entries.length,
    duplicates: entries.filter((entry) => duplicateNames.has(entry.volunteerNameNormalized || entry.volunteerName.toLowerCase())).length,
    missingIdentity: entries.filter((entry) => !entry.cnp || !entry.identitySeries || !entry.identityNumber).length,
  }), [duplicateNames, entries]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-sm breadcrumbs text-base-content/50">
        <ul>
          <li><Link href="/projects">Proiecte</Link></li>
          <li><Link href={`/projects/${projectId}`}>{project?.name || '...'}</Link></li>
          <li className="text-base-content font-medium">Instructaj Colectiv</li>
        </ul>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Collective Training Report (SSM/SU)</h1>
          <p className="text-sm text-base-content/60">
            Colectare digitală de semnături, validare instructor și arhivare PDF legală pe proiect.
          </p>
        </div>

        <Link href={`/projects/${projectId}`} className="btn btn-ghost btn-sm gap-2">
          <ArrowLeft size={16} />
          Înapoi la proiect
        </Link>
      </div>

      {message && (
        <div className={`alert rounded-2xl shadow-lg ${message.type === 'error' ? 'alert-error' : 'alert-success'}`}>
          {message.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black">Sesiuni</h2>
                <p className="text-xs text-base-content/50">Creezi, deschizi, finalizezi și arhivezi documentul.</p>
              </div>
              <button className="btn btn-primary btn-sm gap-2 rounded-xl" onClick={() => setShowCreateForm((current) => !current)}>
                <Plus size={14} />
                Nouă sesiune
              </button>
            </div>

            {showCreateForm && (
              <div className="mt-4 space-y-3 rounded-2xl border border-primary/10 bg-primary/5 p-4">
                <input
                  type="text"
                  className="input input-bordered w-full rounded-xl"
                  placeholder="Nume eveniment"
                  value={createForm.eventName}
                  onChange={(event) => setCreateForm((current) => ({ ...current, eventName: event.target.value }))}
                />
                <input
                  type="text"
                  className="input input-bordered w-full rounded-xl"
                  placeholder="Locație"
                  value={createForm.location}
                  onChange={(event) => setCreateForm((current) => ({ ...current, location: event.target.value }))}
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="date"
                    className="input input-bordered w-full rounded-xl"
                    value={createForm.trainingDate}
                    onChange={(event) => setCreateForm((current) => ({ ...current, trainingDate: event.target.value }))}
                  />
                  <input
                    type="text"
                    className="input input-bordered w-full rounded-xl"
                    placeholder="Instructor"
                    value={createForm.instructorName}
                    onChange={(event) => setCreateForm((current) => ({ ...current, instructorName: event.target.value }))}
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input input-bordered flex-1 rounded-xl font-mono"
                    placeholder="Token opțional"
                    value={createForm.accessToken}
                    onChange={(event) => setCreateForm((current) => ({ ...current, accessToken: event.target.value.toUpperCase() }))}
                  />
                  <button type="button" className="btn btn-outline rounded-xl" onClick={() => void handleGenerateToken('create')}>
                    <KeyRound size={16} />
                  </button>
                </div>
                <button
                  className="btn btn-primary w-full rounded-xl"
                  onClick={() => void handleCreateSession()}
                  disabled={isSubmittingCreate}
                >
                  {isSubmittingCreate ? <span className="loading loading-spinner loading-sm" /> : 'Creează sesiune'}
                </button>
              </div>
            )}

            <div className="mt-4 space-y-3">
              {sessions.length === 0 && (
                <div className="rounded-2xl border border-dashed border-base-300 p-5 text-sm text-base-content/50">
                  Nu există încă sesiuni de instructaj pentru acest proiect.
                </div>
              )}

              {sessions.map((session) => (
                <button
                  key={session.$id}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selectedSessionId === session.$id
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-base-300 bg-base-100 hover:border-primary/30 hover:bg-base-200/30'
                  }`}
                  onClick={() => setSelectedSessionId(session.$id || null)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-base-content/40">
                        {session.status}
                      </p>
                      <h3 className="mt-1 text-sm font-black leading-5">{session.eventName}</h3>
                      <p className="mt-1 text-xs text-base-content/50">{session.location}</p>
                    </div>
                    <span className={`badge badge-outline ${session.status === 'finalized' ? 'badge-success' : session.status === 'collecting' ? 'badge-primary' : ''}`}>
                      {session.status}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-base-content/50">
                    <span>{session.trainingDate}</span>
                    <span>{session.instructorName || 'Instructor neasignat'}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {!selectedSession ? (
            <div className="rounded-3xl border border-dashed border-base-300 bg-base-100 p-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-base-200 text-base-content/40">
                <PenSquare size={28} />
              </div>
              <h2 className="text-xl font-black">Selectează o sesiune de instructaj</h2>
              <p className="mt-2 text-sm text-base-content/60">
                După creare, sesiunea va afișa formularul public, participanții și exporturile disponibile.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="rounded-3xl border border-base-300 bg-base-100 p-6 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.22em] text-base-content/40">Sesiune selectată</p>
                      <h2 className="mt-2 text-2xl font-black tracking-tight">{selectedSession.eventName}</h2>
                      <p className="mt-2 text-sm text-base-content/60">
                        Configurezi datele procesului verbal înainte de colectare sau finalizare.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedSession.status === 'draft' && (
                        <button className="btn btn-primary btn-sm rounded-xl" onClick={() => void handleStatusChange('collecting')}>
                          Deschide colectarea
                        </button>
                      )}
                      {selectedSession.status === 'collecting' && (
                        <button className="btn btn-outline btn-sm rounded-xl" onClick={() => void handleStatusChange('draft')}>
                          Pune în draft
                        </button>
                      )}
                      {selectedSession.status === 'finalized' && (
                        <button className="btn btn-outline btn-sm rounded-xl" onClick={() => void handleReopenSession()}>
                          Override admin
                        </button>
                      )}
                      <button
                        className="btn btn-ghost btn-sm rounded-xl text-error"
                        onClick={() => void handleDeleteSession()}
                        disabled={isDeletingSession}
                      >
                        {isDeletingSession ? <span className="loading loading-spinner loading-xs" /> : <Trash2 size={14} />}
                        Șterge
                      </button>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <label className="form-control gap-2">
                      <span className="label-text font-bold">Eveniment</span>
                      <input
                        type="text"
                        className="input input-bordered rounded-xl"
                        value={sessionForm.eventName}
                        onChange={(event) => setSessionForm((current) => ({ ...current, eventName: event.target.value }))}
                        disabled={selectedSession.status === 'finalized'}
                      />
                    </label>
                    <label className="form-control gap-2">
                      <span className="label-text font-bold">Locație</span>
                      <input
                        type="text"
                        className="input input-bordered rounded-xl"
                        value={sessionForm.location}
                        onChange={(event) => setSessionForm((current) => ({ ...current, location: event.target.value }))}
                        disabled={selectedSession.status === 'finalized'}
                      />
                    </label>
                    <label className="form-control gap-2">
                      <span className="label-text font-bold">Data instructaj</span>
                      <input
                        type="date"
                        className="input input-bordered rounded-xl"
                        value={sessionForm.trainingDate}
                        onChange={(event) => setSessionForm((current) => ({ ...current, trainingDate: event.target.value }))}
                        disabled={selectedSession.status === 'finalized'}
                      />
                    </label>
                    <label className="form-control gap-2">
                      <span className="label-text font-bold">Instructor</span>
                      <input
                        type="text"
                        className="input input-bordered rounded-xl"
                        value={sessionForm.instructorName}
                        onChange={(event) => setSessionForm((current) => ({ ...current, instructorName: event.target.value }))}
                        disabled={selectedSession.status === 'finalized'}
                      />
                    </label>
                    <div className="form-control gap-2 md:col-span-2">
                      <span className="label-text font-bold">Tip instructaj</span>
                      <div className="flex flex-wrap gap-3 rounded-2xl border border-base-300 bg-base-200/30 p-4">
                        {['SSM', 'SU'].map((type) => (
                          <label key={type} className="flex cursor-pointer items-center gap-3">
                            <input
                              type="checkbox"
                              className="checkbox checkbox-primary rounded-lg"
                              checked={sessionForm.trainingTypes.includes(type)}
                              disabled={selectedSession.status === 'finalized'}
                              onChange={(event) =>
                                setSessionForm((current) => ({
                                  ...current,
                                  trainingTypes: event.target.checked
                                    ? Array.from(new Set([...current.trainingTypes, type]))
                                    : current.trainingTypes.filter((item) => item !== type),
                                }))
                              }
                            />
                            <span className="text-sm font-bold">{type}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <label className="form-control gap-2 md:col-span-2">
                      <span className="label-text font-bold">Tematică</span>
                      <textarea
                        className="textarea textarea-bordered min-h-32 rounded-2xl"
                        value={sessionForm.topics}
                        onChange={(event) => setSessionForm((current) => ({ ...current, topics: event.target.value }))}
                        disabled={selectedSession.status === 'finalized'}
                      />
                    </label>
                    <div className="form-control gap-2 md:col-span-2">
                      <span className="label-text font-bold">Token de acces</span>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          className="input input-bordered flex-1 rounded-xl font-mono"
                          value={sessionForm.accessToken}
                          onChange={(event) => setSessionForm((current) => ({ ...current, accessToken: event.target.value.toUpperCase() }))}
                          disabled={selectedSession.status === 'finalized'}
                        />
                        <button
                          type="button"
                          className="btn btn-outline rounded-xl"
                          onClick={() => void handleGenerateToken('edit')}
                          disabled={selectedSession.status === 'finalized'}
                        >
                          <KeyRound size={16} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      className="btn btn-primary rounded-xl"
                      onClick={() => void handleSaveSession()}
                      disabled={isSavingSession || selectedSession.status === 'finalized'}
                    >
                      {isSavingSession ? <span className="loading loading-spinner loading-sm" /> : <Save size={16} />}
                      Salvează sesiunea
                    </button>
                    <button
                      className="btn btn-outline rounded-xl"
                      onClick={() => window.open(`/api/training-sessions/${selectedSession.$id}/report`, '_blank', 'noopener,noreferrer')}
                    >
                      <Eye size={16} />
                      Preview PDF
                    </button>
                    {selectedSession.archivedPdfFileId && (
                      <a
                        href={`/api/training-archives/${selectedSession.archivedPdfFileId}`}
                        className="btn btn-outline rounded-xl"
                      >
                        <Download size={16} />
                        PDF final
                      </a>
                    )}
                    <button className="btn btn-outline rounded-xl" onClick={handleExportExcel}>
                      <FileSpreadsheet size={16} />
                      Excel
                    </button>
                    {publicSessionUrl && (
                      <a
                        href={publicSessionUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-outline rounded-xl"
                      >
                        <ExternalLink size={16} />
                        Formular public
                      </a>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-3xl border border-base-300 bg-base-100 p-4 text-center shadow-sm">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-base-content/40">Participanți</p>
                      <p className="mt-2 text-2xl font-black">{sessionStats.participants}</p>
                    </div>
                    <div className="rounded-3xl border border-base-300 bg-base-100 p-4 text-center shadow-sm">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-base-content/40">Duplicate</p>
                      <p className="mt-2 text-2xl font-black">{sessionStats.duplicates}</p>
                    </div>
                    <div className="rounded-3xl border border-base-300 bg-base-100 p-4 text-center shadow-sm">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-base-content/40">Identificare lipsă</p>
                      <p className="mt-2 text-2xl font-black">{sessionStats.missingIdentity}</p>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm">
                    <h3 className="text-lg font-black">Acces public</h3>
                    <p className="mt-1 text-xs text-base-content/50">
                      Distribuie această adresă pe tabletă sau prin QR pentru colectarea semnăturilor.
                    </p>
                    <div className="mt-3 rounded-2xl border border-base-300 bg-base-200/30 p-3 font-mono text-[11px] break-all">
                      {publicSessionUrl || 'Salvează sesiunea și asigură-te că proiectul are slug public.'}
                    </div>
                    <button
                      className="btn btn-sm btn-outline mt-3 rounded-xl"
                      disabled={!publicSessionUrl}
                      onClick={() => {
                        void navigator.clipboard.writeText(publicSessionUrl);
                        setMessage({ type: 'success', text: 'Link-ul public a fost copiat.' });
                      }}
                    >
                      Copiază link
                    </button>
                  </div>

                  <div className="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/10 text-secondary">
                        <Signature size={22} />
                      </div>
                      <div>
                        <h3 className="text-lg font-black">Validare instructor</h3>
                        <p className="text-xs text-base-content/50">Semnătura instructorului blochează sesiunea și arhivează PDF-ul final.</p>
                      </div>
                    </div>

                    <div className="mt-4 overflow-hidden rounded-[1.5rem] border border-base-300 bg-white">
                      <SignatureCanvas
                        ref={instructorSignatureRef}
                        penColor="#0f172a"
                        canvasProps={{ className: 'h-40 w-full' }}
                      />
                    </div>

                    <div className="mt-3 flex gap-2">
                      <button
                        className="btn btn-ghost rounded-xl"
                        onClick={() => instructorSignatureRef.current?.clear()}
                        type="button"
                      >
                        Șterge
                      </button>
                      <button
                        className="btn btn-secondary flex-1 rounded-xl"
                        onClick={() => void handleFinalize()}
                        disabled={isFinalizing || selectedSession.status === 'finalized'}
                        type="button"
                      >
                        {isFinalizing ? <span className="loading loading-spinner loading-sm" /> : <ShieldCheck size={16} />}
                        Finalizează & arhivează
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-base-300 bg-base-100 p-6 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-xl font-black">Participanți</h3>
                    <p className="text-sm text-base-content/60">
                      Editezi numele, CNP-ul și legătura cu registrul de voluntari înainte de finalizarea documentului.
                    </p>
                  </div>
                  <div className="badge badge-outline badge-lg gap-2 py-3">
                    <Users size={14} />
                    {entries.length} înregistrări
                  </div>
                </div>

                {isLoadingEntries ? (
                  <div className="flex justify-center py-12">
                    <span className="loading loading-spinner loading-lg text-primary" />
                  </div>
                ) : entries.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-base-300 p-8 text-center text-sm text-base-content/50 mt-6">
                    Niciun participant nu a semnat încă pentru această sesiune.
                  </div>
                ) : (
                  <div className="mt-6 overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Nume</th>
                          <th>CNP</th>
                          <th>Serie CI</th>
                          <th>Nr. CI</th>
                          <th>Voluntar</th>
                          <th>Semnătura</th>
                          <th>Semnat la</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((entry, index) => {
                          const signaturePreviewSrc = getTrainingSignaturePreviewSrc(entry.signatureImageId);
                          const isDuplicate = duplicateNames.has(
                            entry.volunteerNameNormalized || entry.volunteerName.toLowerCase(),
                          );

                          return (
                            <tr key={entry.$id} className={isDuplicate ? 'bg-warning/5' : ''}>
                              <td className="font-mono text-xs">{index + 1}</td>
                              <td>
                                <div className="font-bold">{entry.volunteerName}</div>
                                {isDuplicate && (
                                  <div className="badge badge-warning badge-outline mt-2">Duplicat potențial</div>
                                )}
                              </td>
                              <td className="font-mono text-xs">{entry.cnp || '-'}</td>
                              <td className="font-mono text-xs">{entry.identitySeries || '-'}</td>
                              <td className="font-mono text-xs">{entry.identityNumber || '-'}</td>
                              <td>
                                {entry.volunteerId ? (
                                  <Link
                                    href={`/projects/${projectId}/volunteers/${entry.volunteerId}`}
                                    className="link link-hover text-sm"
                                  >
                                    {volunteerNamesById.get(entry.volunteerId) || entry.volunteerId}
                                  </Link>
                                ) : (
                                  <span className="text-sm text-base-content/40">Neasociat</span>
                                )}
                              </td>
                              <td>
                                {signaturePreviewSrc ? (
                                  <button
                                    className="btn btn-ghost btn-xs rounded-xl px-2"
                                    onClick={() => setSelectedEntry(entry)}
                                  >
                                    <Image
                                      src={signaturePreviewSrc}
                                      alt={`Semnătura ${entry.volunteerName}`}
                                      width={72}
                                      height={28}
                                      className="rounded border border-base-300 bg-white object-contain"
                                    />
                                  </button>
                                ) : (
                                  <span className="text-sm text-base-content/40">Lipsește</span>
                                )}
                              </td>
                              <td className="text-xs text-base-content/60">
                                {entry.signedAt ? format(new Date(entry.signedAt), 'dd.MM.yyyy HH:mm', { locale: ro }) : '-'}
                              </td>
                              <td>
                                <div className="flex justify-end gap-2">
                                  <button className="btn btn-ghost btn-sm rounded-xl" onClick={() => setSelectedEntry(entry)}>
                                    <Eye size={14} />
                                  </button>
                                  <button
                                    className="btn btn-ghost btn-sm rounded-xl text-error"
                                    onClick={() => void handleDeleteEntry(entry)}
                                    disabled={deletingEntryId === entry.$id}
                                  >
                                    {deletingEntryId === entry.$id ? <span className="loading loading-spinner loading-xs" /> : <Trash2 size={14} />}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {selectedEntry && (
        <div className="modal modal-open">
          <div className="modal-box max-w-3xl rounded-3xl p-0">
            <div className="flex items-center justify-between border-b border-base-300 bg-base-200 px-6 py-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-base-content/40">Participant</p>
                <h3 className="text-xl font-black">{selectedEntry.volunteerName}</h3>
              </div>
              <button className="btn btn-ghost btn-circle btn-sm" onClick={() => setSelectedEntry(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                <label className="form-control gap-2">
                  <span className="label-text font-bold">Nume și prenume</span>
                  <input
                    type="text"
                    className="input input-bordered rounded-xl"
                    value={entryEdit.volunteerName}
                    onChange={(event) => setEntryEdit((current) => ({ ...current, volunteerName: event.target.value }))}
                  />
                </label>
                <label className="form-control gap-2">
                  <span className="label-text font-bold">CNP</span>
                  <input
                    type="text"
                    className="input input-bordered rounded-xl"
                    value={entryEdit.cnp}
                    onChange={(event) => setEntryEdit((current) => ({ ...current, cnp: event.target.value }))}
                  />
                </label>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="form-control gap-2">
                    <span className="label-text font-bold">Serie CI</span>
                    <input
                      type="text"
                      className="input input-bordered rounded-xl uppercase"
                      value={entryEdit.identitySeries}
                      onChange={(event) => setEntryEdit((current) => ({ ...current, identitySeries: event.target.value.toUpperCase() }))}
                    />
                  </label>
                  <label className="form-control gap-2">
                    <span className="label-text font-bold">Număr CI</span>
                    <input
                      type="text"
                      className="input input-bordered rounded-xl uppercase"
                      value={entryEdit.identityNumber}
                      onChange={(event) => setEntryEdit((current) => ({ ...current, identityNumber: event.target.value.toUpperCase() }))}
                    />
                  </label>
                </div>
                <label className="form-control gap-2">
                  <span className="label-text font-bold">Leagă la registrul de voluntari</span>
                  <select
                    className="select select-bordered rounded-xl"
                    value={entryEdit.volunteerId}
                    onChange={(event) => setEntryEdit((current) => ({ ...current, volunteerId: event.target.value }))}
                  >
                    <option value="">Neasociat</option>
                    {volunteers.map((volunteer) => (
                      <option key={volunteer.$id} value={volunteer.$id}>
                        {`${volunteer.lastName} ${volunteer.firstName}`.trim()} · {volunteer.activityCategory}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="rounded-2xl border border-base-300 bg-base-200/40 p-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-base-content/70">Semnat la</span>
                    <span className="font-mono text-xs text-base-content/60">
                      {selectedEntry.signedAt ? format(new Date(selectedEntry.signedAt), 'dd.MM.yyyy HH:mm', { locale: ro }) : '-'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl border border-base-300 bg-white p-4 shadow-inner">
                  {getTrainingSignaturePreviewSrc(selectedEntry.signatureImageId) ? (
                    <Image
                      src={getTrainingSignaturePreviewSrc(selectedEntry.signatureImageId)!}
                      alt={`Semnătura ${selectedEntry.volunteerName}`}
                      width={280}
                      height={180}
                      className="h-auto w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-44 items-center justify-center rounded-2xl border border-dashed border-base-300 text-sm text-base-content/40">
                      Semnătură lipsă
                    </div>
                  )}
                </div>

                <button
                  className="btn btn-primary w-full rounded-xl"
                  onClick={() => void handleSaveEntry()}
                  disabled={isSavingEntry}
                >
                  {isSavingEntry ? <span className="loading loading-spinner loading-sm" /> : <Save size={16} />}
                  Salvează modificările
                </button>
              </div>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setSelectedEntry(null)} />
        </div>
      )}
    </div>
  );
}
