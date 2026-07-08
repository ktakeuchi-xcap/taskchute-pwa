import type { SheetsClient, ValueRange } from '@/lib/google/sheets';
import { buildHeaderIndex } from '@/features/tasks/api/headers';
import { parseSchedule, parseTime } from './scheduleEvaluator';
import { ROUTINE_HEADERS, ROUTINES_SHEET } from './headers';

export interface RoutineWithRow {
  rowNumber: number;
  schedule: string;
  taskName: string;
  startTime: string;
  category: string;
  estimateMinutes: number;
}

export interface RoutineInput {
  schedule: string;
  taskName: string;
  startTime: string;
  category?: string;
  estimateMinutes: number;
}

export interface RoutinesRepository {
  listRoutines(): Promise<RoutineWithRow[]>;
  addRoutine(input: RoutineInput): Promise<void>;
  updateRoutine(rowNumber: number, input: RoutineInput): Promise<void>;
  deleteRoutine(rowNumber: number): Promise<void>;
}

export interface RoutinesRepositoryDeps {
  sheets: SheetsClient;
  spreadsheetId: string;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function timeCellToString(raw: unknown): string {
  const parsed = parseTime(raw);
  return parsed ? `${pad2(parsed.hour)}:${pad2(parsed.minute)}` : '';
}

/**
 * Sort key for a schedule string: (frequency tier, day-within-tier).
 * Lower tier = higher frequency. Unparseable schedules sort last so bad
 * manual entries stay visible instead of erroring the whole list.
 */
function scheduleRank(schedule: string): { tier: number; subDay: number } {
  try {
    const parsed = parseSchedule(schedule);
    switch (parsed.kind) {
      case 'businessDay':
        return { tier: 0, subDay: 0 };
      case 'weekday':
        // 0=日, 1=月, ..., 6=土 — matches WEEKDAY_JA order (早い順).
        return { tier: 1, subDay: parsed.day };
      case 'monthFirst':
        return { tier: 2, subDay: 1 };
      case 'dayOfMonth':
        return { tier: 2, subDay: parsed.day };
      case 'monthLast':
        // Always the last day of whatever month it is — sorts after any fixed day-of-month.
        return { tier: 2, subDay: 32 };
    }
  } catch {
    return { tier: 99, subDay: 0 };
  }
}

function columnLetter(col1Based: number): string {
  let n = col1Based;
  let out = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    out = String.fromCharCode(65 + m) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function timeToMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return parseInt(m[1]!, 10) * 60 + parseInt(m[2]!, 10);
}

function compareRoutines(a: RoutineWithRow, b: RoutineWithRow): number {
  const ra = scheduleRank(a.schedule);
  const rb = scheduleRank(b.schedule);
  if (ra.tier !== rb.tier) return ra.tier - rb.tier;
  if (ra.subDay !== rb.subDay) return ra.subDay - rb.subDay;
  return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
}

export function createRoutinesRepository(deps: RoutinesRepositoryDeps): RoutinesRepository {
  const { sheets, spreadsheetId } = deps;

  return {
    async listRoutines() {
      const values = await sheets.getValues(spreadsheetId, ROUTINES_SHEET);
      if (values.length === 0) return [];
      const [headerRow, ...rows] = values;
      if (!headerRow) return [];
      const idx = buildHeaderIndex(headerRow, ROUTINE_HEADERS);

      const out: RoutineWithRow[] = [];
      rows.forEach((row, i) => {
        const taskName = asString(row[idx.TaskName]);
        if (!taskName) return;
        const rawEstimate = row[idx.EstimateMinutes];
        const estimateMinutes =
          typeof rawEstimate === 'number' ? rawEstimate : Number(rawEstimate ?? 0);
        out.push({
          rowNumber: i + 2, // +1 for header, +1 for 1-based
          schedule: asString(row[idx.Schedule]),
          taskName,
          startTime: timeCellToString(row[idx.StartTime]),
          category: asString(row[idx.Category]),
          estimateMinutes: Number.isFinite(estimateMinutes) ? estimateMinutes : 0,
        });
      });
      return out.sort(compareRoutines);
    },

    async addRoutine(input) {
      const values = await sheets.getValues(spreadsheetId, ROUTINES_SHEET);
      if (values.length === 0) throw new Error('RoutineTasks sheet is empty (no header row)');
      const headerRow = values[0]!;
      const idx = buildHeaderIndex(headerRow, ROUTINE_HEADERS);

      const row = new Array<unknown>(headerRow.length).fill('');
      row[idx.Schedule] = input.schedule;
      row[idx.TaskName] = input.taskName;
      row[idx.StartTime] = input.startTime;
      row[idx.Category] = input.category ?? '';
      row[idx.EstimateMinutes] = input.estimateMinutes;
      await sheets.appendRows(spreadsheetId, ROUTINES_SHEET, [row]);
    },

    async updateRoutine(rowNumber, input) {
      const values = await sheets.getValues(spreadsheetId, ROUTINES_SHEET);
      if (values.length === 0) throw new Error('RoutineTasks sheet is empty (no header row)');
      const headerRow = values[0]!;
      const idx = buildHeaderIndex(headerRow, ROUTINE_HEADERS);

      const cellRange = (col0Based: number) =>
        `${ROUTINES_SHEET}!${columnLetter(col0Based + 1)}${rowNumber}`;

      const updates: ValueRange[] = [
        { range: cellRange(idx.Schedule), values: [[input.schedule]] },
        { range: cellRange(idx.TaskName), values: [[input.taskName]] },
        { range: cellRange(idx.StartTime), values: [[input.startTime]] },
        { range: cellRange(idx.Category), values: [[input.category ?? '']] },
        { range: cellRange(idx.EstimateMinutes), values: [[input.estimateMinutes]] },
      ];
      await sheets.batchUpdateValues(spreadsheetId, updates);
    },

    async deleteRoutine(rowNumber) {
      const sheetsMeta = await sheets.getSheetMetadata(spreadsheetId);
      const routinesSheet = sheetsMeta.find((s) => s.title === ROUTINES_SHEET);
      if (!routinesSheet) throw new Error(`Sheet not found: ${ROUTINES_SHEET}`);
      await sheets.deleteRow(spreadsheetId, routinesSheet.sheetId, rowNumber - 1);
    },
  };
}
