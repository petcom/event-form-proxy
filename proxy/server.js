import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';
import { LRUCache } from 'lru-cache';
import ms from 'ms'; // Install with: npm install ms

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8180;

// Config from .env
const TARGET_URL = process.env.TARGET_URL;          // e.g. http://localhost:3000
const API_PATH = process.env.API_PATH || '/api';    // e.g. /api
const LOGIN_PATH = process.env.LOGIN_PATH || '/jwtlogin';
const LOGIN_USER = process.env.LOGIN_USER;
const LOGIN_PASS = process.env.LOGIN_PASS;

// AUDIO STREAMING PROXY
const CDN_BASE = process.env.DIGITAL_OCEAN_CDN;       // e.g. https://sonar-media.sfo3.cdn.digitaloceanspaces.com/
const AUDIO_DIR = process.env.CDN_AUDIO_DIR || 'mixer';
const ALLOWED_PROFILES = (process.env.ALLOWED_AUDIO_PROFILES || 'andrew,pro,basic').split(',');


console.log('[ENV]', {
  PORT,
  TARGET_URL,
  API_PATH,
  LOGIN_PATH,
  LOGIN_USER,
  LOGIN_PASS,
});

// Derived URLs
const FULL_API_URL = `${TARGET_URL}${API_PATH}`;
const FULL_LOGIN_URL = `${TARGET_URL}${API_PATH}${LOGIN_PATH}`;

console.log('[ENV]', {
  FULL_LOGIN_URL
});

// LRU Cache config
const cache = new LRUCache({
  maxSize: parseInt(process.env.CACHE_MAX_SIZE || '512000'),
  ttl: parseInt(process.env.CACHE_TTL_MS || '60000'),
  sizeCalculation: (value, key) => {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  }
});

let jwtToken = null;
let tokenExpiry = null;

app.use(cors());
app.use(express.json());

// Google Apps Script proxy route (place this BEFORE the generic /proxy-api handler)
app.post('/proxy-api/forms', async (req, res) => {
  console.log('HIT /proxy-api/forms');
  console.log('Request body:', req.body);

  const scriptUrl = req.query.scriptUrl || process.env.GOOGLE_SCRIPT_URL;
  console.log('Using scriptUrl:', scriptUrl);

  if (!scriptUrl) {
    console.error('Missing Google Apps Script URL.');
    return res.status(400).json({ error: 'Missing Google Apps Script URL.' });
  }

  try {
    const fetchOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      redirect: 'follow',
    };
    console.log('Fetch options:', fetchOptions);

    const response = await fetch(scriptUrl, fetchOptions);

    console.log('Google Apps Script response status:', response.status);
    console.log('Google Apps Script response headers:', response.headers.raw());

    const contentType = response.headers.get('content-type') || '';
    console.log('Google Apps Script response content-type:', contentType);

    if (contentType.includes('application/json')) {
      const data = await response.json();
      console.log('Google Apps Script JSON response:', data);
      res.status(response.status).json(data);
    } else {
      const text = await response.text();
      console.log('Google Apps Script text response:', text);

      if (response.ok) {
        res.status(200).json({ success: true, message: "Your data has been recorded." });
      } else {
        res.status(response.status).json({ success: false, error: "Google Apps Script error", detail: text });
      }
    }
  } catch (err) {
    console.error('[Google Form Proxy] Error:', err);
    res.status(500).json({ error: 'Proxy error', details: err.message, stack: err.stack });
  }
});

async function getToken() {
  if (jwtToken && tokenExpiry && Date.now() < tokenExpiry) {
    return jwtToken;
  }

  console.log('[PROXY] Requesting new token...');
  const response = await fetch(FULL_LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: LOGIN_USER, password: LOGIN_PASS }),
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

  // Convert expiresIn (e.g. "10m") to milliseconds
  const ttlMs = typeof data.expiresIn === 'string'
    ? ms(data.expiresIn)
    : (data.expiresIn || 3600) * 1000;

  tokenExpiry = Date.now() + ttlMs - 60000; // refresh 1 minute early

  return jwtToken;
}

app.use('/proxy-api', async (req, res) => {
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
    const targetUrl = `${FULL_API_URL}${req.url}`;
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

// Clear cache manually
app.get('/proxy-api/cache/clear', (req, res) => {
  cache.clear();
  console.log('[CACHE] Manually cleared');
  res.json({ message: 'Cache cleared successfully' });
});


// Audio streaming proxy - serves audio files from DigitalOcean CDN
// Use a regex pattern to capture everything after the profile
app.get(/^\/audio-mixer\/([^\/]+)\/(.+)$/, async (req, res) => {
  const profile = req.params[0];
  const filePath = req.params[1];

  if (!ALLOWED_PROFILES.includes(profile)) {
    return res.status(403).send('Invalid audio profile');
  }

  const remoteUrl = `${CDN_BASE}${AUDIO_DIR}/${profile}/${filePath}`;

  console.log(`[AUDIO PROXY] Request for: ${remoteUrl}`);

  try {
    const response = await fetch(remoteUrl, {
      headers: {
        ...(req.headers.range ? { Range: req.headers.range } : {}),
      },
    });

    if (!response.ok) {
      console.error(`[AUDIO PROXY] Error: ${response.status} for ${remoteUrl}`);
      return res.status(response.status).send('File not found or error fetching audio.');
    }

    // Forward response status and headers
    res.status(response.status);
    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
    }

    // Pipe audio stream
    response.body.pipe(res);
  } catch (err) {
    console.error('[AUDIO PROXY ERROR]', err);
    res.status(500).send('Audio proxy failure.');
  }
});


app.listen(PORT, () => {
  console.log(`🔐 Secure proxy with LRU cache running at http://localhost:${PORT}/proxy-api`);
});