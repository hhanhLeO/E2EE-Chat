/**
 * index.ts — Production entry point.
 * Imports the server factory and starts listening.
 */

import { createApp } from './server';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

const { httpServer } = createApp();

httpServer.listen(PORT, () => {
  console.log(`✓ CipherChat v2 server listening on port ${PORT}`);
});
