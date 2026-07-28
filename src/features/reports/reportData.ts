import { formatJst } from '@/lib/time/jst';
import { TaskStatus, type Task } from '@/features/tasks/types';
import { actualMinutes, toPersonMonths } from '@/features/dashboard/aggregation';

/** Fixed sender name used on every report — same across all clients (see the standard-format samples). */
export const SENDER_COMPANY_NAME = '株式会社X Capital';

export interface CompletedTaskEntry {
  taskName: string;
  /** "yyyy-MM-dd" (JST), the task's ActualStartTime date. */
  dateKey: string;
  minutes: number;
}

/**
 * Completed tasks for one 案件 in one month, sorted chronologically. Uses the
 * same Done/ActualStartTime/countsTowardWorkload filter as actualMinutes, so
 * the sum of entries' minutes always matches the person-month total shown
 * elsewhere in the app (REQ-03/REQ-45) — no separate, silently-diverging
 * definition of "actual work" for reports.
 */
export function listCompletedTasksForCategory(
  tasks: Task[],
  category: string,
  yearMonth: string,
): CompletedTaskEntry[] {
  return tasks
    .filter((t) => t.status === TaskStatus.Done && t.category === category && t.actualStartTime)
    .filter((t) => formatJst(t.actualStartTime!, 'yyyy-MM') === yearMonth)
    .map((t) => ({
      taskName: t.taskName,
      dateKey: formatJst(t.actualStartTime!, 'yyyy-MM-dd'),
      minutes: actualMinutes(t),
    }))
    .filter((e) => e.minutes > 0)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

/**
 * The text the user copies out to an external Claude conversation to turn
 * the raw completed-task list into report-quality bullet points. Kept as a
 * plain function (not an API call) — this app has no server to call an LLM
 * from, so organizing the wording is deliberately a human-in-the-loop step.
 */
export function buildReportPrompt(
  category: string,
  yearMonth: string,
  entries: CompletedTaskEntry[],
): string {
  const [year, month] = yearMonth.split('-');
  const taskLines =
    entries.length > 0
      ? entries.map((e) => `- ${e.dateKey} ${e.taskName}（${e.minutes}分）`).join('\n')
      : '（対象月に完了したタスクがありません）';
  return [
    '以下は、月次の「作業実績報告書」に記載する「作業実績」欄のもとになる、完了タスクの一覧です。',
    'この一覧をもとに、簡潔な箇条書き（3〜8項目程度、体言止め）に整理してください。',
    '類似のタスクはまとめ、日付や分数などの内部管理情報はそのまま転記せず、業務内容として自然な言い回しにしてください。',
    '出力は「・」で始まる箇条書きの行のみとし、前置き・見出し・まとめのコメントは付けないでください。',
    '',
    `【案件】${category}`,
    `【対象月】${year}年${month}月`,
    '【完了タスク一覧】',
    taskLines,
  ].join('\n');
}

export interface StyleRange {
  start: number;
  end: number;
}

// Measured directly from a real standard-format document (not guessed) by
// exporting it to HTML and reading its inline styles — see ISS-28.
export const BASE_FONT_PT = 12;
export const TITLE_FONT_PT = 16;
export const TOTAL_LINE_FONT_PT = 14;
export const TABLE_HEADER_FONT_PT = 12;
export const TABLE_DATA_FONT_PT = 10.5;
/** [No., アクティビティ, 作業実績] column widths in points — roughly a 1:6:14 ratio. */
export const TABLE_COLUMN_WIDTHS_PT: [number, number, number] = [29.2, 132.7, 326];

export interface ReportDocContent {
  title: string;
  /** Everything from the recipient line through the "◯月の作業実績（合計稼働：…）" line, newline-joined. */
  headerText: string;
  /** Character ranges within headerText to bold (the title, and the total-workload line's label). */
  headerBoldRanges: StyleRange[];
  /** Character ranges within headerText to render at a larger size than the base font. */
  headerFontSizeRanges: Array<{ range: StyleRange; pointSize: number }>;
  /** Paragraph ranges within headerText to right-align (the report date and sender name lines). */
  headerRightAlignRanges: StyleRange[];
  tableHeaderCells: [string, string, string];
  tableDataCells: [string, string, string];
  /** From "以上" through "担当：", newline-joined. */
  footerText: string;
  /** The "年 月 日 / 宛先 / 担当：" block within footerText — right-aligned and boxed (検収印欄). */
  footerBoxRange: StyleRange;
}

/** Builds the standard-format report's static text content — pure and independent of the Docs API itself. */
export function buildReportDocContent(input: {
  category: string;
  yearMonth: string;
  clientName: string;
  totalMinutes: number;
  /** Claude's organized bullet-point text, pasted back in by the user (each line starting with "・"). */
  activityText: string;
}): ReportDocContent {
  const { category, yearMonth, clientName, totalMinutes, activityText } = input;
  const [year, month] = yearMonth.split('-').map((s) => parseInt(s, 10));
  const lastDay = new Date(year, month, 0).getDate();
  const reportDateLabel = `${year}年${month}月${lastDay}日`;
  const periodStartLabel = `${year}年${month}月1日`;
  const periodEndLabel = `${year}年${month}月${lastDay}日`;
  const personMonths = toPersonMonths(totalMinutes).toFixed(2);

  const titleLine = '作業実績報告書';
  // Standard format only bolds the label, not the figure itself (見本参照)。
  const totalLineLabel = `${year}年${month}月の作業実績（合計稼働：`;
  const totalLine = `${totalLineLabel}${personMonths}人月）`;

  // Blank-line spacing below matches the real sample exactly (2 blanks after
  // 御中, 1 after the title, 0 between date/sender and again between the
  // period/thanks sentences, 2 before the period sentence, 1 before the
  // total line) — the previous version put a uniform 1 blank line between
  // every line, which read as too loose (ISS-28).
  const lines = [
    // 全角スペースを使う（標準フォーマットのサンプルに合わせる。半角だと体裁が崩れる）。
    // 全角スペースはno-irregular-whitespaceの対象になるテンプレートリテラルを避け、
    // 対象外の通常の文字列リテラルとして連結する。
    clientName + '　御中',
    '',
    '',
    titleLine,
    '',
    reportDateLabel,
    SENDER_COMPANY_NAME,
    '',
    '',
    `${periodStartLabel}～${periodEndLabel}までの作業実績を報告いたします。`,
    'ご査収の程、よろしくお願い申し上げます。',
    '',
    totalLine,
  ];
  const headerText = lines.join('\n');

  const titleStart = headerText.indexOf(titleLine);
  const totalLabelStart = headerText.lastIndexOf(totalLineLabel);
  const totalLineStart = totalLabelStart;
  const dateStart = headerText.indexOf(reportDateLabel);
  const senderStart = headerText.indexOf(SENDER_COMPANY_NAME);

  const footerLines = [
    '以上',
    '',
    '上記を検収いたしました。',
    '',
    '年　月　日',
    clientName,
    '担当：',
  ];
  const footerText = footerLines.join('\n');
  const footerBoxStart = footerText.indexOf('年　月　日');

  return {
    title: `作業報告書_${category}_${year}年${month}月`,
    headerText,
    headerBoldRanges: [
      { start: titleStart, end: titleStart + titleLine.length },
      { start: totalLabelStart, end: totalLabelStart + totalLineLabel.length },
    ],
    headerFontSizeRanges: [
      {
        range: { start: titleStart, end: titleStart + titleLine.length },
        pointSize: TITLE_FONT_PT,
      },
      {
        range: { start: totalLineStart, end: totalLineStart + totalLine.length },
        pointSize: TOTAL_LINE_FONT_PT,
      },
    ],
    headerRightAlignRanges: [
      { start: dateStart, end: dateStart + reportDateLabel.length },
      { start: senderStart, end: senderStart + SENDER_COMPANY_NAME.length },
    ],
    tableHeaderCells: ['No.', 'アクティビティ', '作業実績'],
    tableDataCells: ['1', category, activityText.trim()],
    footerText,
    footerBoxRange: { start: footerBoxStart, end: footerText.length },
  };
}
