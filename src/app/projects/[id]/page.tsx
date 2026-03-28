'use client';

import { getProject, Project } from '@/app/actions/projects';
import { formatProjectDateRange } from '@/lib/project-dates';
import { AlertCircle, ArrowLeft, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function ProjectDetailPage() {
  const params = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = typeof params.id === 'string' ? params.id : params.id?.[0];
    if (!id) return;

    getProject(id).then((res) => {
      if (res.success && res.data) setProject(res.data);
      else setError(res.error || 'Project not found');
      setIsLoading(false);
    });
  }, [params.id]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="text-center py-20">
        <div className="flex justify-center mb-4 text-error/30">
          <AlertCircle size={48} />
        </div>
        <h3 className="text-lg font-semibold text-base-content/60">{error || 'Project not found'}</h3>
        <Link href="/projects" className="btn btn-sm btn-ghost mt-4 gap-2">
          <ArrowLeft size={16} /> Back to Projects
        </Link>
      </div>
    );
  }

  const formattedDate = formatProjectDateRange(project, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <Link href="/projects" className="btn btn-ghost btn-sm gap-2 text-base-content/60 hover:text-base-content">
          <ArrowLeft size={16} /> Projects
        </Link>
      </div>

      <div className="bg-base-100 border border-base-200 rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-base-content">{project.name}</h2>
            <p className="text-sm text-primary font-medium mt-1 capitalize">{formattedDate}</p>
          </div>
          <div className="badge badge-outline badge-lg shrink-0 gap-1.5 py-3">
            <MapPin size={14} className="text-primary" /> {project.locationName}
          </div>
        </div>

        <div className="divider"></div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-base-200/50 rounded-xl p-4">
            <p className="text-xs uppercase font-bold text-base-content/40 tracking-widest mb-1">Location ID</p>
            <p className="text-sm font-mono text-base-content/70">{project.locationId}</p>
          </div>
          <div className="bg-base-200/50 rounded-xl p-4">
            <p className="text-xs uppercase font-bold text-base-content/40 tracking-widest mb-1">Created</p>
            <p className="text-sm text-base-content/70">
              {new Date(project.$createdAt).toLocaleDateString('ro-RO', { year: 'numeric', month: 'short', day: 'numeric' })}
            </p>
          </div>
          <div className="bg-base-200/50 rounded-xl p-4 sm:col-span-2">
            <p className="text-xs uppercase font-bold text-base-content/40 tracking-widest mb-1">Project Window</p>
            <p className="text-sm text-base-content/70">
              {formatProjectDateRange(project, { year: 'numeric', month: 'short', day: 'numeric' })}
            </p>
          </div>
        </div>

        <div className="mt-6 text-sm text-base-content/40 italic">
          More project details and actions coming soon...
        </div>
      </div>
    </div>
  );
}
