import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { HttpClient } from './http';
import { paginate } from './pagination';

interface Widget {
  id: string;
}

const ALL: Widget[] = [
  { id: 'w_1' },
  { id: 'w_2' },
  { id: 'w_3' },
  { id: 'w_4' },
  { id: 'w_5' },
];

const server = setupServer(
  http.get('https://api.test/v1/widgets', ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? '1');
    const limit = Number(url.searchParams.get('limit') ?? '2');
    const start = (page - 1) * limit;
    return HttpResponse.json({
      data: ALL.slice(start, start + limit),
      total: ALL.length,
      page,
      limit,
    });
  }),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function fetchWidgets(page: number, limit = 2): Promise<{ data: Widget[]; total: number; page: number; limit: number }> {
  return fetch(`https://api.test/v1/widgets?page=${page}&limit=${limit}`).then((res) => {
    if (!res.ok) throw new Error(`unexpected status ${res.status}`);
    return res.json() as Promise<{ data: Widget[]; total: number; page: number; limit: number }>;
  });
}

describe('paginate', () => {
  it('awaits the first page', async () => {
    const page = await paginate<Widget>(fetchWidgets);
    expect(page.data.map((w) => w.id)).toEqual(['w_1', 'w_2']);
    expect(page.total).toBe(5);
    expect(page.hasMore).toBe(true);
  });

  it('iterates every item across all pages with for await', async () => {
    const seen: string[] = [];
    for await (const widget of paginate<Widget>(fetchWidgets)) {
      seen.push(widget.id);
    }
    expect(seen).toEqual(['w_1', 'w_2', 'w_3', 'w_4', 'w_5']);
  });

  it('toArray collects across pages up to the required limit cap', async () => {
    const items = await paginate<Widget>(fetchWidgets).toArray({ limit: 4 });
    expect(items.map((w) => w.id)).toEqual(['w_1', 'w_2', 'w_3', 'w_4']);
  });
});

describe('HttpClient.getPage', () => {
  it('iterates every page of a list endpoint', async () => {
    const httpClient = new HttpClient({ baseUrl: 'https://api.test' });
    const seen: string[] = [];
    for await (const widget of httpClient.getPage<Widget>('/v1/widgets', { limit: 2 })) {
      seen.push(widget.id);
    }
    expect(seen).toEqual(['w_1', 'w_2', 'w_3', 'w_4', 'w_5']);
  });
});
