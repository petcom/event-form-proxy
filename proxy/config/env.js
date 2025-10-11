import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 8180;
const TARGET_URL = process.env.TARGET_URL;
const API_PATH = process.env.API_PATH || '/api';
const LOGIN_PATH = process.env.LOGIN_PATH || '/jwtlogin';
const LOGIN_USER = process.env.LOGIN_USER;
const LOGIN_PASS = process.env.LOGIN_PASS;
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;
const TRACKING_SCRIPT_URL = process.env.TRACKING_SCRIPT_URL;
const CDN_BASE = process.env.DIGITAL_OCEAN_CDN;
const CDN_AUDIO_DIR = process.env.CDN_AUDIO_DIR || 'mixer';
const ALLOWED_AUDIO_PROFILES = (process.env.ALLOWED_AUDIO_PROFILES || 'andrew,pro,basic')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS || '60000', 10);
const CACHE_MAX_SIZE = parseInt(process.env.CACHE_MAX_SIZE || '512000', 10);
const EVENT_TRACKING_ENDPOINT =
  process.env.EVENT_TRACKING_ENDPOINT ||
  (TARGET_URL && API_PATH ? `${TARGET_URL}${API_PATH}/forms` : undefined);
const EVENT_TRACKING_THROTTLE_MS = parseInt(process.env.EVENT_TRACKING_THROTTLE_MS || '15000', 10);

let SHEET_MAP = {};
try {
  SHEET_MAP = JSON.parse(process.env.SHEET_MAP_JSON || '{}');
} catch (error) {
  console.error('[SHEET_MAP] Failed to parse SHEET_MAP_JSON:', error);
}

let TRACK_MAP = {};
try {
  console.log('[TRACK_MAP] Raw TRACK_MAP_JSON:', process.env.TRACK_MAP_JSON);
 TRACK_MAP = JSON.parse(
    process.env.TRACK_MAP_JSON ||
     JSON.stringify({
        'RLA-Track-2': {
          spreadsheetId: '1Jk3y5dTqRtgf56xB5UUOxIGlz8Zfwv4oKRGNkq7elZc',
          sheetName: '2025-1',
        },
      })
  );
} catch (error) {
  console.error('[TRACK_MAP] Failed to parse TRACK_MAP_JSON:', error);
}

const config = {
  PORT,
  TARGET_URL,
  API_PATH,
  LOGIN_PATH,
  LOGIN_USER,
  LOGIN_PASS,
  GOOGLE_SCRIPT_URL,
  CDN_BASE,
  CDN_AUDIO_DIR,
  ALLOWED_AUDIO_PROFILES,
  CACHE_TTL_MS,
  CACHE_MAX_SIZE,
  EVENT_TRACKING_ENDPOINT,
  EVENT_TRACKING_THROTTLE_MS,
  TRACKING_SCRIPT_URL,
  FULL_API_URL: TARGET_URL ? `${TARGET_URL}${API_PATH}` : undefined,
  FULL_LOGIN_URL: TARGET_URL ? `${TARGET_URL}${API_PATH}${LOGIN_PATH}` : undefined,
};

export { config, SHEET_MAP, TRACK_MAP };
