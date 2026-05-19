import { z } from 'zod';

export const TaskInputSchema = z.object({
  taskName: z.string().trim().min(1, 'タスク名を入力してください').max(200),
  estimateMinutes: z
    .number({ message: '見積を数値で入力してください' })
    .int()
    .min(1, '見積は1〜480分の範囲で入力してください')
    .max(480, '見積は1〜480分の範囲で入力してください'),
  category: z.string().max(50).optional(),
  startTime: z.date().optional(),
});

export type TaskInputDto = z.infer<typeof TaskInputSchema>;
