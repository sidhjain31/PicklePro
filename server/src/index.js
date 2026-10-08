import { start } from './server.js';

const missing = ['MONGODB_URI', 'ADMIN_PASSWORD', 'SESSION_SECRET'].filter(k => !process.env[k]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')} (see server/.env.example)`);
  process.exit(1);
}
if (process.env.SESSION_SECRET.length < 32) {
  console.error('SESSION_SECRET must be at least 32 characters');
  process.exit(1);
}

// Keep serving on a stray async error: all state is in Mongo, so staying up beats a restart mid-event.
process.on('unhandledRejection', err => console.error('unhandled rejection', err));

const { port } = await start({ port: Number(process.env.PORT ?? 4000) });
console.log(`Team draw server on :${port}`);
