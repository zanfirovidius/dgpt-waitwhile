'use client';

import { ExtendedUser } from '@/app/page';
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
      <div className="flex flex-col items-center justify-center p-12 py-24 border-2 border-dashed border-base-300 rounded-2xl bg-base-200/50">
        <p className="text-base-content/50 font-medium">No users added yet</p>
        <p className="text-sm text-base-content/40 mt-1 text-center">Use the panel on the left to add users from an Excel file or manually.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-base-200 bg-base-100 max-h-[500px]">
      <table className="table table-pin-rows table-zebra">
        <thead>
          <tr className="bg-base-200 text-base-content/80">
            <th>Name</th>
            <th>Email / Phone</th>
            <th>Role</th>
            <th>Password (Optional)</th>
            <th className="w-12 text-center">Action</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="hover">
              <td className="font-medium whitespace-nowrap">{user.name}</td>
              <td className="whitespace-nowrap text-sm text-base-content/70">{user.email}</td>
              <td>
                <span className={`badge badge-sm font-semibold ${user.roles[0] === 'SECRETARIAT' ? 'badge-primary' : 'badge-secondary'}`}>
                  {user.roles[0]}
                </span>
              </td>
              <td>
                <input 
                  type="text" 
                  placeholder="Will auto-generate if empty" 
                  className="input input-sm input-bordered w-full max-w-xs focus:bg-base-100 bg-base-200/50"
                  value={user.password || ''}
                  onChange={(e) => handlePasswordChange(user.id, e.target.value)}
                />
              </td>
              <td className="text-center">
                <button 
                  onClick={() => handleRemove(user.id)}
                  className="btn btn-ghost btn-sm btn-square text-error hover:bg-error/20"
                  title="Remove User"
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
