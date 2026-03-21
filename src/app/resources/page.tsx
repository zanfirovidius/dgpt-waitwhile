'use client';

import {
  createResource,
  createResourceCategory,
  CreateResourcePayload,
  getLocationDetails,
  getResourceCategories
} from '@/app/actions/waitwhile';
import LocationSelector from '@/components/LocationSelector';
import ResourceUploader, { ResourceDraft } from '@/components/ResourceUploader';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Clock,
  Layers,
  Minus,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// ── Color Palette ────────────────────────────────────────────────
const RESOURCE_COLORS = [
  '#4285F4', '#EA4335', '#FBBC04', '#34A853', '#FF6D01',
  '#46BDC6', '#7B61FF', '#F538A0', '#00C9A7', '#845EC2',
  '#D65DB1', '#FF9671', '#FFC75F', '#008F7A', '#0089BA',
  '#C34A36', '#B0A8B9', '#4B4453', '#2C73D2', '#FF5E78',
];

// ── Helpers ──────────────────────────────────────────────────────
function formatDateKey(key: string): string {
  if (key.length !== 8) return key;
  const yyyy = key.substring(0, 4);
  const mm = key.substring(4, 6);
  const dd = key.substring(6, 8);
  const d = new Date(`${yyyy}-${mm}-${dd}`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function uid(): string {
  return Math.random().toString(36).substring(2, 9);
}

function hoursSummary(dateHours: any[]): string {
  if (dateHours.length === 0) return 'No hours';
  const active = dateHours.filter(d => d.isOpen && d.periods.length > 0);
  if (active.length === 0) return 'All days closed';
  return active.map(d => {
    const intervals = d.periods.map((p: any) => `${p.from}–${p.to}`).join(', ');
    return `${d.displayDate}: ${intervals}`;
  }).join(' · ');
}

// ══════════════════════════════════════════════════════════════════
// Page
// ══════════════════════════════════════════════════════════════════
export default function ResourcesPage() {
  const queryClient = useQueryClient();
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isCreatingCat, setIsCreatingCat] = useState(false);
  const [catMessage, setCatMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [resources, setResources] = useState<ResourceDraft[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [manualName, setManualName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [expandedResource, setExpandedResource] = useState<string | null>(null);

  const [locationDates, setLocationDates] = useState<any[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (!selectedLocation) { setLocationDates([]); return; }
    let mounted = true;
    (async () => {
      const res = await getLocationDetails(selectedLocation);
      if (!mounted) return;
      if (res.success && res.data?.hoursByDate) {
        const dates = Object.entries(res.data.hoursByDate as Record<string, any>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, val]) => ({
            dateKey: key,
            displayDate: formatDateKey(key),
            isOpen: val.isOpen ?? true,
            periods: Array.isArray(val.periods) ? val.periods.map((p: any) => ({ from: p.from, to: p.to })) : [],
          }));
        setLocationDates(dates);
      } else {
        setLocationDates([]);
      }
    })();
    return () => { mounted = false; };
  }, [selectedLocation]);

  // ── Categories ─────────────────────────────────────────────────
  const {
    data: categories,
    isLoading: catLoading,
    isError: catError,
    refetch: refetchCats,
    isFetching: catFetching,
  } = useQuery({
    queryKey: ['resource-categories', selectedLocation],
    queryFn: async () => {
      if (!selectedLocation) return [];
      const res = await getResourceCategories(selectedLocation);
      if (!res.success) throw new Error(res.error);
      return res.data || [];
    },
    enabled: !!selectedLocation,
  });

  const handleLocationChange = (locId: string) => {
    setSelectedLocation(locId);
    setSelectedCategoryId('');
    setCatMessage(null);
    setResources([]);
    setLogs([]);
    setExpandedResource(null);
  };

  const handleCreateCategory = async () => {
    if (!selectedLocation || !newCategoryName.trim()) return;
    setIsCreatingCat(true);
    setCatMessage(null);
    const res = await createResourceCategory(selectedLocation, newCategoryName.trim());
    if (res.success) {
      setCatMessage({ type: 'success', text: `Category "${newCategoryName.trim()}" created!` });
      setNewCategoryName('');
      queryClient.invalidateQueries({ queryKey: ['resource-categories', selectedLocation] });
    } else {
      setCatMessage({ type: 'error', text: res.error || 'Failed' });
    }
    setIsCreatingCat(false);
  };

  // ── Resource Draft Management ──────────────────────────────────
  const makeDefaultDateHours = () =>
    locationDates.map(d => ({
      ...d,
      periods: d.periods.length > 0 ? d.periods.map((p: any) => ({ ...p })) : [{ from: '09:00', to: '17:00' }],
    }));

  const handleAddManual = () => {
    if (!manualName.trim()) return;
    setResources(prev => [...prev, {
      id: uid(),
      name: manualName.trim(),
      description: '',
      color: RESOURCE_COLORS[prev.length % RESOURCE_COLORS.length],
      dateHours: makeDefaultDateHours(),
    }]);
    setManualName('');
  };

  const handlePaste = () => {
    const names = pasteText.split('\n').map(s => s.trim()).filter(Boolean);
    const newDrafts: ResourceDraft[] = names.map((name, idx) => ({
      id: uid(), name, description: '',
      color: RESOURCE_COLORS[(resources.length + idx) % RESOURCE_COLORS.length],
      dateHours: makeDefaultDateHours(),
    }));
    setResources(prev => [...prev, ...newDrafts]);
    setPasteText('');
  };

  const removeResource = (id: string) => {
    setResources(prev => prev.filter(r => r.id !== id));
    if (expandedResource === id) setExpandedResource(null);
  };

  const updateResourceField = (id: string, field: keyof ResourceDraft, value: any) => {
    setResources(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const updatePeriod = (resId: string, dateKey: string, periodIdx: number, field: 'from' | 'to', value: string) => {
    setResources(prev => prev.map(r => {
      if (r.id !== resId) return r;
      return { ...r, dateHours: r.dateHours.map(dh => {
        if (dh.dateKey !== dateKey) return dh;
        return { ...dh, periods: dh.periods.map((p, i) => i === periodIdx ? { ...p, [field]: value } : p) };
      })};
    }));
  };

  const addPeriod = (resId: string, dateKey: string) => {
    setResources(prev => prev.map(r => {
      if (r.id !== resId) return r;
      return { ...r, dateHours: r.dateHours.map(dh => {
        if (dh.dateKey !== dateKey) return dh;
        return { ...dh, isOpen: true, periods: [...dh.periods, { from: '09:00', to: '17:00' }] };
      })};
    }));
  };

  const removePeriod = (resId: string, dateKey: string, periodIdx: number) => {
    setResources(prev => prev.map(r => {
      if (r.id !== resId) return r;
      return { ...r, dateHours: r.dateHours.map(dh => {
        if (dh.dateKey !== dateKey) return dh;
        const newPeriods = dh.periods.filter((_, i) => i !== periodIdx);
        return { ...dh, periods: newPeriods, isOpen: newPeriods.length > 0 };
      })};
    }));
  };

  // ── Bulk Create ────────────────────────────────────────────────
  const handleBulkCreate = async () => {
    if (!selectedLocation || !selectedCategoryId || resources.length === 0) return;
    setIsProcessing(true);
    setLogs([`Starting creation of ${resources.length} resources...`]);
    setExpandedResource(null);

    const updated = [...resources];
    for (let i = 0; i < updated.length; i++) {
      const draft = updated[i];
      const hoursByDate: Record<string, { isOpen: boolean; periods: { from: string; to: string }[] }> = {};
      draft.dateHours.forEach(dh => {
        if (dh.periods.length > 0) {
          hoursByDate[dh.dateKey] = { isOpen: true, periods: dh.periods };
        }
      });

      const payload: CreateResourcePayload = {
        name: draft.name,
        description: draft.description || undefined,
        color: draft.color,
        categoryId: selectedCategoryId,
        locationId: selectedLocation,
        hoursByDate: Object.keys(hoursByDate).length > 0 ? hoursByDate : undefined,
      };

      const res = await createResource(payload);
      if (res.success) {
        updated[i] = { ...updated[i], syncStatus: 'success', syncMessage: 'Created' };
        setLogs(prev => [...prev, `[Success] ${draft.name}`]);
      } else {
        updated[i] = { ...updated[i], syncStatus: 'error', syncMessage: res.error || 'Failed' };
        setLogs(prev => [...prev, `[Error] Failed ${draft.name} — ${res.error}`]);
      }
      setResources([...updated]);
    }

    setLogs(prev => [...prev, `[System] ✅ Pipeline completed!`]);
    setIsProcessing(false);
    queryClient.invalidateQueries({ queryKey: ['resource-categories', selectedLocation] });
  };

  const hasCategories = categories && categories.length > 0;
  const successCount = resources.filter(r => r.syncStatus === 'success').length;
  const errorCount = resources.filter(r => r.syncStatus === 'error').length;
  const pendingCount = resources.filter(r => !r.syncStatus).length;

  // ══════════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      {/* ── Top Configuration Bar (Matches Add Users format) ────── */}
      <div className="card bg-base-100 shadow-xl border border-base-200">
        <div className="card-body gap-6 sm:flex-row items-center">
          <div className="flex-1 w-full relative z-20">
            <h2 className="card-title text-base text-base-content/70 mb-2 flex items-center gap-2">
              <Layers size={18} /> Configuration
            </h2>
            <LocationSelector selectedLocation={selectedLocation} onChange={handleLocationChange} />
          </div>

          <div className="divider sm:divider-horizontal"></div>

          <div className="flex-1 w-full relative z-10">
            <div className="flex items-center justify-between mb-2">
              <h2 className="card-title text-base text-base-content/70">
                Resource Category
              </h2>
              {selectedLocation && (
                <button onClick={() => refetchCats()} disabled={catFetching} className="btn btn-ghost btn-xs btn-square" title="Refresh">
                  <RefreshCw size={14} className={catFetching ? 'animate-spin' : ''} />
                </button>
              )}
            </div>
            {!selectedLocation ? (
              <div className="text-sm text-base-content/40 h-12 flex items-center font-mono">Select Location First</div>
            ) : catLoading || catFetching ? (
              <div className="skeleton h-12 w-full rounded-lg"></div>
            ) : catError ? (
              <div className="text-sm text-error">Failed to load</div>
            ) : hasCategories ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  className="select select-bordered w-full bg-base-200/50"
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                >
                  <option value="" disabled>Choose category...</option>
                  {categories!.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} ({cat.children?.length || 0})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="text-sm text-warning h-12 flex items-center gap-2">No categories found</div>
            )}
            
            {/* Inline Category Creation */}
            {selectedLocation && !catLoading && (
              <div className="mt-2 flex gap-2 items-center">
                <input
                  type="text"
                  className="input input-sm input-bordered flex-1 bg-base-200/30"
                  placeholder="Create new category..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateCategory()}
                  disabled={isCreatingCat}
                />
                <button onClick={handleCreateCategory} disabled={isCreatingCat || !newCategoryName.trim()} className="btn btn-sm btn-ghost text-primary px-2">
                  {isCreatingCat ? <span className="loading loading-spinner loading-xs"></span> : <Plus size={14} />} Create
                </button>
              </div>
            )}
            {catMessage && (
              <div className={`text-xs mt-1 ${catMessage.type === 'success' ? 'text-success' : 'text-error'}`}>
                {catMessage.text}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column for Input Methods */}
        <div className="space-y-6 lg:col-span-1 h-full">
          <div className="card bg-base-100 shadow-xl border border-base-200 h-full">
            <div className="card-body">
              <h2 className="card-title text-lg flex items-center gap-2">
                <Users size={20} className="text-primary" /> Add Resources
              </h2>
              
              <div role="tablist" className="tabs tabs-boxed mt-4 bg-base-200/50 p-1">
                <input type="radio" name="input_tabs" role="tab" className="tab font-semibold" aria-label="Excel Upload" defaultChecked />
                <div role="tabpanel" className="tab-content py-6">
                  <ResourceUploader 
                    onResourcesParsed={(newDrafts) => setResources(prev => [...prev, ...newDrafts])}
                    selectedLocation={selectedLocation}
                    selectedCategoryId={selectedCategoryId}
                    resourceColors={RESOURCE_COLORS}
                    currentCount={resources.length}
                  />
                </div>

                <input type="radio" name="input_tabs" role="tab" className="tab font-semibold whitespace-nowrap" aria-label="Manual Entry" />
                <div role="tabpanel" className="tab-content py-6">
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text font-semibold flex items-center gap-1"><Pencil size={14} /> Resource Name</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="input input-bordered flex-1 bg-base-100"
                        placeholder="e.g. Cabinet 1"
                        value={manualName}
                        onChange={(e) => setManualName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddManual()}
                      />
                      <button onClick={handleAddManual} disabled={!manualName.trim()} className="btn btn-primary btn-square w-12 text-white shadow-sm">
                        <Plus size={18} />
                      </button>
                    </div>
                  </div>
                </div>

                <input type="radio" name="input_tabs" role="tab" className="tab font-semibold whitespace-nowrap" aria-label="Paste Data" />
                <div role="tabpanel" className="tab-content py-6">
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text font-semibold flex items-center gap-1"><ClipboardPaste size={14} /> Paste Names</span>
                    </label>
                    <textarea
                      className="textarea textarea-bordered w-full h-32 bg-base-100 font-mono text-sm leading-tight mb-2"
                      placeholder={"Cabinet 1\nCabinet 2"}
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                    />
                    <button onClick={handlePaste} disabled={!pasteText.trim()} className="btn btn-primary w-full shadow-sm gap-2">
                      <Check size={16} /> Import Extracted
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right column for Grid & Actions */}
        <div className="lg:col-span-2 space-y-6 h-full">
          <div className="card bg-base-100 shadow-xl border border-base-200 h-full flex flex-col">
            <div className="card-body p-0 sm:p-6 overflow-hidden">
              <div className="flex justify-between items-center mb-4 px-4 sm:px-0">
                <div>
                  <h2 className="card-title text-lg">Resource Preview</h2>
                  <p className="text-sm text-base-content/60">
                    {resources.length} {resources.length === 1 ? 'resource' : 'resources'} ready to sync
                  </p>
                </div>
                
                {resources.length > 0 && (
                  <button onClick={() => setResources([])} className="btn btn-ghost btn-sm text-error">Clear All</button>
                )}
              </div>

              {/* Status Pills */}
              {(successCount > 0 || errorCount > 0) && (
                <div className="flex gap-2 px-4 sm:px-0 mb-4">
                  {successCount > 0 && <span className="badge badge-success gap-1 text-xs"><Check size={12} /> {successCount} Created</span>}
                  {errorCount > 0 && <span className="badge badge-error gap-1 text-xs"><X size={12} /> {errorCount} Failed</span>}
                  {pendingCount > 0 && <span className="badge badge-ghost gap-1 text-xs">{pendingCount} Pending</span>}
                </div>
              )}

              {/* Resource List */}
              <div className="border border-base-200 rounded-lg overflow-hidden flex-1 mx-4 sm:mx-0">
                <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-3 px-4 py-2 bg-base-200/40 text-xs font-bold uppercase tracking-wider text-base-content/40 border-b border-base-200">
                  <div className="w-5"></div>
                  <div>Name</div>
                  <div className="hidden sm:block">Hours Summary</div>
                  <div className="w-20 text-right">Status</div>
                </div>

                <div className="max-h-[500px] overflow-y-auto divide-y divide-base-200/50">
                  {resources.length === 0 ? (
                    <div className="text-center py-10 opacity-40 text-sm">No resources added. Use the left panel to add data.</div>
                  ) : resources.map((res) => {
                    const isExpanded = expandedResource === res.id;
                    return (
                      <div key={res.id} className={`transition-colors ${res.syncStatus === 'success' ? 'bg-success/5' : ''} ${res.syncStatus === 'error' ? 'bg-error/5' : ''}`}>
                        <div
                          className="grid grid-cols-[auto_1fr_1fr_auto] gap-3 px-4 py-3 items-center cursor-pointer hover:bg-base-200/20 transition-colors"
                          onClick={() => setExpandedResource(isExpanded ? null : res.id)}
                        >
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronDown size={14} className="text-base-content/30" /> : <ChevronRight size={14} className="text-base-content/30" />}
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: res.color }}></div>
                          </div>
                          <div className="font-medium text-sm truncate">{res.name}</div>
                          <div className="text-xs text-base-content/40 truncate hidden sm:block">{hoursSummary(res.dateHours)}</div>
                          <div className="w-20 flex justify-end">
                            {res.syncStatus === 'success' && <span className="badge badge-xs badge-success gap-0.5 opacity-80 py-2"><Check size={10} /></span>}
                            {res.syncStatus === 'error' && <span className="badge badge-xs badge-error">Error</span>}
                            {!res.syncStatus && (
                              <button onClick={(e) => { e.stopPropagation(); removeResource(res.id); }} className="btn btn-xs btn-ghost text-base-content/20 hover:text-error p-1">
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Editor Panel */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-2 border-t border-base-200/30 bg-base-200/10 shadow-inner">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                              <div>
                                <label className="text-xs font-semibold text-base-content/40 block mb-1">Name</label>
                                <input type="text" className="input input-sm input-bordered w-full bg-base-100 focus:bg-base-100" value={res.name} onChange={(e) => updateResourceField(res.id, 'name', e.target.value)} />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-base-content/40 block mb-1">Description</label>
                                <input type="text" className="input input-sm input-bordered w-full bg-base-100 focus:bg-base-100" placeholder="Optional" value={res.description} onChange={(e) => updateResourceField(res.id, 'description', e.target.value)} />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-base-content/40 block mb-1">Color</label>
                                <div className="flex items-center gap-2 h-8">
                                  <input type="color" className="w-8 h-8 rounded-lg cursor-pointer border-0 p-0 shadow-sm" value={res.color} onChange={(e) => updateResourceField(res.id, 'color', e.target.value)} />
                                  <span className="text-xs font-mono text-base-content/50">{res.color}</span>
                                </div>
                              </div>
                            </div>

                            <div className="divider my-2 opacity-30"></div>
                            
                            <label className="text-xs font-semibold text-base-content/40 flex items-center gap-1.5 mb-2"><Clock size={12} /> Working Hours by Date</label>
                            {res.dateHours.length === 0 ? (
                              <p className="text-xs text-base-content/30 italic">No location dates available.</p>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {res.dateHours.map(dh => (
                                  <div key={dh.dateKey} className={`p-2 rounded-lg border text-xs transition-colors ${dh.isOpen ? 'bg-base-100 border-base-300 shadow-sm' : 'bg-base-200/20 border-base-200/50 opacity-60'}`}>
                                    <div className="flex justify-between items-center mb-1">
                                      <span className="font-semibold">{dh.displayDate}</span>
                                      <div className="flex items-center gap-2">
                                        {!dh.isOpen && <span className="text-base-content/30 text-[9px] uppercase tracking-wide">Closed</span>}
                                        <button onClick={() => addPeriod(res.id, dh.dateKey)} className="btn btn-ghost btn-xs px-1 h-5 min-h-0 text-primary bg-primary/5 hover:bg-primary/20">
                                          <Plus size={10} />
                                        </button>
                                      </div>
                                    </div>
                                    {dh.periods.length > 0 && (
                                      <div className="space-y-1">
                                        {dh.periods.map((period, pIdx) => (
                                          <div key={pIdx} className="flex items-center gap-1">
                                            <input type="time" className="input input-bordered input-xs bg-base-200/50 w-24 h-6 text-xs text-center font-mono" value={period.from} onChange={(e) => updatePeriod(res.id, dh.dateKey, pIdx, 'from', e.target.value)} />
                                            <span className="text-base-content/20 shrink-0">→</span>
                                            <input type="time" className="input input-bordered input-xs bg-base-200/50 w-24 h-6 text-xs text-center font-mono" value={period.to} onChange={(e) => updatePeriod(res.id, dh.dateKey, pIdx, 'to', e.target.value)} />
                                            <button onClick={() => removePeriod(res.id, dh.dateKey, pIdx)} className="btn btn-ghost btn-xs px-1 h-5 min-h-0 rounded-md text-error/40 hover:text-error hover:bg-error/10">
                                              <Minus size={12} />
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            {res.syncStatus === 'error' && res.syncMessage && <div className="mt-3 text-xs text-error font-medium bg-error/10 p-2 rounded-lg">{res.syncMessage}</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {/* Execution Button */}
              {resources.length > 0 && (
                <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-end mx-4 sm:mx-0">
                  <button 
                    disabled={!selectedCategoryId || isProcessing || pendingCount === 0}
                    onClick={handleBulkCreate}
                    className="btn btn-primary btn-lg gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform"
                  >
                    {isProcessing ? <span className="loading loading-spinner"></span> : <PlayCircle />}
                    Execute Pipeline
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Terminal Logs ─────────────────────────────────────────── */}
      <div className="mockup-code bg-base-300 text-base-content border border-base-200 mt-6 shadow-xl w-full">
        <div className="px-5 mb-2 opacity-50 text-xs">Pipeline Operations Logs</div>
        <div className="max-h-64 overflow-y-auto">
          {logs.length === 0 ? (
            <pre data-prefix="$"><code className="opacity-50">Waiting for commands...</code></pre>
          ) : (
            logs.map((log, idx) => (
              <pre data-prefix={log.includes('[Error]') ? "!" : ">"} key={idx} className={log.includes('[Error]') ? 'text-error font-semibold' : log.includes('[Success]') || log.includes('✅') ? 'text-success' : 'text-info'}>
                <code>{log}</code>
              </pre>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>

    </div>
  );
}
