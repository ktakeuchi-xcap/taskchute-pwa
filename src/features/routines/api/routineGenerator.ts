import { addDays, format } from 'date-fns';
import type { CalendarClient } from '@/lib/google/calendar';
import { CalendarColor } from '@/lib/google/calendar';
import type { SheetsClient } from '@/lib/google/sheets';
import { jstDate, formatJst } from '@/lib/time/jst';
import { buildTaskRow, formatEventTitle, parseTaskDbRows } from '@/features/tasks/api/serializers';
import { TASKDB_SHEET } from '@/features/tasks/api/headers';
import { TaskStatus, type Task } from '@/features/tasks/types';
import { ROUTINES_SHEET } from './headers';
import { matchesSchedule, parseRoutineRows } from './scheduleEvaluator';

export interface GenerateRoutinesDeps {
  sheets: SheetsClient;
  calendar: CalendarClient;
  spreadsheetId: string;
  calendarId: string;
  now?: () => Date;
  generateId?: () => string;
}

export interface GenerateRoutinesResult {
  addedCount: number;
  skippedCount: number;
  weekStartIso: string;
  weekEndIso: string;
  added: Task[];
}

function defaultGenerateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tid-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function getJstParts(date: Date) {
  const yyyy = parseInt(formatJst(date, 'yyyy'), 10);
  const mm = parseInt(formatJst(date, 'M'), 10);
  const dd = parseInt(formatJst(date, 'd'), 10);
  const weekdayStr = formatJst(date, 'i'); // 1..7 (Mon..Sun)
  const weekdayMap: Record<string, 0 | 1 | 2 | 3 | 4 | 5 | 6> = {
    '1': 1,
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 0,
  };
  return {
    year: yyyy,
    monthOneBased: mm,
    day: dd,
    weekday: weekdayMap[weekdayStr] ?? 0,
  };
}

function nextMondayInJst(now: Date): Date {
  const parts = getJstParts(now);
  // Build a JST midnight Date for today, then add days to reach next Monday.
  const todayJstMidnight = jstDate(parts.year, parts.monthOneBased, parts.day);
  const todayWeekday = parts.weekday;
  let daysToNextMonday = (8 - todayWeekday) % 7;
  if (daysToNextMonday === 0) daysToNextMonday = 7;
  return addDays(todayJstMidnight, daysToNextMonday);
}

/**
 * Generate tasks for next Monday–Friday from the RoutineTasks sheet.
 * Returns a summary including the actual range processed and which tasks were
 * added. De-duplicates against existing TaskDB entries by (JST date + task name).
 */
export async function generateNextWeekRoutines(
  deps: GenerateRoutinesDeps,
): Promise<GenerateRoutinesResult> {
  const { sheets, calendar, spreadsheetId, calendarId } = deps;
  const now = deps.now ?? (() => new Date());
  const generateId = deps.generateId ?? defaultGenerateId;

  const [routineValues, taskdbValues] = await Promise.all([
    sheets.getValues(spreadsheetId, ROUTINES_SHEET),
    sheets.getValues(spreadsheetId, TASKDB_SHEET),
  ]);
  if (taskdbValues.length === 0) {
    throw new Error('TaskDB sheet is empty (no header row)');
  }
  const taskdbHeader = taskdbValues[0]!;
  const routines = parseRoutineRows(routineValues).map((r) => r.routine);
  const existingTasks = parseTaskDbRows(taskdbValues);
  const existingKeys = new Set(
    existingTasks.map(
      (t) => `${formatJst(t.task.scheduledStartTime, 'yyyy-MM-dd')}_${t.task.taskName}`,
    ),
  );

  const monday = nextMondayInJst(now());
  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(monday, i)); // Mon..Fri

  // For idempotency we build the rows in memory first, then write them in one append.
  const rowsToAppend: unknown[][] = [];
  const added: Task[] = [];
  let skippedCount = 0;

  for (const dayDate of weekDays) {
    const parts = getJstParts(dayDate);
    for (const routine of routines) {
      if (!matchesSchedule(routine.schedule, parts)) {
        continue;
      }
      const key = `${formatJst(dayDate, 'yyyy-MM-dd')}_${routine.taskName}`;
      if (existingKeys.has(key)) {
        skippedCount += 1;
        continue;
      }
      const start = jstDate(
        parts.year,
        parts.monthOneBased,
        parts.day,
        routine.startTime.hour,
        routine.startTime.minute,
      );
      const end = new Date(start.getTime() + routine.estimateMinutes * 60_000);

      const event = await calendar.insert(calendarId, {
        summary: formatEventTitle(routine.taskName, routine.category || null),
        start,
        end,
        colorId: CalendarColor.Gray,
      });

      const task: Task = {
        taskId: generateId(),
        taskName: routine.taskName,
        category: routine.category || null,
        estimateMinutes: routine.estimateMinutes,
        scheduledStartTime: start,
        scheduledEndTime: end,
        actualStartTime: null,
        actualEndTime: null,
        status: TaskStatus.NotStarted,
        calendarEventId: event.id,
      };
      added.push(task);
      rowsToAppend.push(buildTaskRow(taskdbHeader, task));
      existingKeys.add(key);
    }
  }

  if (rowsToAppend.length > 0) {
    await sheets.appendRows(spreadsheetId, TASKDB_SHEET, rowsToAppend);
  }

  return {
    addedCount: added.length,
    skippedCount,
    weekStartIso: format(monday, 'yyyy-MM-dd'),
    weekEndIso: format(weekDays[4]!, 'yyyy-MM-dd'),
    added,
  };
}
