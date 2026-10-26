import { z } from 'zod';
import { type Ctx, handle, parseBody } from '@/lib/http';
import { submitAnswers } from '@/lib/sessions';

const Body = z.object({
  level: z.number().int().min(0),
  answers: z.array(z.number().int().min(0).max(2)).max(3),
});

export const POST = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const { level, answers } = await parseBody(req, Body);
    return submitAnswers((await params).id, level, answers);
  });
