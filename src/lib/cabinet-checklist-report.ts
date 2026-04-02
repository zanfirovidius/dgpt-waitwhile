import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import type { CabinetDailyPacket } from '@/lib/cabinet-types';

type CabinetChecklistProjectContext = {
  name: string;
  eventName?: string;
  city?: string;
  locationName?: string;
  venue?: string;
};

export function generateCabinetChecklistPdf(args: {
  project: CabinetChecklistProjectContext;
  assignmentDate: string;
  packets: CabinetDailyPacket[];
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const usableWidth = pageWidth - marginX * 2;

  const formattedDay = formatDisplayDate(args.assignmentDate);
  const location = [args.project.city || args.project.locationName || '', args.project.venue || '']
    .filter(Boolean)
    .join(' · ');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('CHECKLIST CABINETE', pageWidth / 2, 16, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(args.project.eventName || args.project.name, pageWidth / 2, 22, { align: 'center' });
  doc.text([formattedDay, location].filter(Boolean).join(' · '), pageWidth / 2, 27, { align: 'center' });

  let cursorY = 36;

  for (const [index, packet] of args.packets.entries()) {
    const estimatedHeight = estimatePacketHeight(doc, packet, usableWidth);
    if (cursorY + estimatedHeight > pageHeight - 16) {
      doc.addPage();
      cursorY = 18;
    }

    doc.setDrawColor(214, 219, 220);
    doc.roundedRect(marginX, cursorY, usableWidth, estimatedHeight - 2, 4, 4);

    let blockY = cursorY + 7;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`${index + 1}. ${packet.cabinetIdentifier || 'CAB'} · ${packet.cabinetLabel}`, marginX + 4, blockY);
    blockY += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const metaLines = [
      `Interval: ${packet.intervalLabel}`,
      `Alocat: ${packet.assigneeDisplayName}`,
      `Disciplina: ${packet.specialty || 'Non-clinic'}`,
      `Ecograf: ${packet.ultrasoundAvailable ? 'Da' : 'Nu'}`,
    ];
    if (packet.notes) {
      metaLines.push(`Observatii: ${packet.notes}`);
    }

    for (const line of metaLines) {
      const split = doc.splitTextToSize(line, usableWidth - 8);
      doc.text(split, marginX + 4, blockY);
      blockY += split.length * 4.5;
    }

    blockY += 1;
    doc.setFont('helvetica', 'bold');
    doc.text('Materiale si echipamente', marginX + 4, blockY);
    blockY += 5;
    doc.setFont('helvetica', 'normal');

    if (packet.materials.length === 0) {
      doc.text('- Nu exista materiale configurate pentru acest cabinet.', marginX + 4, blockY);
      blockY += 5;
    } else {
      for (const material of packet.materials) {
        const split = doc.splitTextToSize(`[${material.checked ? 'x' : ' '}] ${material.label}`, usableWidth - 10);
        doc.text(split, marginX + 6, blockY);
        blockY += split.length * 4.5;
      }
    }

    cursorY += estimatedHeight + 4;
  }

  return Buffer.from(doc.output('arraybuffer'));
}

function estimatePacketHeight(doc: jsPDF, packet: CabinetDailyPacket, usableWidth: number) {
  let height = 22;
  const metaLines = [
    `Interval: ${packet.intervalLabel}`,
    `Alocat: ${packet.assigneeDisplayName}`,
    `Disciplina: ${packet.specialty || 'Non-clinic'}`,
    `Ecograf: ${packet.ultrasoundAvailable ? 'Da' : 'Nu'}`,
    ...(packet.notes ? [`Observatii: ${packet.notes}`] : []),
  ];

  for (const line of metaLines) {
    height += doc.splitTextToSize(line, usableWidth - 8).length * 4.5;
  }

  height += 8;

  if (packet.materials.length === 0) {
    height += 6;
  } else {
    for (const material of packet.materials) {
      height += doc.splitTextToSize(`[ ] ${material.label}`, usableWidth - 10).length * 4.5;
    }
  }

  return Math.max(height, 42);
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
