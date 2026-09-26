/**
 * Auto-pagination helpers for page-based list endpoints.
 *
 * List endpoints return `{ data, total, page, limit }`-style envelopes. A
 * `PagePromise<T>` wraps the first page request so that it can be both
 * `await`-ed (resolving to the first `Page<T>`) and iterated with `for await`
 * (yielding every item across all pages).
 */

export interface PageEnvelope<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface Page<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextPage(): PagePromise<T> | null;
}

export interface ToArrayOptions {
  /**
   * Required safety cap on the number of items collected. Prevents unbounded
   * memory use when iterating large collections.
   */
  limit: number;
}

/**
 * Fetches a single page given a 1-based page number.
 */
export type PageFetcher<T> = (page: number) => Promise<PageEnvelope<T>>;

function buildPage<T>(envelope: PageEnvelope<T>, fetchPage: PageFetcher<T>): Page<T> {
  const { data, total, page, limit } = envelope;
  const hasMore = page * limit < total;

  return {
    data,
    total,
    page,
    limit,
    hasMore,
    nextPage(): PagePromise<T> | null {
      if (!hasMore) {
        return null;
      }
      return createPagePromise(fetchPage, page + 1);
    },
  };
}

function createPagePromise<T>(fetchPage: PageFetcher<T>, page: number): PagePromise<T> {
  const firstPage = fetchPage(page).then((envelope) => buildPage(envelope, fetchPage));

  const promise = firstPage as PagePromise<T>;

  promise.then = firstPage.then.bind(firstPage);
  promise.catch = firstPage.catch.bind(firstPage);
  promise.finally = firstPage.finally.bind(firstPage);

  promise[Symbol.asyncIterator] = async function* (): AsyncGenerator<T, void, void> {
    let current: Page<T> | null = await firstPage;

    while (current) {
      for (const item of current.data) {
        yield item;
      }
      current = current.nextPage() ? await current.nextPage()! : null;
    }
  };

  promise.toArray = async (options: ToArrayOptions): Promise<T[]> => {
    const { limit } = options;
    const items: T[] = [];

    for await (const item of promise) {
      if (items.length >= limit) {
        break;
      }
      items.push(item);
    }

    return items;
  };

  return promise;
}

/**
 * A promise that resolves to the first `Page<T>` and can also be iterated
 * across every page with `for await`.
 */
export interface PagePromise<T> extends Promise<Page<T>>, AsyncIterable<T> {
  /**
   * Collects items across all pages, stopping at the required `limit` cap.
   */
  toArray(options: ToArrayOptions): Promise<T[]>;
}

/**
 * Creates a `PagePromise<T>` from a page fetcher. The fetcher receives a
 * 1-based page number and returns the raw response envelope.
 */
export function paginate<T>(fetchPage: PageFetcher<T>): PagePromise<T> {
  return createPagePromise(fetchPage, 1);
}
