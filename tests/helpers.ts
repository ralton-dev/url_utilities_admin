import {
  MockAgent,
  setGlobalDispatcher,
  getGlobalDispatcher,
  type Dispatcher,
} from 'undici';
import type { FastifyInstance } from 'fastify';

let mockAgent: MockAgent | null = null;
let savedDispatcher: Dispatcher | null = null;

export function useMockCore(): MockAgent {
  if (mockAgent) {
    mockAgent.close();
    mockAgent = null;
  }
  if (!savedDispatcher) savedDispatcher = getGlobalDispatcher();
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
  return mockAgent;
}

export async function restoreDispatcher(): Promise<void> {
  if (mockAgent) {
    await mockAgent.close();
    mockAgent = null;
  }
  if (savedDispatcher) {
    setGlobalDispatcher(savedDispatcher);
    savedDispatcher = null;
  }
}

export async function makeApp(): Promise<FastifyInstance> {
  const { buildApp } = await import('../src/app.js');
  return buildApp({ logger: false });
}
