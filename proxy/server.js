import express from 'express';
import cors from 'cors';
import { config, SHEET_MAP, TRACK_MAP } from './config/env.js';
import formsRouter from './routes/forms.js';
import apiProxyRouter from './routes/apiProxy.js';
import audioRouter from './routes/audio.js';

const app = express();

console.log('[ENV]', {
  PORT: config.PORT,
  TARGET_URL: config.TARGET_URL,
  API_PATH: config.API_PATH,
  LOGIN_PATH: config.LOGIN_PATH,
  LOGIN_USER: config.LOGIN_USER,
  LOGIN_PASS: config.LOGIN_PASS,
});

console.log('[ENV]', {
  FULL_LOGIN_URL: config.FULL_LOGIN_URL,
});

console.log('[SHEET_MAP] Loaded mappings:', Object.keys(SHEET_MAP));
console.log('[TRACK_MAP] Loaded mappings:', Object.keys(TRACK_MAP));

app.use(cors());
app.use(express.json());

app.use('/proxy-api/forms', formsRouter);
app.use('/proxy-api', apiProxyRouter);
app.use('/audio-mixer', audioRouter);

app.listen(config.PORT, () => {
  console.log(`🔐 Secure proxy with LRU cache running at http://localhost:${config.PORT}/proxy-api`);
});