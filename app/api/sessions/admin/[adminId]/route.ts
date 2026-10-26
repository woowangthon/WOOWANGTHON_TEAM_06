import { handle } from '@/lib/http';
import { isMock } from '@/lib/llm';
import { NotFoundError, getSessionByAdmin } from '@/lib/sessions';

export const GET = (_req: Request, { params }: { params: Promise<{ adminId: string }> }) =>
  handle(async () => {
    const s = await getSessionByAdmin((await params).adminId);
    if (!s) throw new NotFoundError('session not found');
    return { ...s, mock: isMock() };
  });
