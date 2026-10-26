import { type Ctx, handle } from '@/lib/http';
import { approveWorker } from '@/lib/sessions';

export const POST = (req: Request, { params }: Ctx) =>
  handle(async () => {
    await approveWorker((await params).id, new URL(req.url).searchParams.get('key') ?? '');
    return { ok: true };
  });
