import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    CORE_URL: z.string().url(),
    CORE_API_KEY: z.string().min(1),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
