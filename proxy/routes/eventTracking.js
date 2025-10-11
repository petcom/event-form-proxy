import { Router } from 'express';
import fetch from 'node-fetch';
import { config, TRACK_MAP } from '../config/env.js';

const eventTrackingRouter = Router();
const submissionTimestamps = new Map();

function buildPayload(body = {}) {
  const {
    form_type = 'event_rsvp',
    event_slug,
    first_name,
    email,
    phone,
    plus_one,
    sms_opt_in,
    interest,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    page_path,
    timestamp,
    trackingKey,
    sheet_id,
    sheetId,
    sheet_name,
    sheetName,
    ...rest
  } = body;

  return {
    form_type,
    event_slug,
    first_name,
    email,
    phone,
    plus_one,
    sms_opt_in,
    interest,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    page_path,
    timestamp: timestamp || new Date().toISOString(),
    trackingKey: trackingKey,
    sheetName: sheet_name || sheetName || sheetId,
    ...rest,
  };
}

function getThrottleKey(payload) {
  const identifier = payload.email || payload.phone || 'anonymous';
  return `${payload.trackingKey || 'RLC-Track'}::${payload.event_slug || 'unknown'}::${identifier.toLowerCase()}`;
}   

eventTrackingRouter.post('/', async (req, res) => {
  console.log('HIT /forms (event tracking)');
  console.log('Request body:', req.body);

  const payload = buildPayload(req.body);

  if (!payload.event_slug) {
    return res.status(400).json({ error: 'event_slug is required' });
  }

  if (!payload.first_name) {
    return res.status(400).json({ error: 'first_name is required' });
  }

  if (!payload.email && !payload.phone) {
    return res.status(400).json({ error: 'Either email or phone is required' });
  }

  const endpoint = config.TRACKING_SCRIPT_URL || config.EVENT_TRACKING_ENDPOINT;
  if (!endpoint) {
    return res.status(500).json({ error: 'Tracking endpoint is not configured' });
  }

  const trackingConfig = TRACK_MAP[payload.trackingKey];
  if (!trackingConfig) {
    return res.status(400).json({
      error: `Invalid trackingKey: ${payload.trackingKey}`,
      availableKeys: Object.keys(TRACK_MAP),
    });
  }
  console.log(`Using tracking config for "${payload.trackingKey}":`, trackingConfig);
  const resolvedSheetName = payload.sheetName || trackingConfig.sheetName;
  if (!resolvedSheetName) {
    return res.status(400).json({ error: 'sheetName is required' });
  }
  payload.sheetName = resolvedSheetName;
  console.log('Resolved sheetName:', resolvedSheetName);

  const now = Date.now();
  const throttleKey = getThrottleKey(payload);
  const lastSubmission = submissionTimestamps.get(throttleKey);

  if (lastSubmission && now - lastSubmission < config.EVENT_TRACKING_THROTTLE_MS) {
    const retryAfterMs = config.EVENT_TRACKING_THROTTLE_MS - (now - lastSubmission);
    const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
    res.setHeader('Retry-After', retryAfterSeconds.toString());
    console.warn('[TRACKING THROTTLE] Too many submissions for key:', throttleKey, 'retryAfterSeconds:', retryAfterSeconds);
    return res.status(429).json({ error: 'Please wait before submitting again', retryAfterSeconds });
  }

  submissionTimestamps.set(throttleKey, now);

  try {
    const forwardedPayload = {
      ...payload,
      spreadsheetId: trackingConfig.spreadsheetId,
      sheetName: resolvedSheetName,
    };

    delete forwardedPayload.sheetId;

    console.log('Sending payload to tracking script:', forwardedPayload);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(forwardedPayload),
    });

    const contentType = response.headers.get('content-type') || '';
    console.log('Tracking script response status:', response.status);
    if (typeof response.headers.raw === 'function') {
      console.log('Tracking script response headers:', response.headers.raw());
    }
    console.log('Tracking script response content-type:', contentType);

    if (contentType.includes('application/json')) {
      const data = await response.json();
      console.log('Tracking script JSON response:', data);
      return res.status(response.status).json(data);
    }

    const text = await response.text();
    console.log('Tracking script text response:', text);

    if (response.status === 403) {
      const detailSnippet = text.length > 500 ? `${text.slice(0, 500)}…` : text;
      console.error(
        '[TRACKING SCRIPT ACCESS] 403 Access Denied received. The Apps Script deployment must allow unauthenticated access ("Anyone" or "Anyone with the link").'
      );
      return res.status(502).json({
        error: 'Tracking script returned 403 Access Denied',
        detail: detailSnippet,
        endpoint,
      });
    }

    return res.status(response.status).send(text);
  } catch (error) {
    console.error('[EVENT TRACKING PROXY ERROR]', error);
    submissionTimestamps.delete(throttleKey);
    return res.status(502).json({ error: 'Event tracking proxy failure', detail: error.message });
  }
});

export default eventTrackingRouter;
