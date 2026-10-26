import { z } from 'zod';
import { handle, parseBody } from '@/lib/http';
import { createSession } from '@/lib/sessions';

export const POST = (req: Request) =>
  handle(async () => ({ id: await createSession((await parseBody(req, z.object({ instruction: z.string() }))).instruction) }));
