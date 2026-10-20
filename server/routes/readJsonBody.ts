import type { Context } from 'hono';

/** The request's JSON body, or an empty object when it has none or it isn't valid JSON (as express.json() left it). */
export async function readJsonBody(c: Context): Promise<any> {
  const body = await c.req.json().catch(() => undefined);
  return body && typeof body === 'object' ? body : {};
}
