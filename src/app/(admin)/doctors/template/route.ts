import * as XLSX from 'xlsx';
import { createSessionClient } from '@/lib/appwrite-server';

export async function GET() {
  try {
    const { account } = await createSessionClient();
    await account.get();

    const workbook = XLSX.utils.book_new();
    const doctorSheet = XLSX.utils.aoa_to_sheet([
      ['Nume', 'Grad profesional/universitar', 'Telefon', 'Email', 'CUIM', 'Specialitate', 'Observații'],
      ['Dr. Andrei Popescu', 'Medic primar cardiologie', '0722123456', 'andrei.popescu@example.com', 'CUIM123456', 'Cardiologie', 'Exemplu de rând'],
    ]);

    const notesSheet = XLSX.utils.aoa_to_sheet([
      ['Instrucțiuni import'],
      ['1. Coloanele obligatorii sunt: Nume și Grad profesional/universitar.'],
      ['2. Telefon, Email și CUIM sunt opționale, dar recomandate pentru deduplicare.'],
      ['3. Nu includeți imaginea în Excel. Imaginea se încarcă ulterior din pagina medicului.'],
      ['4. La import, sistemul detectează duplicate după CUIM, email, telefon și nume.'],
    ]);

    XLSX.utils.book_append_sheet(workbook, doctorSheet, 'Medici');
    XLSX.utils.book_append_sheet(workbook, notesSheet, 'Instructiuni');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="template-import-medici.xlsx"',
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error: unknown) {
    return new Response(
      error instanceof Error ? error.message : 'Nu am putut genera template-ul.',
      { status: 500 },
    );
  }
}
