import { type Ctx, handle } from '@/lib/http';
import { requestRetry } from '@/lib/sessions';

export const POST = (_req: Request, { params }: Ctx) =>
  handle(async () => {
    await requestRetry((await params).id);
    return { ok: true };
  });
