'use client';

import { UserPayload, createUser } from '@/app/actions/waitwhile';
import LocationSelector from '@/components/LocationSelector';
import ManualUserForm from '@/components/ManualUserForm';
import PasteTable from '@/components/PasteTable';
import Uploader from '@/components/Uploader';
import UserGrid from '@/components/UserGrid';
import { WAITWHILE_ROLE_OPTIONS } from '@/lib/waitwhile-user-roles';
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
  const [defaultPassword, setDefaultPassword] = useState<string>('');
  const [defaultRole, setDefaultRole] = useState<string>('SECRETARIAT');
  const [emailDomain, setEmailDomain] = useState('dgpt.ro');
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const selectedLocationName = locations.find((location) => location.id === selectedLocation)?.name || '';
  const passwordModeSummary = generateRandomPasswords
    ? 'Parole unice generate automat'
    : defaultPassword.trim()
      ? 'Parolă implicită aplicată unde lipsește'
      : 'Parole generate doar când lipsesc';
  const nextStepSummary = !selectedLocation
    ? 'Alege locația și regulile implicite.'
    : users.length === 0
      ? 'Adaugă utilizatorii în lista de sincronizare.'
      : 'Verifică lista și pornește sincronizarea.';

  // Function to run the Waitwhile sync
  const handleSync = async () => {
    if (!selectedLocation || users.length === 0) return;
    
    setIsProcessing(true);
    setLogs([
      `[Sistem] Pornesc sincronizarea pentru ${users.length} ${users.length === 1 ? 'utilizator' : 'utilizatori'} în locația ${selectedLocationName || selectedLocation}.`,
    ]);

    // Deep copy to allow updates
    const updatedUsers: ExtendedUser[] = [...users];
    const defaultPasswordTrimmed = defaultPassword.trim();

    for (let i = 0; i < updatedUsers.length; i++) {
      const user = updatedUsers[i];
      
      // Determine final password
      const finalPassword = generateRandomPasswords
        ? generateRandomPassword()
        : user.password?.trim()
          ? user.password.trim()
          : defaultPasswordTrimmed
            ? defaultPasswordTrimmed
            : generateRandomPassword();
        
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
        user.syncMessage = 'Cont creat';
        setLogs(prev => [...prev, `[Succes] ${user.email} sincronizat. Parolă: ${finalPassword}`]);
      } else {
        user.syncStatus = 'error';
        user.syncMessage = res.error === 'user_email_exists' ? 'Utilizatorul există deja' : (res.error || 'Nu am putut crea contul');
        setLogs(prev => [...prev, `[Eroare] ${user.email}: ${user.syncMessage}`]);
      }

      // Update state progressively so UI reflects status
      setUsers([...updatedUsers]);
    }

    setIsProcessing(false);
    setLogs(prev => [...prev, '[Sistem] ✅ Sincronizarea s-a încheiat.']);
  };

  return (
    <div className="ui-page-wash mx-auto max-w-7xl space-y-8">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.85fr)]">
        <div className="ui-surface-sky rounded-[1.75rem] border bg-base-100 p-6 shadow-sm sm:p-8">
          <p className="ui-kicker ui-text-sky">
            Sincronizare utilizatori
          </p>
          <h1 className="ui-display-title mt-3 max-w-3xl text-base-content">
            Pregătește lista și rulează sincronizarea Waitwhile într-un singur flux.
          </h1>
          <p className="ui-body mt-3 text-base-content/65">
            Configurezi locația și regulile implicite, adaugi utilizatorii, apoi verifici lista finală înainte de sincronizare.
          </p>
        </div>

        <div className="ui-surface-teal rounded-[1.75rem] border bg-base-100 p-5 shadow-sm sm:p-6">
          <p className="ui-kicker ui-text-teal">Stare curentă</p>
          <div className="mt-4 space-y-4">
            <div className="border-b border-base-200 pb-4">
              <p className="ui-label">Locație</p>
              <p className="mt-1 text-[0.95rem] font-semibold text-base-content">
                {selectedLocationName || 'Nicio locație selectată'}
              </p>
            </div>
            <div className="border-b border-base-200 pb-4">
              <p className="ui-label">Listă pregătită</p>
              <p className="ui-tabular mt-1 text-[0.95rem] font-semibold text-base-content">
                {users.length === 0
                  ? 'Lista este goală'
                  : `${users.length} ${users.length === 1 ? 'utilizator pregătit' : 'utilizatori pregătiți'}`}
              </p>
            </div>
            <div>
              <p className="ui-label">Parole</p>
              <p className="mt-1 text-[0.95rem] font-semibold text-base-content">{passwordModeSummary}</p>
            </div>
          </div>
          <div className="ui-panel-amber mt-5 rounded-2xl border px-4 py-3">
            <p className="ui-label">Următorul pas</p>
            <p className="mt-1 text-[0.95rem] leading-6 text-base-content/65">{nextStepSummary}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(21rem,24rem)_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className="ui-surface-sky rounded-[1.75rem] border bg-base-100 p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-3">
              <div className="ui-icon-chip-sky rounded-2xl p-2">
                <Settings2 size={18} />
              </div>
              <div>
                <p className="ui-kicker ui-text-sky">Pasul 1</p>
                <h2 className="ui-section-title mt-1 text-base-content">Configurare sincronizare</h2>
                <p className="ui-body mt-1 text-base-content/60">
                  Alege locația de lucru și stabilește cum vor fi generate adresele de email și parolele.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
                <div className="ui-panel-sky rounded-2xl border p-4">
                  <LocationSelector
                    selectedLocation={selectedLocation}
                    onChange={setSelectedLocation}
                    onLocationsLoaded={setLocations}
                  />
                </div>

                <div className="ui-panel-sky rounded-2xl border p-4">
	                  <div className="form-control w-full">
	                    <label className="label px-0">
	                      <span className="ui-field-label">Domeniu email generat</span>
	                    </label>
                    <div className="join w-full">
                      <span className="join-item flex items-center border border-base-content/20 bg-base-200 px-3 font-mono text-sm opacity-60">
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
              </div>

              <div className="ui-panel-amber rounded-2xl border px-4 py-3">
                <label className="flex cursor-pointer items-start gap-4">
                  <input
                    type="checkbox"
                    className="toggle toggle-primary mt-1"
                    checked={generateRandomPasswords}
                    onChange={(e) => setGenerateRandomPasswords(e.target.checked)}
                  />
	                  <span className="label-text flex flex-col gap-1">
	                    <span className="ui-field-label text-base-content">Generează parole automat</span>
	                    <span className="ui-body text-base-content/60">
	                      Ignoră parola implicită și creează o parolă unică pentru fiecare cont nou sincronizat.
	                    </span>
                  </span>
                </label>
              </div>
            </div>
          </section>

          <section className="ui-surface-teal rounded-[1.75rem] border bg-base-100 p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-3">
              <div className="ui-icon-chip-teal rounded-2xl p-2">
                <Users size={18} />
              </div>
              <div>
                <p className="ui-kicker ui-text-teal">Pasul 2</p>
                <h2 className="ui-section-title mt-1 text-base-content">Pregătește lista</h2>
                <p className="ui-body mt-1 text-base-content/60">
                  Importă din Excel, adaugă manual sau lipește direct un tabel copiat din foaie.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="ui-panel-teal rounded-2xl border p-4">
	                <label className="label px-0">
	                  <span className="ui-field-label">Rol implicit</span>
	                </label>
                <select
                  className="select select-bordered w-full bg-base-200 focus:bg-base-100"
                  value={defaultRole}
                  onChange={(e) => setDefaultRole(e.target.value)}
                >
                  {WAITWHILE_ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ui-panel-teal rounded-2xl border p-4">
	                <label className="label px-0">
	                  <span className="ui-field-label">Parolă implicită</span>
	                </label>
                <input
                  type="text"
                  className="input input-bordered w-full bg-base-200 font-mono focus:bg-base-100"
                  placeholder="Lasă gol pentru generare automată"
                  value={defaultPassword}
                  onChange={(e) => setDefaultPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="ui-panel-teal mt-6 rounded-2xl border p-2">
              <div role="tablist" className="tabs tabs-boxed bg-transparent p-1">
                <input type="radio" name="input_tabs" role="tab" className="tab font-semibold" aria-label="Import Excel" defaultChecked />
                <div role="tabpanel" className="tab-content px-2 py-5">
                  <Uploader
                    onUsersParsed={(newUsers: ExtendedUser[]) => setUsers([...users, ...newUsers])}
                    selectedLocation={selectedLocation}
                    emailDomain={emailDomain}
                    defaultRole={defaultRole}
                  />
                </div>

                <input type="radio" name="input_tabs" role="tab" className="tab font-semibold whitespace-nowrap" aria-label="Adăugare manuală" />
                <div role="tabpanel" className="tab-content px-2 py-5">
                  <ManualUserForm
                    onAddUser={(user: ExtendedUser) => setUsers([...users, user])}
                    selectedLocation={selectedLocation}
                    emailDomain={emailDomain}
                    defaultRole={defaultRole}
                  />
                </div>

                <input type="radio" name="input_tabs" role="tab" className="tab font-semibold whitespace-nowrap" aria-label="Lipire tabel" />
                <div role="tabpanel" className="tab-content px-2 py-5">
                  <PasteTable
                    onUsersParsed={(newUsers: ExtendedUser[]) => setUsers([...users, ...newUsers])}
                    selectedLocation={selectedLocation}
                    emailDomain={emailDomain}
                    defaultRole={defaultRole}
                  />
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="ui-surface-amber rounded-[1.75rem] border bg-base-100 shadow-sm">
            <div className="border-b border-base-200 p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="ui-kicker ui-text-amber">Pasul 3</p>
                  <h2 className="ui-section-title mt-1 text-base-content">Revizuire și rulare</h2>
                  <p className="ui-body mt-1 text-base-content/60">
                    Verifică lista finală, ajustează parolele unde este nevoie și pornește sincronizarea când totul este pregătit.
                  </p>
                </div>
                {users.length > 0 ? (
                  <button
                    onClick={() => setUsers([])}
                    className="btn btn-ghost btn-sm text-error"
                  >
                    Golește lista
                  </button>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="ui-badge-sky ui-tabular gap-1 px-3 py-3 text-[0.72rem] font-medium">
                  {selectedLocationName || 'Fără locație selectată'}
                </span>
                <span className="ui-badge-teal ui-tabular gap-1 px-3 py-3 text-[0.72rem] font-medium">
                  {users.length === 0 ? 'Lista este goală' : `${users.length} ${users.length === 1 ? 'utilizator' : 'utilizatori'}`}
                </span>
                <span className="ui-badge-amber gap-1 px-3 py-3 text-[0.72rem] font-medium">
                  {passwordModeSummary}
                </span>
              </div>
            </div>

            <div className="p-4 sm:px-6 sm:pb-6">
              <UserGrid
                users={users}
                setUsers={setUsers}
              />

              {users.length > 0 ? (
                <div className="mt-6 flex flex-col gap-4 border-t border-base-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="ui-body text-base-content/60">
                    Verifică emailurile și parolele înainte de rulare. Lista se sincronizează exact în forma afișată aici.
                  </p>
                  <button
                    disabled={!selectedLocation || isProcessing}
                    onClick={handleSync}
                    className="btn ui-btn-brand btn-lg gap-2 rounded-xl shadow-sm"
                  >
                    {isProcessing ? (
                      <span className="loading loading-spinner"></span>
                    ) : (
                      <PlayCircle />
                    )}
                    Rulează sincronizarea
                  </button>
                </div>
              ) : null}
            </div>
          </section>

          <section className="ui-surface-sky rounded-[1.75rem] border bg-base-100 shadow-sm">
            <div className="border-b border-base-200 p-5 sm:p-6">
              <p className="ui-kicker ui-text-sky">Suport</p>
              <h2 className="ui-section-title mt-1 text-base-content">Jurnal sincronizare</h2>
              <p className="ui-body mt-1 text-base-content/60">
                Mesajele apar cronologic în timpul rulării, pentru a verifica rapid ce s-a sincronizat și unde au apărut blocaje.
              </p>
            </div>

            <div className="ui-panel-sky ui-tabular max-h-64 overflow-y-auto rounded-b-[1.75rem] px-4 py-4 font-mono text-[0.82rem] leading-6 sm:px-6">
              {logs.length === 0 ? (
                <p className="opacity-50">Așteaptă rularea sincronizării...</p>
              ) : (
                <div className="space-y-2">
                  {logs.map((log, idx) => (
                    <div
                      key={idx}
                      className={
                        log.includes('[Eroare]')
                          ? 'text-error'
                          : log.includes('[Succes]') || log.includes('✅')
                            ? 'text-success'
                            : 'text-info'
                      }
                    >
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
