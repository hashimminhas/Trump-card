import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

import authRoutes from './routers/auth.js';
import profileRoutes from './routers/profile.js';
import friendRoutes from './routers/friends.js';
import roomRoutes from './routers/rooms.js';
import notificationRoutes from './routers/notifications.js';
import { initSockets } from './websockets/sockets.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' })); // full match records are ~50–100 KB

app.get('/api/health', (_req, res) => res.json({ ok: true, phase: '3B' }));
app.use('/api', authRoutes);
app.use('/api', profileRoutes);
app.use('/api', friendRoutes);
app.use('/api', roomRoutes);
app.use('/api', notificationRoutes);

/* Serve the built frontend in production (apps/web/dist) */
const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', '..', '..', 'apps', 'web', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error.' });
});

const httpServer = createServer(app);
initSockets(httpServer);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Electron Card backend on http://localhost:${PORT}`));
