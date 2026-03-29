'use client';

import { account, teams } from '@/lib/appwrite';
import { clearServerSessionCookie, syncServerSessionFromBrowser } from '@/lib/appwrite-session-client';
import { 
  UserPlus, 
  UserMinus, 
  Beaker, 
  BarChart3, 
  Package, 
  ClipboardList, 
  PlusCircle, 
  Mail,
  Heart,
  Settings
} from 'lucide-react';
import Link from 'next/link';
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
  const isPublicRoute = pathname?.startsWith('/public') || pathname?.startsWith('/auth') || pathname?.startsWith('/f/') || pathname?.startsWith('/a/') || pathname?.startsWith('/t/');
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(!isPublicRoute);

  useEffect(() => {
    let isCancelled = false;
    let refreshInterval: number | undefined;

    const redirectToLogin = async () => {
      try {
        await clearServerSessionCookie();
      } catch (error) {
        console.warn('Failed to clear server auth cookie', error);
      }

      if (!isCancelled) {
        setSessionUser(null);
        window.location.href = '/auth/login';
      }
    };

    const checkSession = async () => {
      try {
        const user = await account.get();
        await syncServerSessionFromBrowser();
        const adminTeamId = process.env.NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID;
        
        if (adminTeamId) {
          const userTeams = await teams.list();
          const isAdmin = userTeams.teams.some(team => team.$id === adminTeamId);
          if (!isAdmin) {
            await account.deleteSession('current');
            await clearServerSessionCookie();
            throw new Error('Not an admin');
          }
        }

        if (!isCancelled) {
          setSessionUser({
            name: user.name,
            picture: user.prefs?.picture || null,
          });
          setIsLoadingAuth(false);
        }

        refreshInterval = window.setInterval(() => {
          void syncServerSessionFromBrowser().catch(async (error) => {
            console.error('Session refresh failed', error);
            await redirectToLogin();
          });
        }, 10 * 60 * 1000);
      } catch {
        await redirectToLogin();
      }
    };

    if (!isPublicRoute) {
      checkSession();
    } else {
      setIsLoadingAuth(false);
    }

    return () => {
      isCancelled = true;
      if (refreshInterval) {
        window.clearInterval(refreshInterval);
      }
    };
  }, [isPublicRoute]);

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await account.deleteSession('current');
      await clearServerSessionCookie();
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
          <p className="text-base-content/60 font-medium">Se verifică accesul...</p>
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
              <p className="text-[10px] text-base-content/60 leading-tight">Generator Utilizatori DGPT</p>
            </div>
          </div>

          {/* Right: Zone 3 + User */}
          <div className="flex items-center gap-3">
            {sessionUser && (
              <Link href="/admin/invite" className="btn btn-sm btn-outline btn-primary uppercase text-[10px] tracking-wider font-bold hidden sm:inline-flex">
                Invită Admin
              </Link>
            )}

            {sessionUser ? (
              <div className="flex items-center gap-3 pl-3 border-l border-base-200">
                <div className="flex flex-col items-end">
                  <span className="text-sm font-semibold leading-tight">{sessionUser.name}</span>
                  <button type="button" onClick={handleLogout} className="text-[10px] text-error hover:underline uppercase font-bold tracking-wider">Deconectare</button>
                </div>
                <div className="avatar">
                  <div className="w-9 h-9 rounded-full border-2 border-primary overflow-hidden">
                    <img src={sessionUser.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(sessionUser.name || 'User')}`} alt="Avatar" className="w-full h-full object-cover" />
                  </div>
                </div>
              </div>
            ) : (
              <Link href="/auth/login" className="btn btn-sm btn-primary shadow-lg shadow-primary/20">Autentificare</Link>
            )}
          </div>
        </div>
      </header>

      {/* Body: Sidebar + Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-52 shrink-0 bg-base-100 border-r border-base-200 flex flex-col gap-1 py-6 px-3 sticky h-[calc(100vh-57px)] overflow-y-auto">
          {/* Zone 1: Users & Sandbox */}
          <p className="text-[10px] uppercase font-bold text-base-content/40 tracking-widest px-2 mb-1">Gestionare Utilizatori</p>
          <Link href="/" className="btn btn-sm btn-ghost justify-start w-full gap-2 hover:bg-base-200">
            <UserPlus size={16} /> Adaugă Utilizator
          </Link>
          <Link href="/delete" className="btn btn-sm btn-ghost justify-start w-full gap-2 hover:bg-base-200 text-error hover:text-error">
            <UserMinus size={16} /> Șterge Utilizator
          </Link>
          <Link href="/sandbox" className="btn btn-sm btn-ghost justify-start w-full gap-2 hover:bg-base-200 text-info">
            <Beaker size={16} /> Sandbox
          </Link>

          <div className="divider my-2"></div>

          {/* Zone 3: Projects */}
          <p className="text-[10px] uppercase font-bold text-base-content/40 tracking-widest px-2 mb-1">Proiecte</p>
          <Link href="/projects" className="btn btn-sm btn-ghost justify-start w-full gap-2 hover:bg-base-200 text-success">
            <ClipboardList size={16} /> Toate Proiectele
          </Link>
          <Link href="/projects/new" className="btn btn-sm btn-ghost justify-start w-full gap-2 hover:bg-base-200">
            <PlusCircle size={16} /> Proiect Nou
          </Link>

          <div className="divider my-2"></div>

          {/* Zone 2: Occupancy & Resources */}
          <p className="text-[10px] uppercase font-bold text-base-content/40 tracking-widest px-2 mb-1">Date și Resurse</p>
          <Link href="/occupancy" className="btn btn-sm btn-ghost justify-start w-full gap-2 hover:bg-base-200 text-warning">
            <BarChart3 size={16} /> Ocupare
          </Link>
          <Link href="/resources" className="btn btn-sm btn-ghost justify-start w-full gap-2 hover:bg-base-200 text-accent">
            <Package size={16} /> Resurse
          </Link>

          <div className="divider my-2"></div>

          {/* Zone 4: Feedback */}
          <p className="text-[10px] uppercase font-bold text-base-content/40 tracking-widest px-2 mb-1">Feedback Public</p>
          <Link href="/admin/settings" className="btn btn-sm btn-ghost justify-start w-full gap-2 hover:bg-base-200 text-primary">
            <Settings size={16} /> Setări Globale
          </Link>

          {/* Zone 3 on mobile only */}
          {sessionUser && (
            <>
              <div className="divider my-2 sm:hidden"></div>
              <Link href="/admin/invite" className="btn btn-sm btn-outline btn-primary justify-start w-full gap-2 sm:hidden uppercase text-[10px] tracking-wider font-bold">
                <Mail size={16} /> Invită Admin
              </Link>
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
          Creat cu <Heart size={14} className="text-error fill-error" /> pentru Din Grija Pentru Tine
        </p>
      </footer>
    </div>
  );
}
