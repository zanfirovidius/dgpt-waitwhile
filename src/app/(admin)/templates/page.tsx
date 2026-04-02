'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Download,
  FileStack,
  Filter,
  LayoutTemplate,
  Link2,
  Search,
  Trash2,
} from 'lucide-react';
import { FileDropzone } from '@/components/FileDropzone';
import { getPlatformTemplateLibrary } from '@/app/actions/platform-templates';
import type { PlatformTemplateRecord } from '@/lib/platform-template-types';
import {
  getPlatformTemplateCategoryLabel,
  getPlatformTemplateFileTypeLabel,
  PLATFORM_TEMPLATE_CATEGORY_OPTIONS,
  PLATFORM_TEMPLATE_FILE_TYPE_OPTIONS,
} from '@/lib/platform-template-types';

type FlashMessage = {
  type: 'success' | 'error';
  text: string;
};

const CABINET_PLACARD_PLACEHOLDERS = ['{{name}}', '{{cabinet}}', '{{room}}', '{{cabinetCode}}', '{{specialty}}', '{{interval}}', '{{date}}', '{{event}}', '{{location}}'];

export default function PlatformTemplatesPage() {
  const [templates, setTemplates] = useState<PlatformTemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [message, setMessage] = useState<FlashMessage | null>(null);
  const [dropzoneError, setDropzoneError] = useState<string | null>(null);

  const [templateName, setTemplateName] = useState('');
  const [category, setCategory] = useState('cabinet-placard-a4');
  const [description, setDescription] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState('');

  const loadTemplates = useCallback(async () => {
    setLoading(true);

    const result = await getPlatformTemplateLibrary();
    if (!result.success) {
      setMessage({ type: 'error', text: result.error });
      setLoading(false);
      return;
    }

    setTemplates(result.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const filteredTemplates = useMemo(
    () =>
      templates.filter((template) => {
        if (categoryFilter && template.category !== categoryFilter) {
          return false;
        }

        if (fileTypeFilter && template.fileType !== fileTypeFilter) {
          return false;
        }

        if (search) {
          const haystack = [
            template.templateName,
            template.originalFileName,
            template.description || '',
            getPlatformTemplateCategoryLabel(template.category),
          ]
            .join(' ')
            .toLocaleLowerCase('ro-RO');

          return haystack.includes(search.toLocaleLowerCase('ro-RO'));
        }

        return true;
      }),
    [categoryFilter, fileTypeFilter, search, templates],
  );

  const handleFileSelected = async (file: File) => {
    setUploading(true);
    setMessage(null);
    setDropzoneError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('templateName', templateName);
      formData.append('category', category);
      formData.append('description', description);
      if (category === 'cabinet-placard-a4') {
        formData.append('placeholdersJson', JSON.stringify(CABINET_PLACARD_PLACEHOLDERS));
      }

      const response = await fetch('/api/platform-templates', {
        method: 'POST',
        body: formData,
      });
      const payload = (await response.json()) as { success?: boolean; error?: string; data?: PlatformTemplateRecord };

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || 'Template-ul nu a putut fi încărcat.');
      }

      setTemplates((current) => [payload.data!, ...current]);
      setTemplateName('');
      setDescription('');
      setMessage({ type: 'success', text: 'Template-ul a fost adăugat în biblioteca platformei.' });
    } catch (error: unknown) {
      const text = error instanceof Error ? error.message : 'Template-ul nu a putut fi încărcat.';
      setDropzoneError(text);
      setMessage({ type: 'error', text });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteTemplate = async (template: PlatformTemplateRecord) => {
    if (!template.$id) {
      return;
    }

    if (!window.confirm(`Ștergi template-ul "${template.templateName}" din bibliotecă?`)) {
      return;
    }

    setDeletingTemplateId(template.$id);
    setMessage(null);

    try {
      const response = await fetch(`/api/platform-templates/${template.$id}`, {
        method: 'DELETE',
      });
      const payload = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Template-ul nu a putut fi șters.');
      }

      setTemplates((current) => current.filter((item) => item.$id !== template.$id));
      setMessage({ type: 'success', text: 'Template-ul a fost șters din bibliotecă.' });
    } catch (error: unknown) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Template-ul nu a putut fi șters.',
      });
    } finally {
      setDeletingTemplateId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-black text-base-content">
            <LayoutTemplate className="text-primary" size={28} />
            Biblioteca Template-uri
          </h1>
          <p className="mt-1 text-sm text-base-content/60">
            Template-uri master la nivel de platformă, organizate pe categorii, reutilizabile în modulele aplicației.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="rounded-2xl border border-base-300 bg-base-100 px-4 py-3 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-base-content/40">Template-uri</div>
            <div className="mt-1 text-2xl font-black">{templates.length}</div>
          </div>
          <div className="rounded-2xl border border-base-300 bg-base-100 px-4 py-3 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-base-content/40">Categorii</div>
            <div className="mt-1 text-2xl font-black">
              {new Set(templates.map((template) => template.category).filter(Boolean)).size}
            </div>
          </div>
        </div>
      </div>

      {message ? (
        <div className={`alert rounded-2xl text-sm ${message.type === 'success' ? 'alert-success' : 'alert-error'}`}>
          <AlertCircle size={16} />
          <span>{message.text}</span>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.95fr,1.35fr]">
        <div className="space-y-6">
          <div className="rounded-[2rem] border border-base-300 bg-base-100 p-6 shadow-sm">
            <div>
              <h2 className="text-xl font-black text-base-content">Template nou</h2>
              <p className="mt-1 text-sm text-base-content/60">
                Încarci fișierul o singură dată la nivel de platformă și apoi îl poți selecta în proiectele unde este necesar.
              </p>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="form-control">
                <span className="label"><span className="label-text font-medium">Nume template</span></span>
                <input
                  type="text"
                  className="input input-bordered w-full"
                  placeholder="Ex: Planșă cabinet standard 2026"
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                />
              </label>

              <label className="form-control">
                <span className="label"><span className="label-text font-medium">Categorie</span></span>
                <select
                  className="select select-bordered w-full"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  {PLATFORM_TEMPLATE_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-control">
                <span className="label"><span className="label-text font-medium">Descriere</span></span>
                <textarea
                  className="textarea textarea-bordered min-h-24 w-full"
                  placeholder="Unde se folosește, ce conține și eventualele convenții de placeholder."
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
            </div>

            <div className="mt-5">
              <FileDropzone
                accept=".pptx,.docx,.xlsx,.pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf"
                title={uploading ? 'Se încarcă template-ul...' : 'Click sau drag & drop pentru template'}
                subtitle="Acceptă PPTX, DOCX, XLSX și PDF"
                hint={category === 'cabinet-placard-a4' ? 'Pentru planșele A4 de cabinet, placeholder-ele standard sunt salvate automat.' : 'Poți folosi această bibliotecă și pentru alte tipuri de template-uri care vor fi integrate ulterior.'}
                disabled={uploading}
                error={dropzoneError}
                onFileSelected={handleFileSelected}
              />
            </div>

            <div className="mt-5 rounded-[1.5rem] border border-primary/15 bg-primary/5 p-4 text-sm text-base-content/70">
              Pentru categoria <span className="font-bold">Planșe A4 cabinete</span>, aceste template-uri devin selectabile direct în modulul{' '}
              <Link href="/projects" className="link link-primary font-semibold">Cabinete Medicale & Program</Link>.
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-base-300 bg-base-100 p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-xl font-black text-base-content">Registru template-uri</h2>
                <p className="mt-1 text-sm text-base-content/60">
                  Filtrezi, descarci și cureți biblioteca centrală de template-uri.
                </p>
              </div>

              <div className="badge badge-outline badge-lg">{filteredTemplates.length} rezultate</div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[1.2fr,0.8fr,0.8fr]">
              <label className="input input-bordered flex items-center gap-2">
                <Search size={14} className="text-base-content/45" />
                <input
                  type="text"
                  className="grow"
                  placeholder="Caută după nume, fișier sau descriere"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>

              <label className="form-control">
                <select
                  className="select select-bordered w-full"
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                >
                  <option value="">Toate categoriile</option>
                  {PLATFORM_TEMPLATE_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-control">
                <select
                  className="select select-bordered w-full"
                  value={fileTypeFilter}
                  onChange={(event) => setFileTypeFilter(event.target.value)}
                >
                  <option value="">Toate formatele</option>
                  {PLATFORM_TEMPLATE_FILE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 space-y-3">
              {loading ? (
                <div className="flex justify-center py-14">
                  <span className="loading loading-spinner loading-lg text-primary" />
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-base-300 px-5 py-8 text-center text-sm text-base-content/55">
                  <Filter className="mx-auto mb-3 text-base-content/25" size={30} />
                  Nu există template-uri care să corespundă filtrelor curente.
                </div>
              ) : (
                filteredTemplates.map((template) => (
                  <div key={template.$id} className="rounded-[1.5rem] border border-base-300 bg-base-50 p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="badge badge-primary badge-outline">
                            {getPlatformTemplateFileTypeLabel(template.fileType)}
                          </span>
                          <span className="badge badge-ghost">
                            {getPlatformTemplateCategoryLabel(template.category)}
                          </span>
                          <h3 className="text-lg font-black text-base-content">{template.templateName}</h3>
                        </div>
                        <div className="text-sm text-base-content/60">{template.originalFileName}</div>
                        {template.description ? (
                          <p className="text-sm text-base-content/70">{template.description}</p>
                        ) : null}
                        <div className="flex flex-wrap gap-2 text-xs text-base-content/55">
                          <span className="badge badge-ghost">{template.mimeType || 'Tip MIME necunoscut'}</span>
                          <span className="badge badge-ghost">
                            Actualizat: {(template.updatedAt || template.$updatedAt || '').replace('T', ' ').slice(0, 16) || '-'}
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        <a
                          href={`/api/platform-templates/${template.$id}`}
                          className="btn btn-outline btn-sm gap-2"
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download size={14} /> Descarcă
                        </a>
                        {template.category === 'cabinet-placard-a4' ? (
                          <Link href="/projects" className="btn btn-ghost btn-sm gap-2">
                            <Link2 size={14} /> Folosește în proiect
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm gap-2 text-error"
                          onClick={() => void handleDeleteTemplate(template)}
                          disabled={deletingTemplateId === template.$id}
                        >
                          {deletingTemplateId === template.$id ? <span className="loading loading-spinner loading-xs" /> : <Trash2 size={14} />}
                          Șterge
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[2rem] border border-base-300 bg-base-100 p-6 shadow-sm">
            <div className="flex items-center gap-2 text-xl font-black text-base-content">
              <FileStack size={20} className="text-secondary" />
              Convenții utile
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-[1.5rem] border border-base-300 bg-base-50 p-4 text-sm text-base-content/70">
                <div className="font-bold text-base-content">Planșe A4 cabinete</div>
                <p className="mt-2">
                  Salvează aici template-urile PPTX pentru cabinete. Vor putea fi selectate ulterior în proiecte, fără să mai încarci același fișier de fiecare dată.
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-base-300 bg-base-50 p-4 text-sm text-base-content/70">
                <div className="font-bold text-base-content">DOCX / XLSX / PDF</div>
                <p className="mt-2">
                  Aceste template-uri sunt stocate acum centralizat și pot fi integrate ulterior în alte module fără să le reîncarci.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
