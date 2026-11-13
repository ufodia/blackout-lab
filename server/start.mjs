#!/usr/bin/env node
import { startServer } from './app.mjs';

const args = process.argv.slice(2);
let dev = false;
let port = 5173;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dev') dev = true;
  else if (args[i] === '--port' && /^\d+$/.test(args[i + 1] ?? '')) port = Number(args[++i]);
  else {
    console.error('Usage: node server/start.mjs [--dev] [--port 5173]');
    process.exit(1);
  }
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Choose a port from 1 to 65535.');
  process.exit(1);
}
try {
  const app = await startServer({ dev, port });
  console.log(
    `\n  Blackout Lab · ${dev ? 'development' : 'local production'}\n  Local: ${app.url}\n  Offline fixture: ${app.url}/demo\n  Bound to 127.0.0.1 only. Press Ctrl+C to stop.\n`,
  );
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch (error) {
  console.error(
    error?.code === 'EADDRINUSE'
      ? `Port ${port} is already in use. Choose another with --port.`
      : 'Blackout Lab could not start. Check dependencies, Node 24 and the local build.',
  );
  process.exit(1);
}
