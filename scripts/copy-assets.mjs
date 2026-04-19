import { cp, rm } from 'node:fs/promises';

await rm('dist/views', { recursive: true, force: true });
await rm('dist/public', { recursive: true, force: true });

await cp('src/views', 'dist/views', { recursive: true });
await cp('src/public', 'dist/public', { recursive: true });
