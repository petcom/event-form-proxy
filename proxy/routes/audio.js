import { Router } from 'express';
import fetch from 'node-fetch';
import { config } from '../config/env.js';

const audioRouter = Router();

audioRouter.get(/^\/([^\/]+)\/(.+)$/, async (req, res) => {
  const profile = req.params[0];
  const filePath = req.params[1];

  if (!config.ALLOWED_AUDIO_PROFILES.includes(profile)) {
    return res.status(403).send('Invalid audio profile');
  }

  const remoteUrl = `${config.CDN_BASE}${config.CDN_AUDIO_DIR}/${profile}/${filePath}`;

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

    res.status(response.status);
    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
    }

    response.body.pipe(res);
  } catch (err) {
    console.error('[AUDIO PROXY ERROR]', err);
    res.status(500).send('Audio proxy failure.');
  }
});

export default audioRouter;
