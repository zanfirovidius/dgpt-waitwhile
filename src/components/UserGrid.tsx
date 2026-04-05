'use client';

import { ExtendedUser } from '@/app/page';
import { getWaitwhileRoleLabel } from '@/lib/waitwhile-user-roles';
import { Trash2 } from 'lucide-react';

interface UserGridProps {
  users: ExtendedUser[];
  setUsers: React.Dispatch<React.SetStateAction<ExtendedUser[]>>;
}

export default function UserGrid({ users, setUsers }: UserGridProps) {
  
  const handleRemove = (id: string) => {
    setUsers(users.filter(u => u.id !== id));
  };

  const handlePasswordChange = (id: string, newPassword: string) => {
    setUsers(users.map(u => u.id === id ? { ...u, password: newPassword } : u));
  };

	  if (users.length === 0) {
	    return (
		      <div className="ui-panel-sky flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 py-24 text-center">
	        <p className="ui-section-title text-base-content/70">Nu ai adăugat încă niciun utilizator</p>
	        <p className="ui-body mt-2 text-base-content/45">Folosește una dintre metodele din stânga pentru a pregăti lista de sincronizare.</p>
	      </div>
	    );
	  }

	  return (
	    <div className="max-h-[500px] overflow-x-auto rounded-xl border border-base-200 bg-base-100">
	      <table className="table table-pin-rows table-zebra">
	        <thead>
	          <tr className="bg-base-200 text-base-content/80">
	            <th className="ui-label">Nume</th>
	            <th className="ui-label">Email generat</th>
	            <th className="ui-label">Rol</th>
	            <th className="ui-label">Parolă (opțional)</th>
	            <th className="ui-label w-12 text-center">Acțiune</th>
	          </tr>
	        </thead>
	        <tbody>
	          {users.map((user) => (
	            <tr key={user.id} className="hover">
	              <td className="whitespace-nowrap text-[0.96rem] font-semibold text-base-content">{user.name}</td>
	              <td className="ui-tabular whitespace-nowrap text-[0.88rem] text-base-content/68">{user.email}</td>
	              <td>
		                <span className={`badge badge-sm ui-tabular font-semibold ${user.roles[0] === 'SECRETARIAT' ? 'ui-badge-sky' : 'ui-badge-teal'}`}>
	                  {getWaitwhileRoleLabel(user.roles[0])}
	                </span>
	              </td>
	              <td>
	                <input 
	                  type="text" 
	                  placeholder="Se generează automat dacă rămâne gol" 
	                  className="input input-sm input-bordered ui-tabular w-full max-w-xs bg-base-200/50 text-[0.88rem] focus:bg-base-100"
	                  value={user.password || ''}
	                  onChange={(e) => handlePasswordChange(user.id, e.target.value)}
	                />
              </td>
              <td className="text-center">
                <button 
                  onClick={() => handleRemove(user.id)}
                  className="btn btn-ghost btn-sm btn-square text-error hover:bg-error/20"
                  title="Elimină utilizatorul"
                  aria-label={`Elimină utilizatorul ${user.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
