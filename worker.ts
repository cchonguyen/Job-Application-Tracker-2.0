import { apiApp } from './server/routes/index.ts';

/**
 * Cloudflare Workers entry. Cloudflare serves the built app in dist/ directly (see wrangler.toml) and only sends
 * /api/* requests here. Settings from the Cloudflare dashboard reach the code as process.env (nodejs_compat).
 */
export default {
  fetch: apiApp.fetch,
};
