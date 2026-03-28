'use client';

import { account, teams } from '@/lib/appwrite';
import { 
  UserPlus, 
  UserMinus, 
  Beaker, 
  BarChart3, 
  Package, 
  ClipboardList, 
  PlusCircle, 
  Mail,
  ChevronRight,
  Heart
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

interface SessionUser {
  name?: string | null;
  picture?: string | null;
}

export function GlobalLayoutWrapper({ 
  children, 
}: { 
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isPublicRoute = pathname?.startsWith('/public') || pathname?.startsWith('/auth');
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(!isPublicRoute);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const user = await account.get();
        const adminTeamId = process.env.NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID;
        
        if (adminTeamId) {
          const userTeams = await teams.list();
          const isAdmin = userTeams.teams.some(team => team.$id === adminTeamId);
          if (!isAdmin) {
            await account.deleteSession('current');
            throw new Error('Not an admin');
          }
        }

        setSessionUser({
          name: user.name,
          picture: user.prefs?.picture || null,
        });
        setIsLoadingAuth(false);
      } catch {
        setSessionUser(null);
        window.location.href = '/auth/login';
      }
    };
    if (!isPublicRoute) {
      checkSession();
    }
  }, [isPublicRoute]);

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await account.deleteSession('current');
      setSessionUser(null);
      window.location.href = '/public/occupancy'; // redirect to public occupancy or login
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  if (isPublicRoute) {
    return (
      <main className="flex-1 w-full min-h-screen">
        {children}
      </main>
    );
  }

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-300">
        <div className="flex flex-col items-center gap-4">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="text-base-content/60 font-medium">Verifying access...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top Header: Branding + User Zone */}
      <header className="bg-base-100 shadow-sm border-b border-base-200 z-30 sticky top-0">
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-primary-content font-bold text-lg shadow-lg shrink-0">
              W
            </div>
            <div>
              <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary leading-tight">Waitwhile Sync</h1>
              <p className="text-[10px] text-base-content/60 leading-tight">DGPT User Generator</p>
            </div>
          </div>

          {/* Right: Zone 3 + User */}
          <div className="flex items-center gap-3">
            {sessionUser && (
              <a href="/admin/invite" className="btn btn-sm btn-outline btn-primary uppercase text-[10px] tracking-wider font-bold hidden sm:inline-flex">
                Invite Admin
              </a>
            )}

            {sessionUser ? (
              <div className="flex items-center gap-3 pl-3 border-l border-base-200">
                <div className="flex flex-col items-end">
                  <span className="text-sm font-semibold leading-tight">{sessionUser.name}</span>
                  <a href="#" onClick={handleLogout} className="text-[10px] text-error hover:underline uppercase font-bold tracking-wider">Log Out</a>
                </div>
                <div className="avatar">
                  <div className="w-9 h-9 rounded-full border-2 border-primary overflow-hidden">
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

      {/* Body: Sidebar + Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-52 shrink-0 bg-base-100 border-r border-base-200 flex flex-col gap-1 py-6 px-3 sticky h-[calc(100vh-57px)] overflow-y-auto">
          {/* Zone 1: Users & Sandbox */}
          <p className="text-[10px] uppercase font-bold text-base-content/40 tracking-widest px-2 mb-1">User Management</p>
          <a href="/" className="btn btn-sm btn-ghost justify-start w-full gap-2 hover:bg-base-200">
            <UserPlus size={16} /> Add User
          </a>
          <a href="/delete" className="btn btn-sm btn-ghost justify-start w-full gap-2 hover:bg-base-200 text-error hover:text-error">
            <UserMinus size={16} /> Remove User
          </a>
          <a href="/sandbox" className="btn btn-sm btn-ghost justify-start w-full gap-2 hover:bg-base-200 text-info">
            <Beaker size={16} /> Sandbox
          </a>

          <div className="divider my-2"></div>

          {/* Zone 3: Projects */}
          <p className="text-[10px] uppercase font-bold text-base-content/40 tracking-widest px-2 mb-1">Projects</p>
          <a href="/projects" className="btn btn-sm btn-ghost justify-start w-full gap-2 hover:bg-base-200 text-success">
            <ClipboardList size={16} /> All Projects
          </a>
          <a href="/projects/new" className="btn btn-sm btn-ghost justify-start w-full gap-2 hover:bg-base-200">
            <PlusCircle size={16} /> New Project
          </a>

          <div className="divider my-2"></div>

          {/* Zone 2: Occupancy & Resources */}
          <p className="text-[10px] uppercase font-bold text-base-content/40 tracking-widest px-2 mb-1">Data & Resources</p>
          <a href="/occupancy" className="btn btn-sm btn-ghost justify-start w-full gap-2 hover:bg-base-200 text-warning">
            <BarChart3 size={16} /> Occupancy
          </a>
          <a href="/resources" className="btn btn-sm btn-ghost justify-start w-full gap-2 hover:bg-base-200 text-accent">
            <Package size={16} /> Resources
          </a>

          {/* Zone 3 on mobile only */}
          {sessionUser && (
            <>
              <div className="divider my-2 sm:hidden"></div>
              <a href="/admin/invite" className="btn btn-sm btn-outline btn-primary justify-start w-full gap-2 sm:hidden uppercase text-[10px] tracking-wider font-bold">
                <Mail size={16} /> Invite Admin
              </a>
            </>
          )}
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-8xl mx-auto px-6 py-8">
            {children}
          </div>
        </main>
      </div>

      <footer className="py-4 text-center text-sm text-base-content/50 border-t border-base-200 bg-base-100">
        <p className="flex items-center justify-center gap-1">
          Generated with <Heart size={14} className="text-error fill-error" /> for Din Grija Pentru Tine
        </p>
      </footer>
    </div>
  );
}
