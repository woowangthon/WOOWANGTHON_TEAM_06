import { type Ctx, handle } from '@/lib/http';
import { NotFoundError, getWorker } from '@/lib/sessions';

export const GET = (_req: Request, { params }: Ctx) =>
  handle(async () => {
    const w = await getWorker((await params).id);
    if (!w) throw new NotFoundError('worker not found');
    return w;
  });
