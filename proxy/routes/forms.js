import { Router } from 'express';
import fetch from 'node-fetch';
import { config, SHEET_MAP } from '../config/env.js';

const formsRouter = Router();

formsRouter.post('/', async (req, res) => {
  console.log('HIT /proxy-api/forms');
  console.log('Request body:', req.body);

  const sheetKey = req.body.sheetKey;

  if (!sheetKey) {
    console.error('Missing sheetKey in request body.');
    return res
      .status(400)
      .json({ error: 'Missing sheetKey in request body. Use one of: ' + Object.keys(SHEET_MAP).join(', ') });
  }

  const sheetConfig = SHEET_MAP[sheetKey];

  if (!sheetConfig) {
    console.error(`Invalid sheetKey: ${sheetKey}`);
    return res.status(400).json({
      error: `Invalid sheetKey: ${sheetKey}`,
      availableKeys: Object.keys(SHEET_MAP),
    });
  }

  console.log(`Using sheet config for "${sheetKey}":`, sheetConfig);

  const scriptUrl = req.query.scriptUrl || config.GOOGLE_SCRIPT_URL;

  if (!scriptUrl) {
    console.error('Missing Google Apps Script URL.');
    return res.status(400).json({ error: 'Missing Google Apps Script URL.' });
  }

  const payload = {
    ...req.body,
    spreadsheetId: sheetConfig.spreadsheetId,
    sheetName: sheetConfig.sheetName,
  };

  console.log('Sending payload to Google Script:', payload);

  try {
    const fetchOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    };

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
        res.status(200).json({ success: true, message: 'Your data has been recorded.' });
      } else {
        res.status(response.status).json({ success: false, error: 'Google Apps Script error', detail: text });
      }
    }
  } catch (err) {
    console.error('[Google Form Proxy] Error:', err);
    res.status(500).json({ error: 'Proxy error', details: err.message, stack: err.stack });
  }
});

export default formsRouter;
