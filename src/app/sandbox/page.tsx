'use client';

import { createSandboxBookings, getLocations } from '@/app/actions/waitwhile';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PlayCircle, ShieldIcon } from 'lucide-react';
import { useState } from 'react';

export default function SandboxPage() {
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [count, setCount] = useState<number>(30);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [sandboxId, setSandboxId] = useState<string>('');

  // Fetch locations to find the SANDBOX securely
  const { data: locations, isLoading: isLoadingLocs } = useQuery({
    queryKey: ['waitwhile-locations'],
    queryFn: async () => {
      const res = await getLocations();
      if (!res.success) throw new Error(res.error);
      
      const locs = res.data || [];
      const sandbox = locs.find(l => l.name.toUpperCase().includes('SANDBOX'));
      if (sandbox) {
        setSandboxId(sandbox.id);
        setLogs(prev => [...prev, `[System] Sandbox Location found: ${sandbox.name}`]);
      } else {
        setLogs(prev => [...prev, '[Error] No SANDBOX location found in your Waitwhile account.']);
      }
      return locs;
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!sandboxId) throw new Error("Sandbox location ID is missing. Cannot proceed.");
      return await createSandboxBookings(sandboxId, date, count);
    },
    onMutate: () => {
      setIsProcessing(true);
      setLogs(prev => [...prev, `[Waitwhile] Generating ${count} bookings for ${date}... (Spaced by 20m)`]);
    },
    onSuccess: (data) => {
      setIsProcessing(false);
      if (data.success) {
        setLogs(prev => [...prev, `[Waitwhile] ✅ Successfully generated ${data.generated} bookings.`]);
      } else {
        setLogs(prev => [...prev, `[Waitwhile] ❌ Error: ${data.error}`]);
      }
    },
    onError: (error: any) => {
      setIsProcessing(false);
      setLogs(prev => [...prev, `[Waitwhile] ❌ System Error: ${error.message}`]);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (count > 0 && count <= 200) {
      generateMutation.mutate();
    } else {
      setLogs(prev => [...prev, `[System] Blocked: Limit generation to max 200 at a time.`]);
    }
  };

  return (
      <div className="card bg-base-100 shadow-xl border border-base-200">
        <div className="card-body gap-6 sm:flex-row items-end">
          <div className="flex-1 w-full sm:w-1/3">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldIcon className="text-info" /> Sandbox Generators
          </h1>
          <p className="text-base-content/60 text-sm mt-1">
            Safely spam your <strong>SANDBOX</strong> location with dummy data to test load scheduling and endpoints.
          </p>

          <div className="divider my-2"></div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="form-control flex-1">
                <label className="label">
                  <span className="label-text font-semibold">Target Date</span>
                </label>
                <input 
                  type="date" 
                  required
                  className="input input-bordered focus:bg-base-200" 
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
              </div>

              <div className="form-control flex-1">
                <label className="label">
                  <span className="label-text font-semibold">Number of Bookings</span>
                </label>
                <input 
                  type="number" 
                  min="1"
                  max="200"
                  required
                  className="input input-bordered focus:bg-base-200" 
                  value={count}
                  onChange={e => setCount(Number(e.target.value))}
                />
                <label className="label">
                  <span className="label-text-alt opacity-70">Will loop 20m apart starting 10:00AM</span>
                </label>
              </div>
            </div>

            <button 
              type="submit" 
              className="btn btn-info w-full text-white shadow-lg shadow-info/20 mt-4"
              disabled={isProcessing || !sandboxId || isLoadingLocs}
            >
              {isProcessing ? (
                <>
                  <span className="loading loading-spinner"></span> Creating Bookings...
                </>
              ) : (
                <>
                  <PlayCircle size={18} /> Generate Dummy Data
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Terminal Logs */}
      <div className="mockup-code bg-base-300 text-base-content border border-base-200">
        <div className="px-5 mb-2opacity-50 text-xs">Sandbox Pipeline Logs</div>
        {logs.length === 0 ? (
          <pre data-prefix="$"><code className="opacity-50">Waiting for commands...</code></pre>
        ) : (
          logs.map((log, idx) => (
            <pre data-prefix=">" key={idx} className={log.includes('❌') ? 'text-error' : log.includes('✅') ? 'text-success' : 'text-info'}>
              <code>{log}</code>
            </pre>
          ))
        )}
      </div>
    </div>
  );
}
