'use strict';

const http = require('http');

const MAX_BODY_BYTES = 64 * 1024;
const PORT = Number(process.env.PORT || 8080);

function writeLog(event, fields) {
  process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), event, ...fields })}\n`);
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"status":"ok"}');
    return;
  }

  if (req.method !== 'POST' || req.url !== '/api/alerts') {
    res.writeHead(404);
    res.end();
    return;
  }

  let body = '';
  let bodyBytes = 0;
  let bodyTooLarge = false;
  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    if (bodyTooLarge) return;
    bodyBytes += Buffer.byteLength(chunk);
    if (bodyBytes > MAX_BODY_BYTES) {
      bodyTooLarge = true;
      res.writeHead(413);
      res.end();
      return;
    }
    body += chunk;
  });

  req.on('end', () => {
    if (bodyTooLarge) return;
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400);
      res.end('invalid JSON');
      return;
    }

    const alerts = Array.isArray(payload) ? payload : Array.isArray(payload.alerts) ? payload.alerts : [payload];
    const summary = alerts.slice(0, 100).map((alert) => ({
      status: String(alert.status || payload.status || 'unknown').slice(0, 32),
      labels: {
        alertname: String(alert.labels?.alertname || '').slice(0, 128),
        severity: String(alert.labels?.severity || '').slice(0, 32)
      },
      annotations: {
        summary: String(alert.annotations?.summary || '').slice(0, 512),
        description: String(alert.annotations?.description || '').slice(0, 2048)
      },
      startsAt: String(alert.startsAt || '').slice(0, 64),
      endsAt: String(alert.endsAt || '').slice(0, 64)
    }));
    writeLog('ALERT_RECEIVED', { alerts: summary });
    res.writeHead(202, { 'content-type': 'application/json' });
    res.end('{"status":"accepted"}');
  });
});

server.listen(PORT, '0.0.0.0', () => {
  writeLog('ALERT_SINK_READY', { port: PORT });
});

server.on('error', (error) => {
  writeLog('ALERT_SINK_ERROR', { message: error.message });
  process.exitCode = 1;
});
