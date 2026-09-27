import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPOSE_FILE = resolve(__dirname, 'docker-compose.yml');
const PROJECT_NAME = process.env.FACILPAY_IT_PROJECT ?? 'facilpay-sdk-it';
const API_BASE_URL = process.env.FACILPAY_API_BASE_URL ?? 'http://localhost:4000';
const API_KEY_ENV = 'FACILPAY_API_KEY';

function compose(args: string[], options: { stdio?: 'inherit' | 'pipe' } = {}): string {
  return execFileSync(
    'docker',
    ['compose', '-f', COMPOSE_FILE, '-p', PROJECT_NAME, ...args],
    { encoding: 'utf8', stdio: options.stdio ?? 'pipe' },
  );
}

async function waitForApi(timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API_BASE_URL}/health`);
      if (res.ok) return;
      lastError = new Error(`health check returned ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`facilpay-api did not become healthy: ${String(lastError)}`);
}

async function registerUserAndCreateKey(): Promise<string> {
  const email = `sdk-it-${Date.now()}@example.com`;
  const password = 'integration-test-password';

  const registerRes = await fetch(`${API_BASE_URL}/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!registerRes.ok) {
    throw new Error(`register failed: ${registerRes.status} ${await registerRes.text()}`);
  }
  const { token } = (await registerRes.json()) as { token: string };

  const keyRes = await fetch(`${API_BASE_URL}/v1/api-keys`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name: 'sdk-integration', prefix: 'fp_test_' }),
  });
  if (!keyRes.ok) {
    throw new Error(`api key creation failed: ${keyRes.status} ${await keyRes.text()}`);
  }
  const { key } = (await keyRes.json()) as { key: string };
  if (!key.startsWith('fp_test_')) {
    throw new Error(`expected fp_test_ prefixed key, got ${key.slice(0, 8)}...`);
  }
  return key;
}

export async function setup(): Promise<void> {
  if (!existsSync(COMPOSE_FILE)) {
    throw new Error(`missing compose file at ${COMPOSE_FILE}`);
  }

  compose(['up', '-d', '--build', '--wait'], { stdio: 'inherit' });
  await waitForApi();

  const apiKey = await registerUserAndCreateKey();
  process.env[API_KEY_ENV] = apiKey;
  process.env.FACILPAY_API_BASE_URL = API_BASE_URL;
}

export async function teardown(): Promise<void> {
  try {
    compose(['down', '-v', '--remove-orphans'], { stdio: 'inherit' });
  } catch (err) {
    console.error('failed to tear down integration stack:', err);
  }
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  await setup();
  return teardown;
}
