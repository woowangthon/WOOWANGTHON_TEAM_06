import { z } from 'zod';
import { initDb } from '@/lib/db';
import { RateLimitError } from '@/lib/lessons';
import { LlmError } from '@/lib/llm';
import { ForbiddenError, NotFoundError, StaleLevelError, ValidationError } from '@/lib/sessions';

let ready: Promise<void> | undefined;
const ensureDb = () => (ready ??= initDb().catch((e) => { ready = undefined; throw e; }));

export function toResponse(e: unknown): Response {
  const status =
    e instanceof ValidationError ? 400
    : e instanceof ForbiddenError ? 403
    : e instanceof NotFoundError ? 404
    : e instanceof StaleLevelError ? 409
    : e instanceof RateLimitError ? 429
    : e instanceof LlmError ? 502
    : 500;
  if (status === 500) {
    console.error(e);
    return Response.json({ error: 'internal error' }, { status });
  }
  return Response.json({ error: (e as Error).message }, { status });
}

export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    await ensureDb();
    return Response.json(await fn());
  } catch (e) {
    return toResponse(e);
  }
}

export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  const body: unknown = await req.json().catch(() => {
    throw new ValidationError('invalid JSON');
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return parsed.data;
}

export type Ctx = { params: Promise<{ id: string }> };
