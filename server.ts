import express from 'express';
import http from 'http';
import path from 'path';
import { getRequestListener } from '@hono/node-server';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { apiApp } from './server/routes/index.ts';
import { isUsingSupabase, normalizeSupabaseUrl } from './server/services/storage/index.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();

  let persistenceLabel =
    'Persistence: local spreadsheet_data.json, single local user (set SUPABASE_URL + SUPABASE_ANON_KEY to use Supabase sign-in)';
  if (isUsingSupabase()) {
    try {
      persistenceLabel = `Persistence: Supabase with Google sign-in (${normalizeSupabaseUrl(process.env.SUPABASE_URL || '')})`;
    } catch (e: any) {
      persistenceLabel = `Persistence: Supabase misconfigured (${e.message})`;
    }
  }
  console.log(persistenceLabel);

  // The API is a Hono app shared with the Cloudflare Worker (worker.ts); Express only serves the front end here.
  const api = getRequestListener(apiApp.fetch);
  app.use((req, res, next) => (req.path === '/api' || req.path.startsWith('/api/') ? api(req, res) : next()));

  const server = http.createServer(app);

  // Vite middleware in dev or static files in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
