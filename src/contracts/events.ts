import type { rpc } from '@stellar/stellar-sdk';

/**
 * Minimal Soroban RPC surface needed to poll contract events.
 * Kept structural so callers can pass a real `rpc.Server` or a mock.
 */
export interface SorobanEventsRpc {
  getEvents(request: rpc.Server.GetEventsRequest): Promise<rpc.Api.GetEventsResponse>;
}

export interface ContractEventOptions {
  /** Ledger to start scanning from when no cursor is supplied. */
  startLedger?: number;
  /** Topic filters forwarded to `getEvents` (e.g. `[['transfer']]`). */
  topics?: string[][];
  /** Optional contract id filter; defaults to the bound contract. */
  contractId?: string;
  /** Abort the subscription. */
  signal?: AbortSignal;
  /** Base delay (ms) between polls. Defaults to 1000. */
  pollIntervalMs?: number;
  /** Maximum backoff delay (ms) after errors. Defaults to 30000. */
  maxBackoffMs?: number;
}

/** A decoded, typed contract event. */
export interface ContractEvent<T = unknown> {
  id: string;
  type: string;
  ledger: number;
  ledgerClosedAt: string;
  contractId: string;
  topics: unknown[];
  value: T;
  txHash: string;
  pagingToken: string;
}

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_MAX_BACKOFF_MS = 30000;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function createAbortError(): Error {
  const err = new Error('Contract event subscription aborted');
  err.name = 'AbortError';
  return err;
}

function decodeEvent(raw: rpc.Api.EventResponse): ContractEvent {
  return {
    id: raw.id,
    type: raw.type,
    ledger: raw.ledger,
    ledgerClosedAt: raw.ledgerClosedAt,
    contractId: raw.contractId ?? '',
    topics: raw.topic ?? [],
    value: raw.value as unknown,
    txHash: raw.txHash,
    pagingToken: raw.pagingToken,
  };
}

/**
 * Shared helper: poll Soroban RPC `getEvents` with cursor handling and
 * exponential backoff, yielding decoded events until aborted.
 *
 * Usable by the payment, escrow and refund contract bindings.
 */
export async function* subscribeToContractEvents(
  server: SorobanEventsRpc,
  contractId: string,
  options: ContractEventOptions = {},
): AsyncGenerator<ContractEvent, void, unknown> {
  const {
    startLedger,
    topics,
    signal,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    maxBackoffMs = DEFAULT_MAX_BACKOFF_MS,
  } = options;

  let cursor: string | undefined;
  let backoff = pollIntervalMs;

  while (!signal?.aborted) {
    const request: rpc.Server.GetEventsRequest = {
      filters: [
        {
          type: 'contract',
          contractIds: [contractId],
          ...(topics && topics.length > 0 ? { topics } : {}),
        },
      ],
      limit: 100,
    };

    if (cursor) {
      request.cursor = cursor;
    } else if (typeof startLedger === 'number') {
      request.startLedger = startLedger;
    }

    let response: rpc.Api.GetEventsResponse;
    try {
      response = await server.getEvents(request);
      backoff = pollIntervalMs;
    } catch (err) {
      if (signal?.aborted) return;
      await sleep(backoff, signal);
      backoff = Math.min(backoff * 2, maxBackoffMs);
      continue;
    }

    for (const raw of response.events ?? []) {
      if (signal?.aborted) return;
      cursor = raw.pagingToken;
      yield decodeEvent(raw);
    }

    if (response.cursor) {
      cursor = response.cursor;
    }

    if (signal?.aborted) return;
    await sleep(pollIntervalMs, signal);
  }
}
