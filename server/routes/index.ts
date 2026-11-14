import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AppEnv } from '../app.types.ts';
import { jobsRouter } from './jobs.routes.ts';
import { extractRouter } from './extract.routes.ts';
import { authConfigRouter } from './authConfig.routes.ts';
import { emailSuggestionsRouter } from './emailSuggestions.routes.ts';
import { requireUser } from '../middleware/requireUser.ts';

export const apiRouter = new Hono<AppEnv>();

apiRouter.use(
  '*',
  bodyLimit({
    maxSize: 2 * 1024 * 1024,
    onError: (c) => c.json({ success: false, error: 'Request payload is too large (max 2 MB).' }, 413),
  })
);

// Public: tells the browser how to sign in. Everything registered after requireUser requires a signed-in user.
apiRouter.route('/auth', authConfigRouter);

apiRouter.use('*', requireUser);

apiRouter.route('/jobs', jobsRouter);
apiRouter.route('/email-suggestions', emailSuggestionsRouter);
apiRouter.route('/', extractRouter);

/**
 * The API as one app answering under /api. The same app runs under Node (server.ts, used locally and on Render) and
 * on Cloudflare Workers (worker.ts).
 */
export const apiApp = new Hono<AppEnv>().route('/api', apiRouter);

// Unknown /api paths answer with JSON rather than the app's HTML.
apiApp.notFound((c) => c.json({ success: false, error: 'Not found' }, 404));
