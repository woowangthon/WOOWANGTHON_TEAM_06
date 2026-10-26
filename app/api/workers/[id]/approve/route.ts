import { type Ctx, handle } from '@/lib/http';
import { approveWorker } from '@/lib/sessions';

export const POST = (_req: Request, { params }: Ctx) =>
  handle(async () => {
    await approveWorker((await params).id);
    return { ok: true };
  });
