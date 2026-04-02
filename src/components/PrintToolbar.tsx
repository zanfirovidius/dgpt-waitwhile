'use client';

import Link from 'next/link';
import { ArrowLeft, Download } from 'lucide-react';

type PrintToolbarProps = {
  backHref: string;
  pdfHref?: string;
};

export function PrintToolbar({ backHref, pdfHref }: PrintToolbarProps) {
  return (
    <div className="print:hidden flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-base-300 bg-base-100 px-4 py-3 shadow-sm">
      <Link href={backHref} className="btn btn-ghost btn-sm gap-2">
        <ArrowLeft size={14} /> Înapoi la cabinete
      </Link>
      {pdfHref ? (
        <a href={pdfHref} className="btn btn-outline btn-sm gap-2">
          <Download size={14} /> PDF checklist
        </a>
      ) : <div />}
    </div>
  );
}
