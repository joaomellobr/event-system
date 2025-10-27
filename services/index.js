const fastify = require('fastify')({ logger: true });
const listenMock = require('../mock-server');

fastify.get('/getUsers', async (request, reply) => {
    const resp = await fetch('http://event.com/getUsers');
    const data = await resp.json();
    reply.send(data); 
});

const { logger } = require('../utils/logger');

// --- Circuit Breaker ---
const CB = (() => {
  let state = 'CLOSED';
  let failures = [];
  let nextAttemptAt = 0;
  let cooldownMs = Number(process.env.CB_COOLDOWN_MS ?? 15000);

  const windowMs = Number(process.env.CB_WINDOW_MS ?? 30000);
  const maxFailures = Number(process.env.CB_FAILURES ?? 3);

  const now = () => Date.now();

  function record(success) {
    const t = now();
    failures = failures.filter(ts => t - ts < windowMs);
    if (!success) failures.push(t);

    if (state === 'CLOSED' && failures.length >= maxFailures) {
      state = 'OPEN';
      nextAttemptAt = t + cooldownMs;
      logger.warn && logger.warn('Circuit OPEN', { failures: failures.length, cooldownMs });
    } else if (state === 'HALF_OPEN') {
      if (success) {
        state = 'CLOSED';
        failures = [];
        cooldownMs = Number(process.env.CB_COOLDOWN_MS ?? 15000);
        logger.info && logger.info('Circuit CLOSED after successful probe');
      } else {
        state = 'OPEN';
        cooldownMs = Math.min(cooldownMs * 2, 120000) + Math.floor(Math.random() * 250);
        nextAttemptAt = t + cooldownMs;
        logger.warn && logger.warn('Circuit REOPENED after failed probe', { cooldownMs });
      }
    }
  }

  function allowRequest() {
    const t = now();
    if (state === 'OPEN') {
      if (t >= nextAttemptAt) {
        state = 'HALF_OPEN';
        logger.debug && logger.debug('Circuit HALF_OPEN: allowing probe');
        return { allowed: true, probe: true, retryAfter: 0 };
      }
      return { allowed: false, probe: false, retryAfter: Math.ceil((nextAttemptAt - t) / 1000) };
    }
    return { allowed: true, probe: false, retryAfter: 0 };
  }

  return { record, allowRequest, getState: () => state };
})();

// --- Retry/backoff ---
async function postWithRetry(url, body, max = Number(process.env.RETRY_MAX ?? 3), baseMs = Number(process.env.RETRY_BASE_MS ?? 200)) {
  let lastErr;
  for (let attempt = 0; attempt < max; attempt++) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (resp.ok) return resp;

    if (resp.status >= 500) {
      lastErr = new Error(`Upstream ${resp.status}`);
      const backoff = baseMs * 2 ** attempt + Math.floor(Math.random() * 50);
      await new Promise(r => setTimeout(r, backoff));
      continue;
    }
    throw new Error(`Upstream ${resp.status}`);
  }
  throw lastErr ?? new Error('Upstream error');
}


fastify.post('/addEvent', async (request, reply) => {
  const base = process.env.EVENT_API_BASE || 'http://event.com';

  const { allowed, probe, retryAfter } = CB.allowRequest();
  if (!allowed) {
    return reply
      .code(503)
      .header('Retry-After', retryAfter)
      .send({ success: false, error: 'Service temporarily unavailable', reason: 'circuit_open', retryAfter });
  }

  const payload = { id: Date.now(), ...request.body };

  try {
    const resp = await postWithRetry(`${base}/addEvent`, payload);
    const data = await resp.json();
    CB.record(true);
    return reply.send(data);
  } catch (e) {
    CB.record(false);
    return reply
      .code(503)
      .send({ success: false, error: 'Upstream unavailable', reason: probe ? 'probe_failed' : 'retry_exhausted' });
  }
});


// services/index.js
fastify.get('/getEventsByUserId/:id', async (request, reply) => {
  const base = process.env.EVENT_API_BASE || 'http://event.com';
  const { id } = request.params;

  // 1) load the user and their list of event IDs
  const userResp = await fetch(`${base}/getUserById/${id}`);
  if (!userResp.ok) {
    return reply.code(502).send({ error: 'Failed to load user' });
  }
  const userData = await userResp.json();
  const eventIds = Array.isArray(userData?.events) ? userData.events : [];

  // 2) search for events in parallel with concurrency limit (e.g.: 5)
  const CONCURRENCY = 5;
  const results = new Array(eventIds.length);
  let cursor = 0;

  async function worker() {
    while (cursor < eventIds.length) {
      const myIndex = cursor++;
      const evId = eventIds[myIndex];
      const resp = await fetch(`${base}/getEventById/${evId}`);
      if (!resp.ok) throw new Error(`Failed event ${evId}`);
      results[myIndex] = await resp.json();
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, eventIds.length) }, worker);
  await Promise.all(workers);

  return reply.send(results);
});


fastify.listen({ port: 3000 }, (err) => {
    listenMock();
    if (err) {
      fastify.log.error(err);
      process.exit();
    }
});

