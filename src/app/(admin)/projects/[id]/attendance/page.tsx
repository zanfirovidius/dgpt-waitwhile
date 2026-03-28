'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { getProject } from '@/app/actions/projects';
import { getProjectAttendanceConfig, updateProjectAttendanceConfig, AttendanceConfig } from '@/app/actions/attendance-config';
import { getProjectAttendanceEntries, validateAttendanceEntry, deleteAttendanceEntry, AttendanceEntry } from '@/app/actions/attendance';
import { 
  Users, Clock, AlertCircle, 
  Settings, ClipboardList, Search, Filter,
  Download, FileSpreadsheet, FileText,
  Save, Eye, CheckCircle2, XCircle, Trash2,
  Info, ShieldCheck, RefreshCw, Mail, Phone,
  ExternalLink,
  Signature as SignatureIcon
} from 'lucide-react';
import Link from 'next/link';
import QRCodeModule from '@/components/QRCodeModule';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type Tab = 'records' | 'config';

function getSignaturePreviewSrc(signatureImageId?: string) {
    if (!signatureImageId) {
        return null;
    }

    if (signatureImageId.startsWith('data:')) {
        return signatureImageId;
    }

    return `/api/attendance-signatures/${encodeURIComponent(signatureImageId)}`;
}

export default function AdminAttendancePage() {
    const params = useParams();
    const projectId = params.id as string;

    const [activeTab, setActiveTab] = useState<Tab>('records');
    const [loading, setLoading] = useState(true);
    const [project, setProject] = useState<any>(null);
    const [config, setConfig] = useState<AttendanceConfig | null>(null);
    const [entries, setEntries] = useState<AttendanceEntry[]>([]);
    
    const [searchQuery, setSearchQuery] = useState('');
    const [showOnlyOverTwoHours, setShowOnlyOverTwoHours] = useState(false);
    const [isSavingConfig, setIsSavingConfig] = useState(false);
    const [isBulkValidating, setIsBulkValidating] = useState(false);
    const [validatingEntryId, setValidatingEntryId] = useState<string | null>(null);
    const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [newRole, setNewRole] = useState('');

    // Modal state
    const [selectedEntry, setSelectedEntry] = useState<AttendanceEntry | null>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const [pRes, cRes, eRes] = await Promise.all([
                getProject(projectId),
                getProjectAttendanceConfig(projectId),
                getProjectAttendanceEntries(projectId)
            ]);

            if (pRes.success) setProject(pRes.data);
            if (cRes.success) setConfig(cRes.data!);
            if (eRes.success) setEntries(eRes.data!);
        } catch (err: any) {
            console.error('Error loading admin attendance:', err);
            setMessage({ type: 'error', text: err.message || 'Eroare la încărcarea datelor' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [projectId]);

    const filteredEntries = useMemo(() => {
        return entries.filter((entry) => {
            const matchesSearch =
                entry.volunteerFullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                entry.departmentRole.toLowerCase().includes(searchQuery.toLowerCase());

            if (!matchesSearch) {
                return false;
            }

            if (showOnlyOverTwoHours) {
                return (entry.totalHoursDecimal || 0) > 2;
            }

            return true;
        });
    }, [entries, searchQuery, showOnlyOverTwoHours]);

    const bulkValidatableEntries = useMemo(
        () =>
            filteredEntries.filter(
                (entry) =>
                    !!entry.$id &&
                    entry.checkOutConfirmed &&
                    !entry.coordinatorValidated &&
                    (entry.totalHoursDecimal || 0) > 2,
            ),
        [filteredEntries],
    );
    const selectedEntrySignatureSrc = getSignaturePreviewSrc(selectedEntry?.signatureImageId);

    const stats = useMemo(() => {
        const totalHours = entries.reduce((acc, curr) => acc + (curr.totalHoursDecimal || 0), 0);
        const pendingValue = entries.filter(e => e.checkOutConfirmed && !e.coordinatorValidated).length;
        return { totalHours: totalHours.toFixed(1), pending: pendingValue, totalVolunteers: new Set(entries.map(e => e.volunteerFullName)).size };
    }, [entries]);

    const handleConfigUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!config) return;
        setIsSavingConfig(true);
        setMessage(null);
        
        try {
            const res = await updateProjectAttendanceConfig(projectId, config);
            if (res.success) {
                setMessage({ type: 'success', text: 'Configurația a fost salvată!' });
            } else {
                setMessage({ type: 'error', text: res.error || 'Eroare la salvare' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Eroare de sistem' });
        } finally {
            setIsSavingConfig(false);
        }
    };

    const handleToggleValidation = async (entry: AttendanceEntry) => {
        if (!entry.checkOutConfirmed && !entry.coordinatorValidated) {
            setMessage({ type: 'error', text: 'Rândul poate fi validat doar după check-out.' });
            return;
        }

        setValidatingEntryId(entry.$id || null);
        setMessage(null);

        try {
            const res = await validateAttendanceEntry(entry.$id!, !entry.coordinatorValidated);
            if (!res.success) {
                setMessage({ type: 'error', text: res.error || 'Eroare la validarea rândului' });
                return;
            }

            if (res.data) {
                setEntries(prev => prev.map(item => item.$id === res.data!.$id ? res.data! : item));
                setSelectedEntry(prev => prev?.$id === res.data!.$id ? res.data! : prev);
            } else {
                await loadData();
            }

            setMessage({
                type: 'success',
                text: entry.coordinatorValidated ? 'Validarea a fost anulată.' : 'Rândul a fost validat.',
            });
        } catch (err: unknown) {
            console.error('Validation error:', err);
            setMessage({
                type: 'error',
                text: err instanceof Error ? err.message : 'Eroare la validarea rândului',
            });
        } finally {
            setValidatingEntryId(null);
        }
    };

    const handleBulkValidate = async () => {
        if (bulkValidatableEntries.length === 0) {
            setMessage({
                type: 'error',
                text: 'Nu există rânduri eligibile pentru validare în filtrul curent.',
            });
            return;
        }

        setIsBulkValidating(true);
        setMessage(null);

        try {
            const results = await Promise.all(
                bulkValidatableEntries.map((entry) => validateAttendanceEntry(entry.$id!, true)),
            );

            const successfulUpdates = results
                .filter((result): result is { success: true; data?: AttendanceEntry; error?: string } => result.success)
                .map((result) => result.data)
                .filter((entry): entry is AttendanceEntry => !!entry?.$id);

            const failures = results.filter((result) => !result.success);

            if (successfulUpdates.length > 0) {
                const updatedById = new Map(successfulUpdates.map((entry) => [entry.$id!, entry]));
                setEntries((prev) => prev.map((entry) => updatedById.get(entry.$id || '') || entry));
                setSelectedEntry((prev) => (prev ? updatedById.get(prev.$id || '') || prev : prev));
            }

            if (failures.length === 0) {
                setMessage({
                    type: 'success',
                    text: `Au fost validate ${successfulUpdates.length} înregistrări cu peste 2 ore.`,
                });
                return;
            }

            setMessage({
                type: 'error',
                text: `Au fost validate ${successfulUpdates.length} înregistrări, dar ${failures.length} au eșuat.`,
            });
        } catch (err: unknown) {
            console.error('Bulk validation error:', err);
            setMessage({
                type: 'error',
                text: err instanceof Error ? err.message : 'Eroare la validarea în masă.',
            });
        } finally {
            setIsBulkValidating(false);
        }
    };

    const handleDeleteEntry = async (entry: AttendanceEntry) => {
        if (!entry.$id) {
            return;
        }

        const confirmed = window.confirm(
            `Ștergi definitiv prezența pentru ${entry.volunteerFullName} din ${entry.attendanceDate}?`,
        );
        if (!confirmed) {
            return;
        }

        setDeletingEntryId(entry.$id);
        setMessage(null);

        try {
            const res = await deleteAttendanceEntry(entry.$id);
            if (!res.success) {
                setMessage({ type: 'error', text: res.error || 'Eroare la ștergerea înregistrării' });
                return;
            }

            setEntries((prev) => prev.filter((item) => item.$id !== entry.$id));
            setSelectedEntry((prev) => (prev?.$id === entry.$id ? null : prev));
            setMessage({ type: 'success', text: 'Înregistrarea de prezență a fost ștearsă.' });
        } catch (err: unknown) {
            console.error('Delete attendance error:', err);
            setMessage({
                type: 'error',
                text: err instanceof Error ? err.message : 'Eroare la ștergerea înregistrării',
            });
        } finally {
            setDeletingEntryId(null);
        }
    };

    const handleExport = (type: 'csv' | 'xlsx') => {
        if (entries.length === 0) return;
        
        const data = filteredEntries.map(e => ({
            'Voluntar': e.volunteerFullName,
            'Email': e.volunteerEmail || '-',
            'Telefon': e.volunteerPhone || '-',
            'Departament/Rol': e.departmentRole,
            'Data': e.attendanceDate,
            'Check-In': e.checkInAt ? format(new Date(e.checkInAt), 'HH:mm') : '-',
            'Check-Out': e.checkOutAt ? format(new Date(e.checkOutAt), 'HH:mm') : '-',
            'Pauză (min)': e.breakMinutes || 0,
            'Total Ore': e.totalHoursDecimal?.toFixed(2) || '0.00',
            'Validat': e.coordinatorValidated ? 'DA' : 'NU',
            'Note': e.notes || '-'
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Prezență');
        
        const fileName = `prezenta_${project?.projectSlug}_${format(new Date(), 'yyyy-MM-dd')}`;
        XLSX.writeFile(wb, `${fileName}.${type === 'csv' ? 'csv' : 'xlsx'}`);
    };

    const handlePdfExport = () => {
        if (entries.length === 0) return;

        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text(`Raport Prezență: ${project?.name || ''}`, 14, 22);
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Generat la: ${format(new Date(), 'PPpp', { locale: ro })}`, 14, 30);

        const tableData = filteredEntries.map(e => [
            e.volunteerFullName,
            e.departmentRole,
            e.attendanceDate,
            e.checkInAt ? format(new Date(e.checkInAt), 'HH:mm') : '-',
            e.checkOutAt ? format(new Date(e.checkOutAt), 'HH:mm') : '-',
            e.totalHoursDecimal?.toFixed(2) || '0.00',
            e.coordinatorValidated ? 'DA' : 'NU'
        ]);

        autoTable(doc, {
            head: [['Voluntar', 'Rol', 'Data', 'In', 'Out', 'Ore', 'Val.']],
            body: tableData,
            startY: 40,
            styles: { fontSize: 9 },
            headStyles: { fillColor: [79, 70, 229] }
        });

        doc.save(`prezenta_${project?.projectSlug}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    };

    if (loading) return <div className="p-8 flex justify-center"><span className="loading loading-spinner loading-lg text-primary"></span></div>;

    if (!config && !loading) {
        return (
            <div className="p-12 text-center space-y-4">
                <div className="flex justify-center text-error opacity-40 mb-4"><AlertCircle size={64} /></div>
                <h2 className="text-xl font-bold">Modulul de Prezență nu este disponibil</h2>
                <p className="opacity-60 max-w-md mx-auto">
                    A apărut o eroare la încărcarea configurației. Vă rugăm să vă asigurați că au fost create colecțiile necesare în Appwrite și că ID-urile din `.env.local` sunt corecte.
                </p>
                <div className="bg-base-200 p-4 rounded-xl text-xs font-mono inline-block text-left">
                    Eroare: {message?.text || 'Documentul de configurare nu a fost găsit.'}
                </div>
                <br />
                <button className="btn btn-outline btn-sm rounded-xl mt-4" onClick={loadData}>
                    Încearcă din nou
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* breadcrumbs */}
            <div className="text-sm breadcrumbs text-base-content/50">
                <ul>
                    <li><Link href="/projects">Proiecte</Link></li>
                    <li><Link href={`/projects/${projectId}`}>{project?.name || '...'}</Link></li>
                    <li className="text-base-content font-medium">Prezență</li>
                </ul>
            </div>

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{project?.name || '...'}</h1>
                    <div className="flex items-center gap-3 mt-1">
                        <div className={`badge badge-sm gap-1.5 py-3 ${config?.attendanceEnabled ? 'badge-success' : 'badge-ghost'}`}>
                            {config?.attendanceEnabled ? 'Active' : 'Inactive'}
                        </div>
                        {project?.projectSlug && config?.attendanceAccessToken && (
                            <a 
                              href={`/a/${project.projectSlug}/attendance?token=${config.attendanceAccessToken}`} 
                              target="_blank" 
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                                Public URL: /a/{project.projectSlug} <ExternalLink size={10} />
                            </a>
                        )}
                    </div>
                </div>
                
                <div className="flex gap-2">
                    {activeTab === 'config' && (
                        <button onClick={handleConfigUpdate} className="btn btn-primary btn-sm gap-2" disabled={isSavingConfig}>
                            {isSavingConfig ? <span className="loading loading-spinner loading-xs"></span> : <Save size={14} />} 
                            Salvează Configurația
                        </button>
                    )}
                    {activeTab === 'records' && (
                        <div className="flex gap-2">
                            <button className="btn btn-outline btn-sm gap-2" onClick={() => handleExport('csv')} disabled={entries.length === 0}>
                                <Download size={14} /> CSV
                            </button>
                            <button className="btn btn-outline btn-sm gap-2" onClick={() => handlePdfExport()} disabled={entries.length === 0}>
                                <FileText size={14} /> PDF
                            </button>
                            <button className="btn btn-primary btn-sm gap-2 shadow-lg shadow-primary/20" onClick={() => handleExport('xlsx')} disabled={entries.length === 0}>
                                <FileSpreadsheet size={14} /> Excel
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {message && (
                <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-error'} py-3 mb-6`}>
                    {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    <span className="text-sm font-medium">{message.text}</span>
                </div>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="stats shadow-sm bg-base-100 border border-base-200 rounded-3xl overflow-hidden">
                    <div className="stat">
                        <div className="stat-figure text-primary opacity-20"><Clock size={40} /></div>
                        <div className="stat-title font-bold text-xs uppercase tracking-widest opacity-60">Total Ore Lucrate</div>
                        <div className="stat-value text-primary">{stats.totalHours}</div>
                        <div className="stat-desc font-medium">Din care {entries.length} intrări</div>
                    </div>
                </div>
                <div className="stats shadow-sm bg-base-100 border border-base-200 rounded-3xl overflow-hidden">
                    <div className="stat">
                        <div className="stat-figure text-secondary opacity-20"><Users size={40} /></div>
                        <div className="stat-title font-bold text-xs uppercase tracking-widest opacity-60">Voluntari Activi</div>
                        <div className="stat-value text-secondary">{stats.totalVolunteers}</div>
                        <div className="stat-desc font-medium">Prezenți la acest proiect</div>
                    </div>
                </div>
                <div className="stats shadow-sm bg-base-100 border border-base-200 rounded-3xl overflow-hidden">
                    <div className="stat">
                        <div className="stat-figure text-warning opacity-20"><AlertCircle size={40} /></div>
                        <div className="stat-title font-bold text-xs uppercase tracking-widest opacity-60">Așteaptă Validare</div>
                        <div className="stat-value text-warning">{stats.pending}</div>
                        <div className="stat-desc font-medium">Necesită semnătura coordonatorului</div>
                    </div>
                </div>
            </div>

            {/* Tabs & Search */}
            <div className="tabs tabs-lifted mt-4">
                <button 
                    className={`tab ${activeTab === 'records' ? 'tab-active font-bold' : ''}`}
                    onClick={() => setActiveTab('records')}
                >
                    <div className="flex items-center gap-2">
                        <ClipboardList size={16} />
                        Intrări Prezență
                        {entries.length > 0 && <span className="badge badge-sm badge-primary ml-1">{entries.length}</span>}
                    </div>
                </button>
                <button 
                    className={`tab ${activeTab === 'config' ? 'tab-active font-bold' : ''}`}
                    onClick={() => setActiveTab('config')}
                >
                    <div className="flex items-center gap-2">
                        <Settings size={16} />
                        Configurare
                    </div>
                </button>
            </div>

            <div className="bg-base-100 border-x border-b border-base-200 rounded-b-xl p-6 min-h-[400px] space-y-8">
                
                {activeTab === 'records' && (
                    <div className="animate-in fade-in duration-300 space-y-6">
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <div className="join w-full lg:w-auto">
                                <div className="input input-bordered join-item flex items-center gap-2 bg-base-100 rounded-l-2xl border-r-0 h-10">
                                    <Search size={16} className="opacity-40" />
                                    <input 
                                        type="text" 
                                        placeholder="Caută voluntar sau rol..." 
                                        className="w-full md:w-64 text-sm"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                <button
                                    className={`btn join-item rounded-r-2xl gap-2 font-bold h-10 min-h-[40px] ${
                                        showOnlyOverTwoHours ? 'btn-primary' : 'btn-outline border-base-300'
                                    }`}
                                    onClick={() => setShowOnlyOverTwoHours((prev) => !prev)}
                                >
                                    <Filter size={16} /> {showOnlyOverTwoHours ? 'Peste 2h' : 'Toate orele'}
                                </button>
                            </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <div className="badge badge-outline badge-lg rounded-xl px-4">
                                        Vizibile: {filteredEntries.length}
                                    </div>
                                    {showOnlyOverTwoHours && (
                                        <div className="badge badge-warning badge-lg rounded-xl px-4 border-none">
                                            Doar peste 2h
                                        </div>
                                    )}
                                    <button
                                        className="btn btn-primary btn-sm gap-2 rounded-xl shadow-lg shadow-primary/20"
                                        onClick={handleBulkValidate}
                                        disabled={bulkValidatableEntries.length === 0 || isBulkValidating}
                                    >
                                        {isBulkValidating ? (
                                            <span className="loading loading-spinner loading-sm"></span>
                                        ) : (
                                            <CheckCircle2 size={14} />
                                        )}
                                        Validează în masă ({bulkValidatableEntries.length})
                                    </button>
                                </div>
                            </div>
                            {showOnlyOverTwoHours && (
                                <div className="alert alert-info rounded-2xl text-sm">
                                    <Clock size={16} />
                                    <span>
                                        Sunt afișate doar prezențele cu mai mult de 2 ore. Butonul de validare în masă validează doar rândurile nevalidate și cu check-out confirmat.
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="bg-base-100 rounded-2xl border border-base-200 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="table table-lg">
                                    <thead>
                                        <tr className="bg-base-200/50">
                                            <th className="font-bold">Voluntar</th>
                                            <th className="font-bold text-center">Data</th>
                                            <th className="font-bold text-center">Check-In</th>
                                            <th className="font-bold text-center">Check-Out</th>
                                            <th className="font-bold text-center">Pauză</th>
                                            <th className="font-bold text-center text-primary">Total Ore</th>
                                            <th className="font-bold text-center">Status</th>
                                            <th className="font-bold text-center">Semnătură</th>
                                            <th className=""></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-base-100">
                                        {filteredEntries.length === 0 ? (
                                            <tr>
                                                <td colSpan={9} className="text-center py-12 opacity-40">Nu există înregistrări care să corespundă criteriilor.</td>
                                            </tr>
                                        ) : (
                                            filteredEntries.map(entry => {
                                                const signaturePreviewSrc = getSignaturePreviewSrc(entry.signatureImageId);

                                                return (
                                                <tr key={entry.$id} className="hover:bg-base-200/20 transition-colors">
                                                    <td>
                                                        <div className="flex items-center gap-3">
                                                            <div className="avatar placeholder">
                                                                <div className="bg-primary/10 text-primary font-bold rounded-xl w-10">
                                                                    <span>{entry.volunteerFullName.charAt(0)}</span>
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <div className="font-black">{entry.volunteerFullName}</div>
                                                                <div className="text-[10px] opacity-40 uppercase font-black tracking-widest">{entry.departmentRole}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="text-center font-medium opacity-60">{entry.attendanceDate}</td>
                                                    <td className="text-center text-xs font-mono">{entry.checkInAt ? format(new Date(entry.checkInAt), 'HH:mm') : '-'}</td>
                                                    <td className="text-center text-xs font-mono">{entry.checkOutAt ? format(new Date(entry.checkOutAt), 'HH:mm') : (
                                                        <span className="badge badge-error badge-outline text-[8px] font-black uppercase tracking-widest">Activ</span>
                                                    )}</td>
                                                    <td className="text-center text-xs opacity-60">{entry.breakMinutes || 0}m</td>
                                                    <td className="text-center font-black text-primary">{entry.totalHoursDecimal?.toFixed(1) || '0.0'} h</td>
                                                    <td className="text-center">
                                                        {entry.coordinatorValidated ? (
                                                            <div className="badge badge-success gap-1 text-[10px] font-black uppercase p-2 border-none">
                                                                <CheckCircle2 size={10} /> Validat
                                                            </div>
                                                        ) : (
                                                            !entry.checkOutConfirmed ? (
                                                            <div className="badge badge-ghost gap-1 text-[10px] font-black uppercase p-2 opacity-40">
                                                                În Curs
                                                            </div>
                                                            ) : (
                                                            <div className="badge badge-warning gap-1 text-[10px] font-black uppercase p-2 border-none">
                                                                Preluat
                                                            </div>
                                                            )
                                                        )}
                                                    </td>
                                                    <td className="text-center">
                                                        {signaturePreviewSrc ? (
                                                            <button
                                                                className="btn btn-ghost h-auto min-h-0 rounded-2xl p-1 hover:bg-base-200/70"
                                                                onClick={() => setSelectedEntry(entry)}
                                                                title="Vezi semnătura"
                                                            >
                                                                <div className="overflow-hidden rounded-xl border border-base-300 bg-white shadow-sm">
                                                                    <Image
                                                                        src={signaturePreviewSrc}
                                                                        alt={`Semnatura ${entry.volunteerFullName}`}
                                                                        width={88}
                                                                        height={40}
                                                                        unoptimized
                                                                        className="h-10 w-[88px] object-contain"
                                                                    />
                                                                </div>
                                                            </button>
                                                        ) : (
                                                            <span className="text-xs opacity-30">-</span>
                                                        )}
                                                    </td>
                                                    <td className="text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            {entry.checkOutConfirmed && (
                                                                <button
                                                                    className={`btn btn-xs rounded-xl ${entry.coordinatorValidated ? 'btn-outline btn-error' : 'btn-primary'}`}
                                                                    onClick={() => handleToggleValidation(entry)}
                                                                    disabled={
                                                                        validatingEntryId === entry.$id ||
                                                                        deletingEntryId === entry.$id ||
                                                                        isBulkValidating
                                                                    }
                                                                >
                                                                    {validatingEntryId === entry.$id ? (
                                                                        <span className="loading loading-spinner loading-xs"></span>
                                                                    ) : entry.coordinatorValidated ? (
                                                                        'Anulează'
                                                                    ) : (
                                                                        'Validează'
                                                                    )}
                                                                </button>
                                                            )}
                                                            <button
                                                                className="btn btn-ghost btn-circle btn-sm text-error hover:bg-error/10"
                                                                onClick={() => handleDeleteEntry(entry)}
                                                                disabled={deletingEntryId === entry.$id || validatingEntryId === entry.$id}
                                                                title="Șterge înregistrarea"
                                                            >
                                                                {deletingEntryId === entry.$id ? (
                                                                    <span className="loading loading-spinner loading-xs"></span>
                                                                ) : (
                                                                    <Trash2 size={16} />
                                                                )}
                                                            </button>
                                                            <button 
                                                                className="btn btn-ghost btn-circle btn-sm"
                                                                onClick={() => setSelectedEntry(entry)}
                                                            >
                                                                <Eye size={18} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'config' && config && (
                    <div className="animate-in slide-in-from-right-2 duration-300 grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 space-y-6">
                            <form onSubmit={handleConfigUpdate} className="card bg-base-100 shadow-sm border border-base-200 rounded-3xl p-8 space-y-8">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                                            <ShieldCheck size={20} />
                                        </div>
                                        <h2 className="text-xl font-bold">Setări Securitate & Acces</h2>
                                    </div>
                                    <div className="form-control">
                                        <label className="label cursor-pointer gap-4">
                                            <span className="label-text font-bold">Modul Activat</span>
                                            <input 
                                                type="checkbox" 
                                                className="toggle toggle-primary"
                                                checked={config.attendanceEnabled}
                                                onChange={(e) => setConfig({ ...config, attendanceEnabled: e.target.checked })}
                                            />
                                        </label>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="form-control">
                                        <label className="label"><span className="label-text font-bold">Mod Acces</span></label>
                                        <select 
                                            className="select select-bordered rounded-2xl"
                                            value={config.attendanceAccessMode}
                                            onChange={(e) => setConfig({ ...config, attendanceAccessMode: e.target.value as any })}
                                        >
                                            <option value="token">Token Unic (URL)</option>
                                            <option value="pin">Cod PIN per Voluntar</option>
                                            <option value="qr">Cod QR (Sincronizare live)</option>
                                        </select>
                                    </div>
                                    <div className="form-control">
                                        <label className="label"><span className="label-text font-bold">Token de Acces</span></label>
                                        <div className="join w-full">
                                            <input 
                                                type="text" 
                                                className="input input-bordered join-item flex-1 rounded-l-2xl font-mono"
                                                value={config.attendanceAccessToken || ''}
                                                onChange={(e) => setConfig({ ...config, attendanceAccessToken: e.target.value })}
                                            />
                                            <button 
                                                type="button"
                                                className="btn btn-neutral join-item rounded-r-2xl"
                                                onClick={() => setConfig({ ...config, attendanceAccessToken: Math.random().toString(36).substring(2, 12) })}
                                            >
                                                <RefreshCw size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="divider opacity-20"></div>

                                <div className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-secondary/10 rounded-xl flex items-center justify-center text-secondary">
                                            <Info size={20} />
                                        </div>
                                        <h2 className="text-xl font-bold">Instrucțiuni și Formular</h2>
                                    </div>
                                    
                                    <div className="form-control w-full">
                                        <label className="label pb-1"><span className="label-text font-bold text-sm">Instrucțiuni Formular (Desktop/Tablet)</span></label>
                                        <textarea 
                                            className="textarea textarea-bordered rounded-2xl h-24 w-full"
                                            placeholder="Ex: Te rugăm să te înregistrezi la sosire și să semnezi la plecare."
                                            value={config.instructions || ''}
                                            onChange={(e) => setConfig({ ...config, instructions: e.target.value })}
                                        />
                                    </div>

                                    <div className="form-control w-full">
                                        <label className="label pb-1"><span className="label-text font-bold text-sm">Notă de Confidențialitate (Specifică Prezență)</span></label>
                                        <textarea 
                                            className="textarea textarea-bordered rounded-2xl h-32 w-full"
                                            placeholder="Specifică modul în care datele de prezență sunt prelucrate."
                                            value={config.privacyNotice || ''}
                                            onChange={(e) => setConfig({ ...config, privacyNotice: e.target.value })}
                                        />
                                        <span className="label-text-alt opacity-40 mt-1 italic">Această notă va fi afișată la baza formularului de prezență.</span>
                                    </div>
                                </div>

                                <div className="divider opacity-20"></div>

                                <div className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-accent/10 rounded-xl flex items-center justify-center text-accent">
                                            <Users size={20} />
                                        </div>
                                        <h2 className="text-xl font-bold">Roluri & Departamente</h2>
                                    </div>
                                    <p className="text-xs opacity-60">Definește rolurile disponibile pentru voluntari în acest proiect.</p>
                                    
                                    <div className="flex flex-wrap gap-2">
                                        {(config.attendanceRoles || []).map((role, idx) => (
                                            <div key={idx} className="badge badge-lg border-base-300 gap-2 pr-1 h-10 pl-4 rounded-xl">
                                                <span className="text-xs font-bold font-mono tracking-tight">{role}</span>
                                                <button 
                                                    type="button"
                                                    className="btn btn-ghost btn-circle btn-xs hover:bg-error hover:text-white"
                                                    onClick={() => setConfig({ ...config, attendanceRoles: config.attendanceRoles?.filter((_, i) => i !== idx) })}
                                                >
                                                    <XCircle size={14} />
                                                </button>
                                            </div>
                                        ))}
                                        { (config.attendanceRoles || []).length === 0 && <p className="text-[10px] italic opacity-30">Niciun rol configurat. Se vor folosi cele implicite.</p> }
                                    </div>

                                    <div className="join w-full max-w-sm">
                                        <input 
                                            type="text" 
                                            className="input input-lg input-bordered join-item flex-1 rounded-l-2xl"
                                            placeholder="Ex: Logistică"
                                            value={newRole}
                                            onChange={(e) => setNewRole(e.target.value)}
                                            onKeyPress={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    if (!newRole.trim()) return;
                                                    const roles = config.attendanceRoles || [];
                                                    const normalized = newRole.trim().toUpperCase();
                                                    if (roles.includes(normalized)) return;
                                                    setConfig({ ...config, attendanceRoles: [...roles, normalized] });
                                                    setNewRole('');
                                                }
                                            }}
                                        />
                                        <button 
                                            type="button"
                                            className="btn btn-lg btn-accent join-item rounded-r-2xl"
                                            onClick={() => {
                                                if (!newRole.trim()) return;
                                                const roles = config.attendanceRoles || [];
                                                const normalized = newRole.trim().toUpperCase();
                                                if (roles.includes(normalized)) return;
                                                setConfig({ ...config, attendanceRoles: [...roles, normalized] });
                                                setNewRole('');
                                            }}
                                        >
                                            Adaugă
                                        </button>
                                    </div>
                                </div>

                                <div className="divider opacity-20"></div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="form-control bg-base-200/50 p-4 rounded-2xl border border-base-200">
                                        <label className="label cursor-pointer">
                                            <span className="label-text font-medium">Necesită semnătură la check-out</span>
                                            <input 
                                                type="checkbox" 
                                                className="checkbox checkbox-primary rounded-lg"
                                                checked={config.signatureRequiredAtCheckout}
                                                onChange={(e) => setConfig({ ...config, signatureRequiredAtCheckout: e.target.checked })}
                                            />
                                        </label>
                                    </div>
                                    <div className="form-control bg-base-200/50 p-4 rounded-2xl border border-base-200">
                                        <label className="label cursor-pointer">
                                            <span className="label-text font-medium">Permite înregistrarea pauzei</span>
                                            <input 
                                                type="checkbox" 
                                                className="checkbox checkbox-primary rounded-lg"
                                                checked={config.breakFieldEnabled}
                                                onChange={(e) => setConfig({ ...config, breakFieldEnabled: e.target.checked })}
                                            />
                                        </label>
                                    </div>
                                </div>
                            </form>
                        </div>

                        <div className="space-y-6">
                            <div className="card bg-neutral text-neutral-content p-8 rounded-3xl space-y-6 shadow-xl">
                                <h3 className="text-xl font-black tracking-tight">Public URL</h3>
                                <p className="text-xs opacity-60">Acesta este link-ul pe care voluntarii îl vor accesa pentru check-in/out.</p>
                                <div className="bg-white/10 p-4 rounded-2xl font-mono text-[10px] break-all border border-white/10">
                                    {typeof window !== 'undefined' ? `${window.location.origin}/a/${project.projectSlug}/attendance?token=${config.attendanceAccessToken}` : ''}
                                </div>
                                <button 
                                    className="btn btn-sm btn-outline border-white/30 text-white rounded-xl w-full"
                                    onClick={() => {
                                        const url = `${window.location.origin}/a/${project.projectSlug}/attendance?token=${config.attendanceAccessToken}`;
                                        navigator.clipboard.writeText(url);
                                    }}
                                >
                                    Copiază Link
                                </button>
                            </div>

                            <QRCodeModule 
                                url={typeof window !== 'undefined' ? `${window.location.origin}/a/${project.projectSlug}/attendance?token=${config.attendanceAccessToken}` : ''}
                                title={project.name}
                                subtitle="Scanează pentru prezență (Check-in / Check-out)"
                                active={config.attendanceEnabled}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* MODAL: ENTRY DETAILS */}
            {selectedEntry && (
                <div className="modal modal-open">
                    <div className="modal-box w-full max-w-2xl rounded-3xl p-0 overflow-hidden bg-base-100 animate-in zoom-in-95 duration-200">
                        <div className="bg-base-200 p-6 flex justify-between items-center border-b border-base-200">
                            <div>
                                <h3 className="text-xl font-black">Detalii Prezență</h3>
                                <p className="text-xs opacity-40 uppercase tracking-widest font-black">{selectedEntry.volunteerFullName}</p>
                            </div>
                            <button className="btn btn-ghost btn-circle btn-sm" onClick={() => setSelectedEntry(null)}>
                                <XCircle size={20} />
                            </button>
                        </div>
                        
                        <div className="p-8 space-y-8">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-base-200/50 p-4 rounded-2xl text-center">
                                    <p className="text-[10px] font-black uppercase opacity-40 mb-1">Total</p>
                                    <p className="text-2xl font-black text-primary">{selectedEntry.totalHoursDecimal?.toFixed(1) || '0.0'}h</p>
                                </div>
                                <div className="bg-base-200/50 p-4 rounded-2xl text-center">
                                    <p className="text-[10px] font-black uppercase opacity-40 mb-1">Check-In</p>
                                    <p className="text-lg font-bold">{selectedEntry.checkInAt ? format(new Date(selectedEntry.checkInAt), 'HH:mm') : '-'}</p>
                                </div>
                                <div className="bg-base-200/50 p-4 rounded-2xl text-center">
                                    <p className="text-[10px] font-black uppercase opacity-40 mb-1">Check-Out</p>
                                    <p className="text-lg font-bold">{selectedEntry.checkOutAt ? format(new Date(selectedEntry.checkOutAt), 'HH:mm') : '-'}</p>
                                </div>
                                <div className="bg-base-200/50 p-4 rounded-2xl text-center">
                                    <p className="text-[10px] font-black uppercase opacity-40 mb-1">Pauză</p>
                                    <p className="text-lg font-bold">{selectedEntry.breakMinutes || 0}m</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-base-200/50 p-4 rounded-2xl border border-base-200/70">
                                    <p className="text-[10px] font-black uppercase opacity-40 mb-3">Contact Telefon</p>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-base-100 border border-base-200 flex items-center justify-center text-base-content/50">
                                            <Phone size={16} />
                                        </div>
                                        <p className="font-bold break-all">{selectedEntry.volunteerPhone || '-'}</p>
                                    </div>
                                </div>
                                <div className="bg-base-200/50 p-4 rounded-2xl border border-base-200/70">
                                    <p className="text-[10px] font-black uppercase opacity-40 mb-3">Contact Email</p>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-base-100 border border-base-200 flex items-center justify-center text-base-content/50">
                                            <Mail size={16} />
                                        </div>
                                        <p className="font-bold break-all">{selectedEntry.volunteerEmail || '-'}</p>
                                    </div>
                                </div>
                            </div>

                            {selectedEntrySignatureSrc && (
                                <div className="space-y-4">
                                    <h4 className="font-bold flex items-center gap-2"><SignatureIcon size={18} /> Semnătură Digitală (Client)</h4>
                                    <div className="bg-white border border-base-200 rounded-2xl p-4 flex items-center justify-center min-h-32">
                                        <Image
                                            src={selectedEntrySignatureSrc}
                                            alt="Semnatura"
                                            width={320}
                                            height={128}
                                            unoptimized
                                            className="max-h-32 w-auto object-contain"
                                        />
                                    </div>
                                </div>
                            )}

                            {selectedEntry.notes && (
                                <div className="space-y-2">
                                    <h4 className="font-bold text-sm">Note Voluntar</h4>
                                    <div className="bg-base-200/50 p-4 rounded-2xl italic text-sm border-l-4 border-primary">
                                        "{selectedEntry.notes}"
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-col md:flex-row gap-4 pt-4 border-t border-base-200">
                                <div className="flex-1 flex items-center gap-3">
                                    {selectedEntry.coordinatorValidated ? (
                                        <div className="bg-success/10 text-success p-4 rounded-2xl flex-1 flex items-center gap-3">
                                            <CheckCircle2 size={24} />
                                            <div>
                                                <p className="text-xs font-black uppercase">Validat de Coordonator</p>
                                                <p className="text-[10px] opacity-70">{selectedEntry.coordinatorValidatedAt ? format(new Date(selectedEntry.coordinatorValidatedAt), 'PPp', { locale: ro }) : ''}</p>
                                            </div>
                                        </div>
                                    ) : selectedEntry.checkOutConfirmed ? (
                                        <div className="bg-warning/10 text-warning p-4 rounded-2xl flex-1 flex items-center gap-3">
                                            <AlertCircle size={24} />
                                            <div>
                                                <p className="text-xs font-black uppercase">Așteaptă Validare</p>
                                                <p className="text-[10px] opacity-70">Verifică corectitudinea orelor și semnătura.</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-base-200/80 text-base-content/60 p-4 rounded-2xl flex-1 flex items-center gap-3">
                                            <Clock size={24} />
                                            <div>
                                                <p className="text-xs font-black uppercase">Check-Out Neconfirmat</p>
                                                <p className="text-[10px] opacity-70">Validarea devine disponibilă după închiderea turei.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        className="btn btn-outline btn-error rounded-2xl px-6 font-bold"
                                        onClick={() => handleDeleteEntry(selectedEntry)}
                                        disabled={deletingEntryId === selectedEntry.$id || validatingEntryId === selectedEntry.$id || isBulkValidating}
                                    >
                                        {deletingEntryId === selectedEntry.$id ? (
                                            <span className="loading loading-spinner loading-sm"></span>
                                        ) : (
                                            <><Trash2 size={18} className="mr-2" /> Șterge</>
                                        )}
                                    </button>
                                    <button 
                                        className={`btn btn-lg rounded-2xl px-8 font-bold ${selectedEntry.coordinatorValidated ? 'btn-outline btn-error' : 'btn-primary shadow-lg shadow-primary/20'}`}
                                        onClick={() => handleToggleValidation(selectedEntry)}
                                        disabled={
                                            isBulkValidating ||
                                            deletingEntryId === selectedEntry.$id ||
                                            validatingEntryId === selectedEntry.$id ||
                                            (!selectedEntry.checkOutConfirmed && !selectedEntry.coordinatorValidated)
                                        }
                                    >
                                        {validatingEntryId === selectedEntry.$id ? (
                                            <span className="loading loading-spinner loading-sm"></span>
                                        ) : selectedEntry.coordinatorValidated ? (
                                            <><XCircle size={20} className="mr-2" /> Anulează Validarea</>
                                        ) : (
                                            <><CheckCircle2 size={20} className="mr-2" /> Validează Rând</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="modal-backdrop bg-neutral/60 backdrop-blur-sm" onClick={() => setSelectedEntry(null)}></div>
                </div>
            )}
        </div>
    );
}
