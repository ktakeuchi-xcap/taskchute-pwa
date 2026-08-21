import { jstMinutesOfDay } from '@/lib/time/jst';
import type { Task } from './types';

export interface PositionedTask {
  task: Task;
  /** Distance from the top of the day (0:00), in px. */
  top: number;
  /** Block height, in px. */
  height: number;
  /** 0-based column index within its overlap cluster. */
  column: number;
  /** Number of columns the cluster this task belongs to is split into. */
  totalColumns: number;
}

// A very short task would render as a sliver too thin to read — enforce a
// minimum visible height, same idea as DailyWorkloadGauge's MIN_VISIBLE_PCT.
const MIN_BLOCK_HEIGHT_PX = 18;

/**
 * Lay out a day's tasks on a Google Calendar-style time axis: each task's
 * vertical position/height comes straight from its scheduled start/end time
 * (in JST minutes-since-midnight), and tasks whose time ranges overlap are
 * split into side-by-side columns instead of stacking on top of each other.
 *
 * Overlap handling only narrows tasks that actually share time with another
 * task — it groups tasks into overlap "clusters" via a single sweep (sorted
 * by start time, a new cluster starts whenever a task begins at or after
 * every task seen so far in the current cluster has ended), then assigns
 * columns greedily within each cluster. Back-to-back, non-overlapping tasks
 * (e.g. 10:00–11:00 then 11:00–12:00) land in different clusters and each
 * keep the full width, matching how calendar apps usually read.
 */
export function layoutDayTimeline(tasks: Task[], hourHeightPx: number): PositionedTask[] {
  const items = tasks
    .map((task) => {
      const start = jstMinutesOfDay(task.scheduledStartTime);
      const rawEnd = jstMinutesOfDay(task.scheduledEndTime);
      // Guard against zero/negative-duration rows (shouldn't normally occur
      // for non-all-day tasks, but a corrupt/edge-case row shouldn't collapse
      // to an invisible or negative-height block).
      const end = rawEnd > start ? rawEnd : start + Math.max(15, task.estimateMinutes || 15);
      return { task, start, end };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const positioned: PositionedTask[] = [];
  let clusterItems: typeof items = [];
  let clusterMaxEnd = -Infinity;

  const flushCluster = () => {
    if (clusterItems.length === 0) return;
    // Greedy column assignment: place each task in the first column whose
    // last-assigned task has already ended by this task's start; otherwise
    // open a new column.
    const columnEnds: number[] = [];
    for (const item of clusterItems) {
      let column = columnEnds.findIndex((end) => end <= item.start);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(item.end);
      } else {
        columnEnds[column] = item.end;
      }
      positioned.push({
        task: item.task,
        top: (item.start / 60) * hourHeightPx,
        height: Math.max(MIN_BLOCK_HEIGHT_PX, ((item.end - item.start) / 60) * hourHeightPx),
        column,
        totalColumns: -1, // filled in below once the cluster's column count is known
      });
    }
    const totalColumns = columnEnds.length;
    for (let i = positioned.length - clusterItems.length; i < positioned.length; i++) {
      positioned[i]!.totalColumns = totalColumns;
    }
  };

  for (const item of items) {
    if (clusterItems.length === 0 || item.start < clusterMaxEnd) {
      clusterItems.push(item);
      clusterMaxEnd = Math.max(clusterMaxEnd, item.end);
    } else {
      flushCluster();
      clusterItems = [item];
      clusterMaxEnd = item.end;
    }
  }
  flushCluster();

  return positioned;
}
