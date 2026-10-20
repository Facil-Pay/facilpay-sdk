import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ApiKeysResource } from './api-keys';

type MockClient = {
  request: ReturnType<typeof vi.fn>;
};

function createMockClient(): MockClient {
  return { request: vi.fn() };
}

describe('ApiKeysResource', () => {
  let client: MockClient;
  let apiKeys: ApiKeysResource;

  beforeEach(() => {
    client = createMockClient();
    apiKeys = new ApiKeysResource(
      client as unknown as ConstructorParameters<typeof ApiKeysResource>[0],
    );
  });

  it('create posts to /v1/api-keys with the body', async () => {
    const body = { name: 'test key', environment: 'test' as const };
    client.request.mockResolvedValue({ id: 'key_123' });

    const result = await apiKeys.create(body);

    expect(client.request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/v1/api-keys',
      body,
    });
    expect(result).toEqual({ id: 'key_123' });
  });

  it('list gets /v1/api-keys', async () => {
    client.request.mockResolvedValue([]);

    await apiKeys.list();

    expect(client.request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/v1/api-keys',
    });
  });

  it('retrieve gets /v1/api-keys/:id', async () => {
    client.request.mockResolvedValue({ id: 'key_123' });

    await apiKeys.retrieve('key_123');

    expect(client.request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/v1/api-keys/key_123',
    });
  });

  it('update patches /v1/api-keys/:id with the body', async () => {
    const body = { name: 'renamed' };
    client.request.mockResolvedValue({ id: 'key_123' });

    await apiKeys.update('key_123', body);

    expect(client.request).toHaveBeenCalledWith({
      method: 'PATCH',
      path: '/v1/api-keys/key_123',
      body,
    });
  });

  it('revoke deletes /v1/api-keys/:id', async () => {
    client.request.mockResolvedValue({ id: 'key_123' });

    await apiKeys.revoke('key_123');

    expect(client.request).toHaveBeenCalledWith({
      method: 'DELETE',
      path: '/v1/api-keys/key_123',
    });
  });

  it('rotate posts to /v1/api-keys/:id/rotate', async () => {
    client.request.mockResolvedValue({ id: 'key_123' });

    await apiKeys.rotate('key_123');

    expect(client.request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/v1/api-keys/key_123/rotate',
    });
  });

  it('usage gets /v1/api-keys/:id/usage with query params', async () => {
    const params = { from: '2024-01-01', to: '2024-02-01', interval: 'day' as const };
    client.request.mockResolvedValue({ totalRequests: 1 });

    await apiKeys.usage('key_123', params);

    expect(client.request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/v1/api-keys/key_123/usage',
      query: params,
    });
  });

  it('usage works without params', async () => {
    client.request.mockResolvedValue({ totalRequests: 0 });

    await apiKeys.usage('key_123');

    expect(client.request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/v1/api-keys/key_123/usage',
      query: undefined,
    });
  });
});
