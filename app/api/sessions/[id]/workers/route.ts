import { z } from 'zod';
import { type Ctx, handle, parseBody } from '@/lib/http';
import { joinSession } from '@/lib/sessions';
import { LANGS } from '@/lib/types';

const Body = z.object({ name: z.string(), lang: z.enum(LANGS) });

export const POST = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const { name, lang } = await parseBody(req, Body);
    return { workerId: await joinSession((await params).id, name, lang) };
  });
