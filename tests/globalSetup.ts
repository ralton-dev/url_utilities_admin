export async function setup() {
  process.env.CORE_URL = 'http://fake-core.test';
  process.env.CORE_API_KEY = 'test-key';
  // App uses fastify.inject() in tests — no port is actually bound, but env
  // validation runs at module-load time and requires a positive integer.
  process.env.PORT = '4001';
  process.env.LOG_LEVEL = 'fatal';
}

export async function teardown() {}
