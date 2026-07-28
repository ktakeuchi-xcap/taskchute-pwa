import { describe, expect, it } from 'vitest';
import {
  SENDER_COMPANY_NAME,
  buildReportDocContent,
  buildReportPrompt,
  listCompletedTasksForCategory,
} from './reportData';
import { TaskStatus, type Task } from '@/features/tasks/types';

let seq = 0;
function makeTask(overrides: Partial<Task>): Task {
  seq += 1;
  return {
    taskId: `t${seq}`,
    taskName: `task-${seq}`,
    category: null,
    estimateMinutes: 30,
    scheduledStartTime: new Date('2026-06-01T09:00:00+09:00'),
    scheduledEndTime: new Date('2026-06-01T09:30:00+09:00'),
    actualStartTime: null,
    actualEndTime: null,
    status: TaskStatus.NotStarted,
    calendarEventId: 'evt',
    source: null,
    recurringEventId: null,
    countsTowardWorkload: true,
    ...overrides,
  };
}

describe('listCompletedTasksForCategory', () => {
  it('includes only Done tasks in the given category and month, sorted by date', () => {
    const tasks = [
      makeTask({
        taskName: '後の作業',
        category: '案件A',
        status: TaskStatus.Done,
        actualStartTime: new Date('2026-06-20T09:00:00+09:00'),
        actualEndTime: new Date('2026-06-20T09:30:00+09:00'),
      }),
      makeTask({
        taskName: '先の作業',
        category: '案件A',
        status: TaskStatus.Done,
        actualStartTime: new Date('2026-06-05T09:00:00+09:00'),
        actualEndTime: new Date('2026-06-05T09:45:00+09:00'),
      }),
      // Different category — excluded.
      makeTask({
        category: '案件B',
        status: TaskStatus.Done,
        actualStartTime: new Date('2026-06-10T09:00:00+09:00'),
        actualEndTime: new Date('2026-06-10T09:30:00+09:00'),
      }),
      // Different month — excluded.
      makeTask({
        category: '案件A',
        status: TaskStatus.Done,
        actualStartTime: new Date('2026-07-01T09:00:00+09:00'),
        actualEndTime: new Date('2026-07-01T09:30:00+09:00'),
      }),
      // Not Done — excluded.
      makeTask({
        category: '案件A',
        status: TaskStatus.InProgress,
        actualStartTime: new Date('2026-06-15T09:00:00+09:00'),
      }),
      // Opted out of workload — excluded, same as actualMinutes.
      makeTask({
        category: '案件A',
        status: TaskStatus.Done,
        actualStartTime: new Date('2026-06-12T09:00:00+09:00'),
        actualEndTime: new Date('2026-06-12T09:30:00+09:00'),
        countsTowardWorkload: false,
      }),
    ];
    const result = listCompletedTasksForCategory(tasks, '案件A', '2026-06');
    expect(result).toEqual([
      { taskName: '先の作業', dateKey: '2026-06-05', minutes: 45 },
      { taskName: '後の作業', dateKey: '2026-06-20', minutes: 30 },
    ]);
  });
});

describe('buildReportPrompt', () => {
  it('lists each entry and states the category/month', () => {
    const prompt = buildReportPrompt('案件A', '2026-06', [
      { taskName: 'キックオフMTG', dateKey: '2026-06-05', minutes: 45 },
    ]);
    expect(prompt).toContain('【案件】案件A');
    expect(prompt).toContain('【対象月】2026年06月');
    expect(prompt).toContain('- 2026-06-05 キックオフMTG（45分）');
  });

  it('flags an empty month instead of an empty list', () => {
    const prompt = buildReportPrompt('案件A', '2026-06', []);
    expect(prompt).toContain('対象月に完了したタスクがありません');
  });
});

describe('buildReportDocContent', () => {
  it('builds the standard-format header/table/footer text', () => {
    const content = buildReportDocContent({
      category: '案件A',
      yearMonth: '2026-06',
      clientName: '株式会社PKSHA Technology',
      totalMinutes: 160 * 60 * 0.05, // 0.05人月
      activityText: '・週次MTGへの参加',
    });

    expect(content.title).toBe('作業報告書_案件A_2026年6月');
    expect(content.headerText).toContain('株式会社PKSHA Technology　御中'); // 全角スペース
    expect(content.headerText).toContain('作業実績報告書');
    expect(content.headerText).toContain('2026年6月30日'); // last day of June
    expect(content.headerText).toContain(
      '2026年6月1日～2026年6月30日までの作業実績を報告いたします。',
    );
    expect(content.headerText).toContain(SENDER_COMPANY_NAME);
    expect(content.headerText).toContain('2026年6月の作業実績（合計稼働：0.05人月）');
    expect(content.tableHeaderCells).toEqual(['No.', 'アクティビティ', '作業実績']);
    expect(content.tableDataCells).toEqual(['1', '案件A', '・週次MTGへの参加']);
    expect(content.footerText).toContain('上記を検収いたしました。');
    expect(content.footerText).toContain('株式会社PKSHA Technology');
    expect(content.footerText).toContain('担当：');
  });

  it('bolds the title, and only the label part of the total-workload line (not the figure)', () => {
    const content = buildReportDocContent({
      category: '案件A',
      yearMonth: '2026-06',
      clientName: '株式会社PKSHA Technology',
      totalMinutes: 0,
      activityText: '・作業なし',
    });
    const [titleRange, totalRange] = content.headerBoldRanges;
    expect(content.headerText.slice(titleRange!.start, titleRange!.end)).toBe('作業実績報告書');
    expect(content.headerText.slice(totalRange!.start, totalRange!.end)).toBe(
      '2026年6月の作業実績（合計稼働：',
    );
    // The figure itself and the closing "）" stay outside the bold range.
    expect(content.headerText.slice(totalRange!.end)).toMatch(/^0\.00人月）/);
  });

  it('sizes the title/total-line larger than the base font, matching the bold ranges', () => {
    const content = buildReportDocContent({
      category: '案件A',
      yearMonth: '2026-06',
      clientName: '株式会社PKSHA Technology',
      totalMinutes: 0,
      activityText: '・作業なし',
    });
    const [titleSize, totalSize] = content.headerFontSizeRanges;
    expect(content.headerText.slice(titleSize!.range.start, titleSize!.range.end)).toBe(
      '作業実績報告書',
    );
    expect(titleSize!.pointSize).toBe(16);
    expect(totalSize!.pointSize).toBe(14);
  });

  it('right-aligns the report-date and sender-name lines', () => {
    const content = buildReportDocContent({
      category: '案件A',
      yearMonth: '2026-06',
      clientName: '株式会社PKSHA Technology',
      totalMinutes: 0,
      activityText: '・作業なし',
    });
    const [dateRange, senderRange] = content.headerRightAlignRanges;
    expect(content.headerText.slice(dateRange!.start, dateRange!.end)).toBe('2026年6月30日');
    expect(content.headerText.slice(senderRange!.start, senderRange!.end)).toBe(
      SENDER_COMPANY_NAME,
    );
  });

  it('marks the 年月日/宛先/担当 block (検収印欄) for the boxed treatment', () => {
    const content = buildReportDocContent({
      category: '案件A',
      yearMonth: '2026-06',
      clientName: '株式会社PKSHA Technology',
      totalMinutes: 0,
      activityText: '・作業なし',
    });
    const boxed = content.footerText.slice(
      content.footerBoxRange.start,
      content.footerBoxRange.end,
    );
    expect(boxed).toBe('年　月　日\n株式会社PKSHA Technology\n担当：');
  });
});
