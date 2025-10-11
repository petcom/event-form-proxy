console.warn('[DEPRECATED] routes/eventTracking.js has been merged into routes/forms.js.');

export default function deprecatedEventTrackingRouter(_req, res, next) {
  if (typeof next === 'function') {
    next();
    return;
  }
  res.status(404).json({ error: 'Deprecated route. Use /proxy-api/forms instead.' });
}
