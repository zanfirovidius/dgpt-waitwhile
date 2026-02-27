'use client';

import { UserPayload, createUser } from '@/app/actions/waitwhile';
import LocationSelector from '@/components/LocationSelector';
import ManualUserForm from '@/components/ManualUserForm';
import PasteTable from '@/components/PasteTable';
import Uploader from '@/components/Uploader';
import UserGrid from '@/components/UserGrid';
import { PlayCircle, Settings2, Users } from 'lucide-react';
import { useState } from 'react';

export interface ExtendedUser extends UserPayload {
  id: string; // for React UI unique key
  syncStatus?: 'idle' | 'success' | 'error';
  syncMessage?: string;
}
// We will find SANDBOX dynamically instead of hardcoding

function generateRandomPassword(length = 12) {
  const charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*";
  let res = '';
  for (let i = 0, n = charset.length; i < length; ++i) {
    res += charset.charAt(Math.floor(Math.random() * n));
  }
  return res;
}

export default function Home() {
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [locations, setLocations] = useState<{id: string; name: string}[]>([]);
  const [users, setUsers] = useState<ExtendedUser[]>([]);
  const [generateRandomPasswords, setGenerateRandomPasswords] = useState(false);
  const [emailDomain, setEmailDomain] = useState('dgpt.ro');
  const [isProcessing, setIsProcessing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Function to run the Waitwhile sync
  const handleSync = async () => {
    if (!selectedLocation || users.length === 0) return;
    
    setIsProcessing(true);
    setSyncDone(false);
    setLogs([`[System] Starting Waitwhile sync for ${users.length} users into ${selectedLocation}...`]);

    // Deep copy to allow updates
    const updatedUsers: ExtendedUser[] = [...users];

    for (let i = 0; i < updatedUsers.length; i++) {
      const user = updatedUsers[i];
      
      // Determine final password
      const finalPassword = generateRandomPasswords || !user.password?.trim() 
        ? generateRandomPassword() 
        : user.password;
        
      user.password = finalPassword;

      // Prepare payload
      // Find sandbox location if it exists
      const sandboxLoc = locations.find(l => l.name.toUpperCase().includes('SANDBOX'));
      const sandboxLocId = sandboxLoc ? sandboxLoc.id : null;
      
      const targetLocationIds = sandboxLocId 
        ? [selectedLocation, sandboxLocId] 
        : [selectedLocation];

      const payload: UserPayload = {
        name: user.name,
        email: user.email,
        locationIds: targetLocationIds,
        defaultLocationId: selectedLocation,
        roles: user.roles,
        password: finalPassword
      };

      // Call server action
      const res = await createUser(payload);

      if (res.success) {
        user.syncStatus = 'success';
        user.syncMessage = 'Created successfully';
        setLogs(prev => [...prev, `[Success] ${user.email} / ${finalPassword}`]);
      } else {
        user.syncStatus = 'error';
        user.syncMessage = res.error === 'user_email_exists' ? 'User already exists' : (res.error || 'Failed');
        setLogs(prev => [...prev, `[Error] Failed to inject ${user.email}: ${user.syncMessage}`]);
      }

      // Update state progressively so UI reflects status
      setUsers([...updatedUsers]);
    }

    setIsProcessing(false);
    setSyncDone(true);
    setLogs(prev => [...prev, `[System] ✅ Sync completed!`]);
  };

  return (
    <div className="space-y-6">
      {/* Top Configuration Bar */}
      <div className="card bg-base-100 shadow-xl border border-base-200">
        <div className="card-body gap-6 sm:flex-row items-center">
          <div className="flex-1 w-full relative z-20">
            <h2 className="card-title text-base text-base-content/70 mb-2 flex items-center gap-2">
              <Settings2 size={18} /> Configuration
            </h2>
            <LocationSelector 
              selectedLocation={selectedLocation} 
              onChange={setSelectedLocation} 
              onLocationsLoaded={setLocations}
            />
          </div>
          
          
          <div className="divider sm:divider-horizontal"></div>

          <div className="flex-1 w-full">
            <h2 className="card-title text-base text-base-content/70 mb-2 invisible hidden sm:block">
              &nbsp;
            </h2>
            <div className="form-control w-full max-w-xs">
              <label className="label">
                <span className="label-text font-semibold">Email Domain</span>
              </label>
              <div className="join w-full">
                <span className="join-item bg-base-200 border border-base-content/20 flex items-center px-3 font-mono text-sm opacity-60">
                  @
                </span>
                <input 
                  type="text" 
                  className="input input-bordered join-item w-full bg-base-200 focus:bg-base-100" 
                  value={emailDomain}
                  onChange={(e) => setEmailDomain(e.target.value)}
                  placeholder="dgpt.ro"
                />
              </div>
            </div>
          </div>
          
          <div className="divider sm:divider-horizontal"></div>
          
          <div className="flex-1 w-full flex items-center h-full pt-2 sm:pt-8">
            <label className="cursor-pointer label justify-start gap-4">
              <input 
                type="checkbox" 
                className="toggle toggle-primary" 
                checked={generateRandomPasswords}
                onChange={(e) => setGenerateRandomPasswords(e.target.checked)}
              />
              <span className="label-text flex flex-col">
                <span className="font-semibold">Auto-generate Passwords</span>
                <span className="text-xs text-base-content/60">Generate secure 12-char passwords for new users</span>
              </span>
            </label>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column for Input Methods */}
        <div className="space-y-6 lg:col-span-1 h-full">
          <div className="card bg-base-100 shadow-xl border border-base-200 h-full">
            <div className="card-body">
              <h2 className="card-title text-lg flex items-center gap-2">
                <Users size={20} className="text-primary" /> Add Users
              </h2>
              
              <div role="tablist" className="tabs tabs-boxed mt-4 bg-base-200/50 p-1">
                <input type="radio" name="input_tabs" role="tab" className="tab font-semibold" aria-label="Excel Upload" defaultChecked />
                <div role="tabpanel" className="tab-content py-6">
                  <Uploader 
                    onUsersParsed={(newUsers: ExtendedUser[]) => setUsers([...users, ...newUsers])} 
                    selectedLocation={selectedLocation}
                    emailDomain={emailDomain}
                  />
                </div>

                <input type="radio" name="input_tabs" role="tab" className="tab font-semibold whitespace-nowrap" aria-label="Manual Entry" />
                <div role="tabpanel" className="tab-content py-6">
                  <ManualUserForm 
                    onAddUser={(user: ExtendedUser) => setUsers([...users, user])} 
                    selectedLocation={selectedLocation}
                    emailDomain={emailDomain}
                  />
                </div>

                <input type="radio" name="input_tabs" role="tab" className="tab font-semibold whitespace-nowrap" aria-label="Paste Data" />
                <div role="tabpanel" className="tab-content py-6">
                  <PasteTable 
                    onUsersParsed={(newUsers: ExtendedUser[]) => setUsers([...users, ...newUsers])} 
                    selectedLocation={selectedLocation}
                    emailDomain={emailDomain}
                  />
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
                  <h2 className="card-title text-lg">User Preview</h2>
                  <p className="text-sm text-base-content/60">
                    {users.length} {users.length === 1 ? 'user' : 'users'} ready to sync
                  </p>
                </div>
                
                {users.length > 0 && (
                  <button 
                    onClick={() => setUsers([])}
                    className="btn btn-ghost btn-sm text-error"
                  >
                    Clear All
                  </button>
                )}
              </div>

              <UserGrid 
                users={users} 
                setUsers={setUsers} 
              />
              
              {users.length > 0 && (
                <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-end">
                  <button 
                    disabled={!selectedLocation || isProcessing}
                    onClick={handleSync}
                    className="btn btn-primary btn-lg gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform"
                  >
                    {isProcessing ? (
                      <span className="loading loading-spinner"></span>
                    ) : (
                      <PlayCircle />
                    )}
                    Execute Pipeline
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Terminal Logs */}
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
        </div>
      </div>
    </div>
  );
}
