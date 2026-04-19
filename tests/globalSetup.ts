import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  GenericContainer,
  Network,
  Wait,
  type StartedTestContainer,
  type StartedNetwork,
} from 'testcontainers';

const CORE_IMAGE =
  process.env.URL_UTILITIES_IMAGE ?? 'ghcr.io/ralton-dev/url-utilities:v2.2.0';
const ADMIN_API_KEY = 'test-admin-key';

let network: StartedNetwork | undefined;
let pg: StartedPostgreSqlContainer | undefined;
let core: StartedTestContainer | undefined;

export async function setup() {
  network = await new Network().start();

  pg = await new PostgreSqlContainer('postgres:16-alpine')
    .withNetwork(network)
    .withNetworkAliases('pg')
    .withDatabase('urlutil')
    .withUsername('test')
    .withPassword('test')
    .start();

  const pgInternalUrl = 'postgres://test:test@pg:5432/urlutil';

  // Apply schema via the core image's pre-sync migrate script — same path the
  // Helm pre-install Job uses. One-shot: runs, logs, exits.
  // The core image is published as linux/amd64 only; force-pin the platform so
  // this works on arm64 hosts (Apple Silicon) under Docker Desktop emulation.
  const migrator = await new GenericContainer(CORE_IMAGE)
    .withPlatform('linux/amd64')
    .withNetwork(network)
    .withEnvironment({ POSTGRES_URL: pgInternalUrl })
    .withCommand(['node', 'scripts/migrate.mjs'])
    .withWaitStrategy(Wait.forLogMessage('migrations applied'))
    .start();
  await migrator.stop();

  core = await new GenericContainer(CORE_IMAGE)
    .withPlatform('linux/amd64')
    .withNetwork(network)
    .withNetworkAliases('core')
    .withEnvironment({
      POSTGRES_URL: pgInternalUrl,
      API_KEY: ADMIN_API_KEY,
      APP_URL: 'http://core:3000',
      PORT: '3000',
    })
    .withExposedPorts(3000)
    .withWaitStrategy(Wait.forHttp('/api/health', 3000).forStatusCode(200))
    .start();

  process.env.CORE_URL = `http://${core.getHost()}:${core.getMappedPort(3000)}`;
  process.env.CORE_API_KEY = ADMIN_API_KEY;
  process.env.PORT = '4001';
  process.env.LOG_LEVEL = 'fatal';
}

export async function teardown() {
  await core?.stop();
  await pg?.stop();
  await network?.stop();
}
