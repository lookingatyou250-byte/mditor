import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const INBOX_DIR = path.join(os.homedir(), '.mditor', 'dsh-inbox');
const ROUTE_PATH = '/__mditor_bridge/events';
const MAX_AGE_MS = 10 * 60 * 1000;

function isLoopbackAddress(addr) {
  if (!addr) return false;
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

export function apply(ctx) {
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => {
      try {
        fs.mkdirSync(INBOX_DIR, { recursive: true });
      } catch {
        // ignore mkdir error if home is restricted
      }

      const clients = new Set();
      let scanning = false;

      const deliverPayload = (payload) => {
        const list = Array.from(clients);
        const target = list[list.length - 1];
        if (!target || target.writableEnded || target.destroyed) {
          return false;
        }
        try {
          target.write(`event: mditor-draft\ndata: ${JSON.stringify(payload)}\n\n`);
          return true;
        } catch {
          clients.delete(target);
          return false;
        }
      };

      const scanInbox = () => {
        if (scanning) return;
        scanning = true;
        try {
          if (!fs.existsSync(INBOX_DIR)) return;
          const now = Date.now();
          const files = fs.readdirSync(INBOX_DIR)
            .filter((name) => name.endsWith('.json'))
            .sort();

          for (const name of files) {
            const fullPath = path.join(INBOX_DIR, name);
            let stat;
            try {
              stat = fs.statSync(fullPath);
            } catch {
              continue;
            }

            // Discard stale drafts left over from earlier sessions
            if (now - stat.mtimeMs > MAX_AGE_MS) {
              try {
                fs.unlinkSync(fullPath);
              } catch {
                // ignore
              }
              continue;
            }

            // Wait until a DSH Web UI client is connected before consuming
            if (clients.size === 0) break;

            let raw;
            try {
              raw = fs.readFileSync(fullPath, 'utf8');
            } catch {
              continue;
            }

            let payload;
            try {
              payload = JSON.parse(raw);
            } catch {
              try {
                fs.unlinkSync(fullPath);
              } catch {
                // ignore
              }
              continue;
            }

            if (!payload || typeof payload.prompt !== 'string' || !payload.prompt.trim()) {
              try {
                fs.unlinkSync(fullPath);
              } catch {
                // ignore
              }
              continue;
            }

            if (deliverPayload(payload)) {
              try {
                fs.unlinkSync(fullPath);
              } catch {
                // ignore
              }
            }
          }
        } finally {
          scanning = false;
        }
      };

      const unregisterRoute = webCtx.webServer.register({
        kind: 'exact',
        path: ROUTE_PATH,
        handler(req, res) {
          if (req.method !== 'GET') {
            res.writeHead(405, { Allow: 'GET' });
            res.end();
            return;
          }
          if (!isLoopbackAddress(req.socket?.remoteAddress)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
          }

          res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          });
          res.write(': connected\n\n');

          clients.add(res);
          const cleanupClient = () => {
            clients.delete(res);
          };
          req.on('close', cleanupClient);
          res.on('close', cleanupClient);
          res.on('error', cleanupClient);

          // Immediately flush any waiting mditor drafts
          setTimeout(scanInbox, 50);
        },
      });

      let watcher = null;
      try {
        watcher = fs.watch(INBOX_DIR, { persistent: false }, () => {
          setTimeout(scanInbox, 40);
        });
        watcher.on('error', () => {
          watcher = null;
        });
      } catch {
        watcher = null;
      }

      const pollTimer = setInterval(scanInbox, 1200);
      const pingTimer = setInterval(() => {
        for (const res of Array.from(clients)) {
          if (res.writableEnded || res.destroyed) {
            clients.delete(res);
            continue;
          }
          try {
            res.write(': ping\n\n');
          } catch {
            clients.delete(res);
          }
        }
      }, 25000);

      return () => {
        clearInterval(pollTimer);
        clearInterval(pingTimer);
        if (watcher) {
          try {
            watcher.close();
          } catch {
            // ignore
          }
        }
        for (const res of Array.from(clients)) {
          try {
            res.end();
          } catch {
            // ignore
          }
        }
        clients.clear();
        unregisterRoute();
      };
    });
  });
}
