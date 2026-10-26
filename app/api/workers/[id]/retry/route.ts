import { type Ctx, handle } from '@/lib/http';
import { requestRetry } from '@/lib/sessions';

export const POST = (req: Request, { params }: Ctx) =>
  handle(async () => {
    await requestRetry((await params).id, new URL(req.url).searchParams.get('key') ?? '');
    return { ok: true };
  });
