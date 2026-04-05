'use client';

import { account, teams } from '@/lib/appwrite';
import { clearServerSessionCookie, syncServerSessionFromBrowser } from '@/lib/appwrite-session-client';
import {
  Beaker,
  CalendarRange,
  ClipboardList,
  Heart,
  LayoutTemplate,
  LogOut,
  Mail,
  Menu,
  Package,
  Settings,
  Stethoscope,
  UserMinus,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

interface SessionUser {
  name?: string | null;
  picture?: string | null;
}

type NavItem = {
  exact?: boolean;
  excludePrefixes?: string[];
  href: string;
  icon: LucideIcon;
  label: string;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Gestionare Utilizatori',
    items: [
      { href: '/', icon: UserPlus, label: 'Adaugă Utilizator' },
      { href: '/delete', icon: UserMinus, label: 'Șterge Utilizator' },
      { href: '/sandbox', icon: Beaker, label: 'Sandbox' },
    ],
  },
  {
    title: 'Proiecte',
    items: [
      { href: '/projects', icon: ClipboardList, label: 'Toate Proiectele', excludePrefixes: ['/projects/calendar'] },
      { href: '/projects/calendar', icon: CalendarRange, label: 'Calendar Proiecte', exact: true },
      { href: '/doctors', icon: Stethoscope, label: 'Registru Medici' },
      { href: '/templates', icon: LayoutTemplate, label: 'Bibliotecă Template-uri' },
    ],
  },
  {
    title: 'Date și Resurse',
    items: [{ href: '/resources', icon: Package, label: 'Resurse' }],
  },
  {
    title: 'Feedback Public',
    items: [{ href: '/admin/settings', icon: Settings, label: 'Setări Globale' }],
  },
];

function isItemActive(pathname: string | null, item: NavItem) {
  if (!pathname) {
    return false;
  }

  if (item.excludePrefixes?.some((prefix) => pathname.startsWith(prefix))) {
    return false;
  }

  if (item.exact) {
    return pathname === item.href;
  }

  if (item.href === '/') {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function getUserInitials(name?: string | null) {
  return (name || 'Utilizator')
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function GlobalLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isPublicRoute =
    pathname?.startsWith('/public') ||
    pathname?.startsWith('/auth') ||
    pathname?.startsWith('/f/') ||
    pathname?.startsWith('/a/') ||
    pathname?.startsWith('/t/') ||
    pathname?.startsWith('/i/') ||
    pathname?.startsWith('/v/') ||
    pathname === '/m' ||
    pathname?.startsWith('/m/');
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(!isPublicRoute);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

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
          const isAdmin = userTeams.teams.some((team) => team.$id === adminTeamId);
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
      void checkSession();
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

  const handleLogout = async (event: React.MouseEvent) => {
    event.preventDefault();
    try {
      await account.deleteSession('current');
      await clearServerSessionCookie();
      setSessionUser(null);
      window.location.href = '/public/occupancy';
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  const renderNavigation = (mobile = false) => (
    <nav aria-label="Navigare principală" className="space-y-5">
      {NAV_SECTIONS.map((section) => (
        <div key={section.title} className="space-y-1.5">
          <p className="px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-base-content/40">
            {section.title}
          </p>
          <div className="space-y-1">
            {section.items.map((item) => {
              const active = isItemActive(pathname, item);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'border border-primary/15 bg-primary/10 text-primary'
                      : 'text-base-content/70 hover:bg-base-200 hover:text-base-content'
                  }`}
                >
                  <Icon size={18} className={active ? 'text-primary' : 'text-base-content/50'} />
                  <span className="min-w-0 truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {mobile && sessionUser ? (
        <div className="border-t border-base-200 pt-4">
          <Link
            href="/admin/invite"
            className="flex min-h-11 items-center gap-3 rounded-2xl border border-base-300 px-3 py-2 text-sm font-medium text-base-content/75 transition-colors hover:bg-base-200 hover:text-base-content"
          >
            <Mail size={18} className="text-base-content/50" />
            <span>Invită Admin</span>
          </Link>
        </div>
      ) : null}
    </nav>
  );

  if (isPublicRoute) {
    return <main className="min-h-screen w-full">{children}</main>;
  }

  if (isLoadingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base-200/40 px-4">
        <div className="flex flex-col items-center gap-4 rounded-[2rem] border border-base-200 bg-base-100 px-8 py-10 shadow-sm">
          <span className="loading loading-spinner loading-lg text-primary" />
          <p className="text-center font-medium text-base-content/60">Se verifică accesul...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-base-200/35">
      <header className="sticky top-0 z-40 border-b border-base-200 bg-base-100/95 backdrop-blur">
        <div className="mx-auto flex w-full items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-square lg:hidden"
              aria-label={navOpen ? 'Închide navigarea' : 'Deschide navigarea'}
              onClick={() => setNavOpen((current) => !current)}
            >
              {navOpen ? <X size={18} /> : <Menu size={18} />}
            </button>

            <Link href="/projects" className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 font-black text-primary">
                W
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-base-content">Portal DGPT</div>
                <p className="truncate text-[11px] text-base-content/55">Coordonare proiecte</p>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {sessionUser ? (
              <Link href="/admin/invite" className="btn btn-outline btn-sm hidden sm:inline-flex">
                Invită Admin
              </Link>
            ) : null}

            {sessionUser ? (
              <div className="flex items-center gap-3 rounded-2xl border border-base-200 bg-base-100 px-3 py-2">
                <div className="hidden text-right sm:block">
                  <div className="max-w-40 truncate text-sm font-semibold leading-tight text-base-content">
                    {sessionUser.name}
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="text-xs font-medium text-error transition-colors hover:text-error/80"
                  >
                    Deconectare
                  </button>
                </div>
                <div className="avatar">
                  <div className="h-10 w-10 overflow-hidden rounded-full border border-base-300 bg-base-100">
                    {sessionUser.picture ? (
                      <Image
                        src={sessionUser.picture}
                        alt={`Avatar ${sessionUser.name || 'utilizator'}`}
                        width={40}
                        height={40}
                        unoptimized
                        className="h-full w-full object-cover"
                        sizes="40px"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-black text-base-content/60">
                        {getUserInitials(sessionUser.name)}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="btn btn-ghost btn-sm btn-square sm:hidden"
                  aria-label="Deconectare"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <Link href="/auth/login" className="btn btn-primary btn-sm">
                Autentificare
              </Link>
            )}
          </div>
        </div>
      </header>

      {navOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-base-content/20 backdrop-blur-sm"
            aria-label="Închide meniul"
            onClick={() => setNavOpen(false)}
          />
          <aside className="relative flex h-full w-[min(88vw,20rem)] flex-col border-r border-base-200 bg-base-100 px-4 py-5 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-base-content">Navigare</div>
                <p className="text-xs text-base-content/55">Acces rapid la modulele principale</p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-square"
                aria-label="Închide navigarea"
                onClick={() => setNavOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{renderNavigation(true)}</div>
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 border-r border-base-200 bg-base-100 lg:flex lg:flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">{renderNavigation()}</div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">{children}</div>
        </main>
      </div>

      <footer className="border-t border-base-200 bg-base-100/90">
        <div className="mx-auto flex max-w-[1600px] items-center justify-center gap-1 px-4 py-4 text-sm text-base-content/55">
          Creat cu <Heart size={14} className="fill-error text-error" /> pentru Din Grija Pentru Tine
        </div>
      </footer>
    </div>
  );
}
