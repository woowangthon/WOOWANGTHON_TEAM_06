import { type Ctx, handle } from '@/lib/http';
import { isMock } from '@/lib/llm';
import { NotFoundError, getSession } from '@/lib/sessions';

export const GET = (_req: Request, { params }: Ctx) =>
  handle(async () => {
    const s = await getSession((await params).id);
    if (!s) throw new NotFoundError('session not found');
    return { ...s, mock: isMock() };
  });
