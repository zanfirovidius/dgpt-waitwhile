import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { IncidentReportContext } from '@/lib/incident-types';

export function generateIncidentReportPdf(context: IncidentReportContext) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const marginX = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - marginX * 2;
  const incident = context.incident;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('RAPORT INCIDENT GDPR / SECURITATE', pageWidth / 2, 18, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`ID incident: ${incident.$id || '-'}`, pageWidth / 2, 24, { align: 'center' });

  let cursorY = 34;

  cursorY = addSectionTitle(doc, '1. Context incident', marginX, cursorY);
  cursorY = addKeyValueLines(
    doc,
    [
      ['Eveniment', incident.eventName || context.projectName || '-'],
      ['Proiect', context.projectSlug || '-'],
      ['Locatie', incident.location || '-'],
      ['Raportat la', formatDateTime(incident.reportedAt)],
      ['Descoperit la', formatDateTime(incident.discoveredAt)],
      ['Tip incident', incident.incidentType || '-'],
      ['Status', incident.status || '-'],
    ],
    marginX,
    cursorY,
    usableWidth,
  );

  cursorY += 2;
  cursorY = addSectionTitle(doc, '2. Persoana care a raportat', marginX, cursorY);
  cursorY = addKeyValueLines(
    doc,
    [
      ['Nume', incident.reporterName || '-'],
      ['Rol', incident.reporterRole || '-'],
      ['Contact', incident.reporterContact || '-'],
    ],
    marginX,
    cursorY,
    usableWidth,
  );

  cursorY += 2;
  cursorY = addSectionTitle(doc, '3. Date afectate si descriere', marginX, cursorY);
  cursorY = addKeyValueLines(
    doc,
    [
      ['Categorii afectate', formatList(incident.affectedCategories)],
      ['Numar aproximativ persoane', String(incident.affectedCount || 0)],
      ['Tipuri de date', formatList(incident.dataTypes)],
    ],
    marginX,
    cursorY,
    usableWidth,
  );

  cursorY += 1;
  cursorY = addParagraph(doc, 'Descriere incident', incident.description || '-', marginX, cursorY, usableWidth);
  cursorY = addParagraph(doc, 'Actiuni imediate', incident.immediateActions || '-', marginX, cursorY, usableWidth);

  cursorY += 2;
  cursorY = addSectionTitle(doc, '4. Evaluare DPO', marginX, cursorY);
  cursorY = addKeyValueLines(
    doc,
    [
      ['Responsabil DPO', context.organizer.dpoName || incident.dpoNameSnapshot || '-'],
      ['Email DPO', context.organizer.dpoEmail || incident.dpoEmailSnapshot || '-'],
      ['Nivel risc', incident.riskLevel || '-'],
      ['Necesita notificare autoritate', booleanLabel(incident.requiresNotification)],
      ['Deadline notificare', formatDateTime(incident.notificationDeadline)],
      ['Evaluat la', formatDateTime(incident.evaluatedAt)],
      ['Notificare autoritate transmisa la', formatDateTime(incident.authorityNotifiedAt)],
      ['Referinta notificare autoritate', incident.authorityNotificationReference || '-'],
      ['Status notificare DPO', incident.notificationStatus || '-'],
    ],
    marginX,
    cursorY,
    usableWidth,
  );

  cursorY = addParagraph(doc, 'Note DPO', incident.dpoNotes || '-', marginX, cursorY, usableWidth);

  if (cursorY > pageHeight - 30) {
    doc.addPage();
    cursorY = 20;
  }

  cursorY += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('5. Operator / organizator', marginX, cursorY);
  cursorY += 6;

  doc.setFont('helvetica', 'normal');
  const organizerLines = [
    `Nume: ${context.organizer.operatorName || '-'}`,
    `Denumire legala: ${context.organizer.operatorLegalName || '-'}`,
    `CIF: ${context.organizer.operatorTaxId || '-'}`,
    `Adresa: ${context.organizer.operatorAddress || '-'}`,
    `Telefon: ${context.organizer.operatorPhone || '-'}`,
  ];
  doc.text(organizerLines, marginX, cursorY);
  cursorY += organizerLines.length * 5 + 6;

  autoTable(doc, {
    startY: cursorY,
    head: [['Criteriu audit', 'Valoare']],
    body: [
      ['ID incident', incident.$id || '-'],
      ['Creat in platforma la', formatDateTime(incident.$createdAt || incident.reportedAt)],
      ['Ultima actualizare', formatDateTime(incident.$updatedAt)],
      ['Arhivat la', formatDateTime(incident.archivedAt)],
    ],
    margin: { left: marginX, right: marginX },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [31, 41, 55], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 54 },
      1: { cellWidth: usableWidth - 54 },
    },
  });

  return Buffer.from(doc.output('arraybuffer'));
}

function addSectionTitle(doc: jsPDF, title: string, x: number, y: number) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(title, x, y);
  return y + 6;
}

function addKeyValueLines(
  doc: jsPDF,
  lines: Array<[string, string]>,
  x: number,
  y: number,
  maxWidth: number,
) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);

  let cursorY = y;
  for (const [label, value] of lines) {
    const content = `${label}: ${value || '-'}`;
    const textLines = doc.splitTextToSize(content, maxWidth);
    doc.text(textLines, x, cursorY);
    cursorY += textLines.length * 5;
  }

  return cursorY;
}

function addParagraph(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`${label}:`, x, y);
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(value || '-', maxWidth);
  doc.text(lines, x, y + 5);
  return y + lines.length * 5 + 10;
}

function formatDateTime(value?: string) {
  if (!value) {
    return '-';
  }

  try {
    return format(new Date(value), 'dd.MM.yyyy HH:mm', { locale: ro });
  } catch {
    return value;
  }
}

function formatList(values?: string[]) {
  return values && values.length > 0 ? values.join(', ') : '-';
}

function booleanLabel(value?: boolean) {
  if (value === true) {
    return 'DA';
  }

  if (value === false) {
    return 'NU';
  }

  return '-';
}
