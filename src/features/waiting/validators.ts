import { z } from 'zod';

export const WaitingTaskInputSchema = z
  .object({
    taskName: z.string().trim().min(1, '依頼内容を入力してください').max(200),
    waitingFor: z.string().trim().max(100).optional(),
    followUpDate: z.date().optional(),
  })
  .refine(
    (val) => {
      if (!val.followUpDate) return true;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return val.followUpDate.getTime() >= today.getTime();
    },
    { message: '過去の日付は指定できません', path: ['followUpDate'] },
  );

export type WaitingTaskInputDto = z.infer<typeof WaitingTaskInputSchema>;
