import { type Ctx, handle } from '@/lib/http';
import { getLesson } from '@/lib/lessons';
import { NotFoundError, getSession, getWorker } from '@/lib/sessions';

export const GET = (_req: Request, { params }: Ctx) =>
  handle(async () => {
    const w = await getWorker((await params).id);
    if (!w) throw new NotFoundError('worker not found');
    const session = (await getSession(w.sessionId))!;
    const { lesson, mock } = await getLesson(session.instructionKo, w.lang, w.level);
    return {
      lesson: { ...lesson, quiz: lesson.quiz.map((q) => ({ question: q.question, options: q.options })) },
      mock,
      level: w.level,
    };
  });
