'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, BarChart3 } from 'lucide-react';
import { getProject, Project } from '@/app/actions/projects';
import { OccupancyDashboard } from '@/components/occupancy/OccupancyDashboard';

export default function ProjectOccupancyPage() {
  const params = useParams();
  const projectId = typeof params.id === 'string' ? params.id : params.id?.[0];
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState(projectId ? '' : 'Proiectul nu a fost găsit.');

  useEffect(() => {
    if (!projectId) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const result = await getProject(projectId);
      if (cancelled) {
        return;
      }

      if (!result.success || !result.data) {
        setError(result.error || 'Proiectul nu a fost găsit.');
        setLoading(false);
        return;
      }

      setProject(result.data);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (!project || error) {
    return (
      <div className="py-20 text-center">
        <AlertCircle className="mx-auto mb-4 text-error/40" size={44} />
        <h2 className="text-xl font-black">{error || 'Proiectul nu a fost găsit.'}</h2>
        <Link href="/projects" className="btn btn-ghost btn-sm mt-4 gap-2">
          <ArrowLeft size={14} /> Înapoi la proiecte
        </Link>
      </div>
    );
  }

  if (!project.locationId) {
    return (
      <div className="space-y-6">
        <div>
          <Link href={`/projects/${project.$id}`} className="btn btn-ghost btn-sm gap-2 px-0">
            <ArrowLeft size={14} /> Înapoi la proiect
          </Link>
          <h1 className="mt-3 flex items-center gap-3 text-3xl font-black text-base-content">
            <BarChart3 className="text-warning" size={28} />
            Ocupare cabinete
          </h1>
        </div>

        <div className="rounded-2xl border border-warning/20 bg-warning/5 p-6 text-sm text-base-content shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 text-warning" size={18} />
            <div className="space-y-3">
              <p className="font-semibold">Acest proiect nu are încă o locație Waitwhile asociată.</p>
              <p className="text-base-content/70">
                Deschide proiectul, intră în modul de editare și selectează locația Waitwhile pentru a putea calcula occupancy.
              </p>
              <Link href={`/projects/${project.$id}`} className="btn btn-warning btn-sm gap-2">
                Configurează locația
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/projects/${project.$id}`} className="btn btn-ghost btn-sm gap-2 px-0">
          <ArrowLeft size={14} /> Înapoi la proiect
        </Link>
        <h1 className="mt-3 flex items-center gap-3 text-3xl font-black text-base-content">
          <BarChart3 className="text-warning" size={28} />
          Ocupare cabinete
        </h1>
        <p className="mt-1 text-sm text-base-content/60">
          Dashboard-ul este preconfigurat din locația și perioada proiectului, dar poți ajusta intervalul dacă ai nevoie de analiză punctuală.
        </p>
      </div>

      <OccupancyDashboard
        autoDateFromLocation={false}
        hideLocationSelector
        headerTitle={project.eventName || project.name}
        headerDescription="Grad de ocupare Waitwhile pentru locația proiectului și perioada curentă a evenimentului."
        initialLocationId={project.locationId}
        initialLocationName={project.locationName}
        initialFromDate={project.startDate || project.date}
        initialToDate={project.endDate || project.startDate || project.date}
      />
    </div>
  );
}
