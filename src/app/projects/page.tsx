'use client';

import { getProjects, deleteProject, Project } from '@/app/actions/projects';
import { NewProjectModal } from '@/components/projects/NewProjectModal';
import { ProjectTagBadges } from '@/components/projects/ProjectTagBadges';
import { formatProjectDateRange } from '@/lib/project-dates';
import { getProjectStatusBadgeClass, getProjectStatusLabel } from '@/lib/project-status';
import { ClipboardList, MapPin, Plus, Trash2, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

export default function ProjectsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const isCreateModalOpen = searchParams.get('new') === '1';

  const projectsPath = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('new');
    const queryString = params.toString();

    return queryString ? `/projects?${queryString}` : '/projects';
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const res = await getProjects();

      if (cancelled) {
        return;
      }

      if (res.success && res.data) {
        setProjects(res.data);
        setError('');
      } else {
        setError(res.error || 'Failed to load projects');
      }

      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this project? All associated data will be lost.')) return;
    
    const res = await deleteProject(id);
    if (res.success) {
      setProjects(projects.filter(p => p.$id !== id));
    } else {
      alert(res.error || 'Failed to delete');
    }
  };

  const openCreateModal = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('new', '1');
    const queryString = params.toString();
    router.push(queryString ? `/projects?${queryString}` : '/projects?new=1');
  };

  const closeCreateModal = () => {
    router.replace(projectsPath);
  };

  const handleCreated = (projectId: string) => {
    router.push(`/projects/${projectId}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-base-content">Proiecte</h2>
          <p className="text-sm text-base-content/60 mt-1">Gestionați proiectele dvs. Waitwhile</p>
        </div>
        <button type="button" onClick={openCreateModal} className="btn btn-primary gap-2 shadow-lg shadow-primary/20">
          <Plus size={18} /> Proiect Nou
        </button>
      </div>

      {isLoading && projects.length === 0 && (
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
          <h3 className="text-lg font-semibold text-base-content/60">Niciun proiect momentan</h3>
          <p className="text-sm text-base-content/40 mb-6">Creați primul proiect pentru a începe.</p>
          <button type="button" onClick={openCreateModal} className="btn btn-primary btn-sm">Creează Proiect</button>
        </div>
      )}

      {!isLoading && projects.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <div
              key={project.$id}
              className="card bg-base-100 border border-base-200 shadow-sm hover:shadow-md hover:border-primary/30 transition-all group relative overflow-hidden"
            >
              <div className="card-body p-6">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <Link href={`/projects/${project.$id}`} className="flex-1">
                    <h3 className="card-title text-base font-bold group-hover:text-primary transition-colors leading-tight">
                        {project.name}
                    </h3>
                  </Link>
                  <button 
                    onClick={(e) => handleDelete(e, project.$id)}
                    className="btn btn-ghost btn-xs text-error/20 hover:text-error hover:bg-error/5 -mr-2"
                    title="Șterge Proiect"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

	                <div className="space-y-2 mb-4">
	                    <p className="text-xs text-base-content/50 flex items-center gap-1.5 line-clamp-1">
	                        <MapPin size={12} className="text-primary/40 shrink-0" /> {project.locationName || 'Fără locație Waitwhile'}
	                    </p>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-base-content/30">
                            {formatProjectDateRange(project, { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                    </div>
                    <ProjectTagBadges tags={project.projectTags} compact className="pt-1" />
                </div>

                <div className="card-actions pt-2 border-t border-base-200 mt-auto items-center justify-between">
                  <div className="flex flex-wrap gap-2">
                    <div className={`badge badge-sm text-[9px] font-bold uppercase ${getProjectStatusBadgeClass(project.projectStatus)}`}>
                      {getProjectStatusLabel(project.projectStatus)}
                    </div>
                    <div className={`badge badge-ghost badge-sm text-[9px] font-bold uppercase ${project.publicFeedbackFormStatus === 'active' ? 'text-success bg-success/5' : 'opacity-40'}`}>
                      Feedback {project.publicFeedbackFormStatus || 'draft'}
                    </div>
                  </div>
                  <Link href={`/projects/${project.$id}`} className="btn btn-primary btn-xs opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                    Gestionați <ArrowRight size={10} />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <NewProjectModal
        isOpen={isCreateModalOpen}
        onClose={closeCreateModal}
        onCreated={handleCreated}
      />
    </div>
  );
}
