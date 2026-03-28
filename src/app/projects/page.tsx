'use client';

import { getProjects, Project } from '@/app/actions/projects';
import { formatProjectDateRange } from '@/lib/project-dates';
import { ClipboardList, MapPin, Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getProjects().then((res) => {
      if (res.success && res.data) setProjects(res.data);
      else setError(res.error || 'Failed to load projects');
      setIsLoading(false);
    });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-base-content">Projects</h2>
          <p className="text-sm text-base-content/60 mt-1">Manage your Waitwhile projects</p>
        </div>
        <Link href="/projects/new" className="btn btn-primary gap-2 shadow-lg shadow-primary/20">
          <Plus size={18} /> New Project
        </Link>
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <span className="loading loading-spinner loading-lg text-primary"></span>
        </div>
      )}

      {error && <div className="alert alert-error rounded-xl">{error}</div>}

      {!isLoading && !error && projects.length === 0 && (
        <div className="text-center py-20 border-2 border-dashed border-base-300 rounded-2xl">
          <div className="flex justify-center mb-4 text-base-content/20">
            <ClipboardList size={48} />
          </div>
          <h3 className="text-lg font-semibold text-base-content/60">No projects yet</h3>
          <p className="text-sm text-base-content/40 mb-6">Create your first project to get started.</p>
          <Link href="/projects/new" className="btn btn-primary btn-sm">Create Project</Link>
        </div>
      )}

      {!isLoading && projects.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Link
              key={project.$id}
              href={`/projects/${project.$id}`}
              className="card bg-base-100 border border-base-200 shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group"
            >
              <div className="card-body p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="card-title text-base font-bold group-hover:text-primary transition-colors">{project.name}</h3>
                  <span className="badge badge-outline badge-sm shrink-0">
                    {formatProjectDateRange(project, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <p className="text-sm text-base-content/60 flex items-center gap-1.5">
                  <MapPin size={14} className="text-primary/60" /> {project.locationName}
                </p>
                <div className="card-actions justify-end mt-2">
                  <span className="text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">View →</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
