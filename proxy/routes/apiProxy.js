import { Router } from 'express';
import fetch from 'node-fetch';
import { LRUCache } from 'lru-cache';
import ms from 'ms';
import { config } from '../config/env.js';

const apiProxyRouter = Router();

const cache = new LRUCache({
  maxSize: config.CACHE_MAX_SIZE,
  ttl: config.CACHE_TTL_MS,
  sizeCalculation: (value) => Buffer.byteLength(JSON.stringify(value), 'utf8'),
});

let jwtToken = null;
let tokenExpiry = null;

async function getToken() {
  if (jwtToken && tokenExpiry && Date.now() < tokenExpiry) {
    return jwtToken;
  }

  console.log('[PROXY] Requesting new token...');
  const response = await fetch(config.FULL_LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: config.LOGIN_USER, password: config.LOGIN_PASS }),
  });

  if (!response.ok) {
    console.error(`[PROXY] Login failed: ${response.status}`);
    throw new Error('Login failed');
  }

  const data = await response.json();

  if (!data.token) {
    throw new Error('No token received from auth server');
  }

  jwtToken = data.token;

  const ttlMs = typeof data.expiresIn === 'string' ? ms(data.expiresIn) : (data.expiresIn || 3600) * 1000;
  tokenExpiry = Date.now() + ttlMs - 60000;

  return jwtToken;
}

apiProxyRouter.get('/cache/clear', (req, res) => {
  cache.clear();
  console.log('[CACHE] Manually cleared');
  res.json({ message: 'Cache cleared successfully' });
});

apiProxyRouter.use(async (req, res) => {
  try {
    const cacheKey = `${req.method}:${req.originalUrl}`;

    if (req.method === 'GET') {
      const cached = cache.get(cacheKey);
      if (cached) {
        console.log(`[CACHE] HIT for ${cacheKey}`);
        return res.json(cached);
      }
    }

    const token = await getToken();
    const targetUrl = `${config.FULL_API_URL}${req.url}`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const options = {
      method: req.method,
      headers,
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? JSON.stringify(req.body) : undefined,
    };

    const apiRes = await fetch(targetUrl, options);
    const contentType = apiRes.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    const body = isJson ? await apiRes.json() : await apiRes.text();

    if (req.method === 'GET' && apiRes.ok && isJson) {
      cache.set(cacheKey, body);
      console.log(`[CACHE] STORED ${cacheKey}`);
    }

    if (isJson) {
      res.status(apiRes.status).json(body);
    } else {
      res.status(apiRes.status).send(body);
    }
  } catch (error) {
    console.error('[PROXY ERROR]', error);
    res.status(500).json({ error: 'Proxy failure', detail: error.message });
  }
});

export default apiProxyRouter;
