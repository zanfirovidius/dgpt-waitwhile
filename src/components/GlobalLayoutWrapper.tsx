'use client';

import { usePathname } from 'next/navigation';

interface SessionUser {
  name?: string | null;
  picture?: string | null;
}

export function GlobalLayoutWrapper({ 
  children, 
  sessionUser 
}: { 
  children: React.ReactNode;
  sessionUser?: SessionUser | null;
}) {
  const pathname = usePathname();
  const isPublicRoute = pathname?.startsWith('/public');

  if (isPublicRoute) {
    return (
      <main className="flex-1 w-full min-h-screen">
        {children}
      </main>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-base-100 shadow-sm border-b border-base-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-primary-content font-bold text-xl shadow-lg shrink-0">
              W
            </div>
            <div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">Waitwhile Sync</h1>
              <p className="text-xs text-base-content/60">DGPT User Generator</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-2 bg-base-200/50 p-1 rounded-lg border border-base-content/5 overflow-x-auto whitespace-nowrap hide-scrollbar">
              <a href="/" className="btn btn-sm btn-ghost hover:bg-base-100">Add Users</a>
              <a href="/occupancy" className="btn btn-sm btn-ghost hover:bg-base-100 text-warning">Occupancy</a>
              <a href="/resources" className="btn btn-sm btn-ghost hover:bg-base-100 text-accent">Resources</a>
              <a href="/sandbox" className="btn btn-sm btn-ghost hover:bg-base-100 text-info">Sandbox</a>
              <a href="/delete" className="btn btn-sm btn-ghost hover:bg-base-100 text-error hover:text-error">Remove Users</a>
            </nav>
            
            {sessionUser ? (
              <div className="flex items-center gap-3 pl-4 border-l border-base-200">
                <div className="flex flex-col items-end">
                   <span className="text-sm font-semibold leading-tight">{sessionUser.name}</span>
                   <a href="/auth/logout" className="text-[10px] text-error hover:underline uppercase font-bold tracking-wider">Log Out</a>
                </div>
                <div className="avatar">
                  <div className="w-10 h-10 rounded-full border-2 border-primary overflow-hidden">
                    <img src={sessionUser.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(sessionUser.name || 'User')}`} alt="Avatar" className="w-full h-full object-cover" />
                  </div>
                </div>
              </div>
            ) : (
              <a href="/auth/login" className="btn btn-sm btn-primary shadow-lg shadow-primary/20">Log In</a>
            )}
          </div>
        </div>
      </header>
      
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        {children}
      </main>
      
      <footer className="py-6 text-center text-sm text-base-content/50 border-t border-base-200 bg-base-100 mt-auto">
        <p>Generated with ❤️ for Din Grija Pentru Tine</p>
      </footer>
    </div>
  );
}
