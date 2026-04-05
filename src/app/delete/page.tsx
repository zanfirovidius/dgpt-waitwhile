'use client';

import { deleteUser, getAllUsers } from '@/app/actions/waitwhile';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

export default function DeleteUsersPage() {
  const queryClient = useQueryClient();
  const [filterDomain, setFilterDomain] = useState('@dgpt');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  const { data: usersData, isLoading, isError, refetch } = useQuery({
    queryKey: ['waitwhile-users'],
    queryFn: async () => {
      // SDK max limit per request is usually 100
      const res = await getAllUsers(100);
      if (!res.success) throw new Error(res.error);
      return res.data || [];
    },
  });

  // Filter users by domain
  const filteredUsers = useMemo(() => {
    const users = usersData ?? [];
    if (!filterDomain) return users;
    return users.filter((user) => user.email.toLowerCase().includes(filterDomain.toLowerCase()));
  }, [usersData, filterDomain]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // Handle Selection
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const allIds = new Set(filteredUsers.map(u => u.id));
      setSelectedUserIds(allIds);
    } else {
      setSelectedUserIds(new Set());
    }
  };

  const handleSelectOne = (id: string) => {
    const newPaths = new Set(selectedUserIds);
    if (newPaths.has(id)) {
      newPaths.delete(id);
    } else {
      newPaths.add(id);
    }
    setSelectedUserIds(newPaths);
  };

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      setLogs([`[System] Commencing bulk deletion of ${userIds.length} users + FireBase records...`]);
      const results = await Promise.all(userIds.map(id => deleteUser(id)));
      const failed = results.filter(r => !r.success);
      if (failed.length > 0) {
        setLogs(prev => [...prev, `[System] ❌ Operation finished with ${failed.length} errors.`]);
        throw new Error(`Failed to delete ${failed.length} users.`);
      }
      return true;
    },
    onSuccess: () => {
      setLogs(prev => [...prev, `[System] ✅ Successfully wiped selected users from Waitwhile and Firebase.`]);
      setIsModalOpen(false);
      setSelectedUserIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['waitwhile-users'] });
      refetch();
    },
    onError: (err: unknown) => {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setLogs(prev => [...prev, `[System] ❌ Error: ${errorMessage}`]);
    },
  });

  const handleDeleteConfirmed = () => {
    deleteMutation.mutate(Array.from(selectedUserIds));
  };

  return (
    <div className="space-y-6">
      <div className="card bg-base-100 shadow-xl border border-base-200">
        <div className="card-body">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Trash2 className="text-error" /> Remove Users
              </h1>
              <p className="text-base-content/60 text-sm mt-1">
                Filter by domain and permanently delete users from Waitwhile and Firebase.
              </p>
            </div>

            <div className="join w-full sm:w-auto">
              <span className="join-item bg-base-200 border border-base-content/20 flex items-center px-4">
                <Search size={16} />
              </span>
              <input 
                type="text" 
                className="input input-bordered join-item w-full sm:w-64 bg-base-200 focus:bg-base-100" 
                placeholder="Filter domain (e.g. @dgpt.ro)"
                value={filterDomain}
                onChange={(e) => {
                  setFilterDomain(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>

          <div className="divider my-2"></div>

          {/* Actions Bar */}
          <div className="flex justify-between items-center bg-base-200/50 p-3 rounded-xl border border-base-content/5 mb-4">
            <div className="text-sm font-medium">
              <span className="text-primary">{selectedUserIds.size}</span> users selected
            </div>
            <button 
              className="btn btn-error btn-sm w-32"
              disabled={selectedUserIds.size === 0 || deleteMutation.isPending}
              onClick={() => setIsModalOpen(true)}
            >
              <Trash2 size={16} /> Delete
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto border border-base-200 rounded-xl bg-base-200/20">
            <table className="table table-sm sm:table-md w-full">
              <thead className="bg-base-200 text-base-content uppercase font-semibold text-xs h-12">
                <tr>
                  <th className="w-12 text-center">
                    <input 
                      type="checkbox" 
                      className="checkbox checkbox-sm checkbox-primary"
                      checked={selectedUserIds.size > 0 && selectedUserIds.size === filteredUsers.length}
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th className="hidden sm:table-cell">Phone</th>
                  <th className="hidden lg:table-cell">Created</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12">
                      <span className="loading loading-spinner loading-lg text-primary"></span>
                    </td>
                  </tr>
                ) : isError ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-error">
                      Failed to load users. Try refreshing.
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-base-content/60">
                      No users found matching this domain.
                    </td>
                  </tr>
                ) : (
                  paginatedUsers.map(user => (
                    <tr key={user.id} className={`hover:bg-base-200/50 transition-colors ${selectedUserIds.has(user.id) ? 'bg-primary/5' : ''}`}>
                      <td className="text-center">
                        <input 
                          type="checkbox" 
                          className="checkbox checkbox-sm checkbox-primary"
                          checked={selectedUserIds.has(user.id)}
                          onChange={() => handleSelectOne(user.id)}
                        />
                      </td>
                      <td className="font-medium whitespace-nowrap">{user.name}</td>
                      <td className="text-sm opacity-80">{user.email}</td>
                      <td className="text-xs font-semibold opacity-80">{user.roles && user.roles.length > 0 ? user.roles[0] : '-'}</td>
                      <td className="hidden sm:table-cell font-mono text-xs opacity-80">{user.phone || '-'}</td>
                      <td className="hidden lg:table-cell text-xs opacity-60">
                        {new Date(user.created).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6 px-2">
              <span className="text-sm opacity-60">
                Showing <strong className="opacity-100">{startIndex + 1}</strong> to <strong className="opacity-100">{Math.min(startIndex + ITEMS_PER_PAGE, filteredUsers.length)}</strong> of <strong className="opacity-100">{filteredUsers.length}</strong> matching users
              </span>
              <div className="flex items-center gap-2 bg-base-200/50 p-1 rounded-lg border border-base-content/5">
                <button 
                  className="btn btn-sm btn-ghost hover:bg-base-100"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={safeCurrentPage === 1}
                >
                  « Prev
                </button>
                <div className="px-2 text-sm font-medium opacity-80">
                  Page {safeCurrentPage} / {totalPages}
                </div>
                <button 
                  className="btn btn-sm btn-ghost hover:bg-base-100"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={safeCurrentPage === totalPages}
                >
                  Next »
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* DaisyUI Confirmation Modal */}
      <dialog className={`modal ${isModalOpen ? 'modal-open' : ''}`}>
        <div className="modal-box border border-error/20">
          <h3 className="font-bold text-lg flex items-center gap-2 text-error">
            <AlertCircle /> Confirm Deletion
          </h3>
          <p className="py-4 text-base-content/80">
            Are you absolutely sure you want to permanently delete <strong>{selectedUserIds.size}</strong> users? 
            This action will remove them from Waitwhile and Firebase permanently.
          </p>
          
          {deleteMutation.isError && (
             <div className="alert alert-error text-sm py-2 mb-4">
               {deleteMutation.error.message}
             </div>
          )}

          <div className="modal-action">
             <button 
               className="btn btn-ghost" 
               disabled={deleteMutation.isPending}
               onClick={() => setIsModalOpen(false)}
             >
               Cancel
             </button>
             <button 
               className="btn btn-error gap-2 text-white shadow-lg shadow-error/20"
               onClick={handleDeleteConfirmed}
               disabled={deleteMutation.isPending}
             >
               {deleteMutation.isPending ? <span className="loading loading-spinner"></span> : <Trash2 size={16} />}
               Yes, Delete Forever
             </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={() => setIsModalOpen(false)}>close</button>
        </form>
      </dialog>

      {/* Terminal Logs */}
      <div className="mockup-code bg-base-300 text-base-content border border-base-200 shadow-xl mt-6 w-full">
        <div className="px-5 mb-2 opacity-50 text-xs">Pipeline Operations Logs</div>
        <div className="max-h-64 overflow-y-auto">
          {logs.length === 0 ? (
            <pre data-prefix="$"><code className="opacity-50">Waiting for commands...</code></pre>
          ) : (
            logs.map((log, idx) => (
              <pre data-prefix={log.includes('❌') ? "!" : ">"} key={idx} className={log.includes('❌') ? 'text-error font-semibold' : log.includes('✅') ? 'text-success' : 'text-info'}>
                <code>{log}</code>
              </pre>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
