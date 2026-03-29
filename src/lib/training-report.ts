import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { TrainingReportContext } from '@/lib/training-types';

export function generateTrainingReportPdf(context: TrainingReportContext) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const marginX = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - marginX * 2;

  const formattedDate = formatDisplayDate(context.session.trainingDate);
  const generatedAt = format(new Date(), 'dd.MM.yyyy HH:mm', { locale: ro });
  const trainingTypes = (context.session.trainingTypes || []).join(' / ') || 'SSM / SU';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('PROCES VERBAL DE INSTRUCTAJ COLECTIV', pageWidth / 2, 18, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Document generat la ${generatedAt}`, pageWidth / 2, 24, { align: 'center' });

  let cursorY = 34;

  cursorY = addSectionTitle(doc, '1. Date sesiune', marginX, cursorY);
  cursorY = addKeyValueLines(
    doc,
    [
      ['Eveniment', context.session.eventName || context.projectName || '-'],
      ['Locatie', context.session.location || '-'],
      ['Data', formattedDate],
    ],
    marginX,
    cursorY,
    usableWidth,
  );

  cursorY += 2;
  cursorY = addSectionTitle(doc, '2. Organizator', marginX, cursorY);
  cursorY = addKeyValueLines(
    doc,
    [
      ['Nume', context.organizer.operatorName || '-'],
      ['Denumire legala', context.organizer.operatorLegalName || '-'],
      ['CIF', context.organizer.operatorTaxId || '-'],
      ['Adresa', context.organizer.operatorAddress || '-'],
      ['Telefon', context.organizer.operatorPhone || '-'],
    ],
    marginX,
    cursorY,
    usableWidth,
  );

  cursorY += 2;
  cursorY = addSectionTitle(doc, '3. Tip instructaj si tematica', marginX, cursorY);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const topicContent = [
    `Tip instructaj: ${trainingTypes}`,
    '',
    ...((context.session.topics || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `- ${line}`)),
  ].join('\n');
  const topicLines = doc.splitTextToSize(topicContent, usableWidth);
  doc.text(topicLines, marginX, cursorY);
  cursorY += topicLines.length * 5 + 4;

  autoTable(doc, {
    startY: cursorY,
    head: [['Nr. crt.', 'Nume si Prenume', 'CNP', 'CI (serie / nr)', 'Semnatura']],
    body: context.entries.map((entry, index) => [
      String(index + 1),
      entry.volunteerName,
      entry.cnp || '-',
      [entry.identitySeries || '-', entry.identityNumber || '-'].join(' / '),
      '',
    ]),
    margin: { left: marginX, right: marginX },
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 2,
      overflow: 'linebreak',
      valign: 'middle',
      minCellHeight: 22,
    },
    headStyles: {
      fillColor: [31, 41, 55],
      textColor: 255,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      1: { cellWidth: 52 },
      2: { cellWidth: 32, halign: 'center' },
      3: { cellWidth: 34, halign: 'center' },
      4: { cellWidth: 48 },
    },
    didDrawCell: (hookData) => {
      if (hookData.section !== 'body' || hookData.column.index !== 4) {
        return;
      }

      const entry = context.entries[hookData.row.index];
      if (!entry?.signatureDataUrl) {
        doc.setDrawColor(180);
        doc.line(
          hookData.cell.x + 3,
          hookData.cell.y + hookData.cell.height / 2,
          hookData.cell.x + hookData.cell.width - 3,
          hookData.cell.y + hookData.cell.height / 2,
        );
        return;
      }

      const imageWidth = hookData.cell.width - 6;
      const imageHeight = hookData.cell.height - 6;

      doc.addImage(
        entry.signatureDataUrl,
        'PNG',
        hookData.cell.x + 3,
        hookData.cell.y + 3,
        imageWidth,
        imageHeight,
      );
    },
  });

  cursorY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || cursorY;
  if (cursorY > pageHeight - 55) {
    doc.addPage();
    cursorY = 20;
  }

  cursorY += 10;
  cursorY = addSectionTitle(doc, '4. Validare instructor', marginX, cursorY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Instructor responsabil: ${context.session.instructorName || '-'}`, marginX, cursorY);
  cursorY += 8;
  doc.text(`Data validarii: ${context.session.finalizedAt ? formatIsoDateTime(context.session.finalizedAt) : generatedAt}`, marginX, cursorY);
  cursorY += 8;

  doc.text('Semnatura instructor:', marginX, cursorY);

  if (context.instructorSignatureDataUrl) {
    doc.addImage(context.instructorSignatureDataUrl, 'PNG', marginX + 42, cursorY - 6, 55, 22);
  } else {
    doc.setDrawColor(120);
    doc.line(marginX + 42, cursorY + 10, marginX + 97, cursorY + 10);
  }

  cursorY += 22;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    'Acest document consemneaza participarea la instructajul colectiv si este arhivat in platforma proiectului.',
    marginX,
    cursorY,
    { maxWidth: usableWidth },
  );

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
    const textLines = doc.splitTextToSize(`${label}: ${value || '-'}`, maxWidth);
    doc.text(textLines, x, cursorY);
    cursorY += textLines.length * 5;
  }

  return cursorY;
}

function formatDisplayDate(value?: string) {
  if (!value) {
    return '-';
  }

  try {
    return format(new Date(value), 'dd MMMM yyyy', { locale: ro });
  } catch {
    return value;
  }
}

function formatIsoDateTime(value?: string) {
  if (!value) {
    return '-';
  }

  try {
    return format(new Date(value), 'dd.MM.yyyy HH:mm', { locale: ro });
  } catch {
    return value;
  }
}
