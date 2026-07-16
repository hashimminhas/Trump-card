import client from 'prom-client';

// Collect Node.js default metrics too (CPU, memory, event loop lag) —
// free extra observability beyond just the app-specific counters below.
client.collectDefaultMetrics({ prefix: 'trump_card_' });

export const gamesStarted = new client.Counter({
  name: 'trump_card_games_started_total',
  help: 'Total number of matches started (solo + online, backend-tracked)'
});

export const apiRequests = new client.Counter({
  name: 'trump_card_api_requests_total',
  help: 'Total API requests received',
  labelNames: ['method', 'route', 'status']
});

export const activeSockets = new client.Gauge({
  name: 'trump_card_active_sockets',
  help: 'Current number of connected Socket.io clients'
});

export const apiRequestDuration = new client.Histogram({
  name: 'trump_card_api_request_duration_seconds',
  help: 'API request duration in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2]
});

export const metricsRegistry = client.register;