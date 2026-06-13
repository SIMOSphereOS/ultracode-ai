/**
 * Abstract base class for all LLM providers.
 *
 * Centralises the HTTP plumbing every concrete provider needs:
 *
 * - `fetch` with a per-attempt timeout (`AbortController` driven by
 *   {@link ProviderOptions.timeoutMs}).
 * - Retry with exponential backoff + jitter for retryable failures
 *   (HTTP 408/429/5xx, network errors, timeouts) up to `maxRetries`.
 * - `Retry-After` response headers are honoured (seconds or HTTP-date).
 * - The caller's `AbortSignal` always wins: once aborted, no further retries
 *   are attempted and the abort surfaces as a non-retryable
 *   {@link ProviderError}.
 * - Every failure is mapped onto {@link ProviderError} with `provider`,
 *   `statusCode` and `retryable` set correctly.
 *
 * For streaming responses the per-request `fetch` timeout only covers the
 * headers (it resolves the moment they arrive), so a stalled body is guarded by
 * a separate inactivity watchdog owned by the SSE/line parsers. The watchdog is
 * reset on every chunk and, on expiry, raises a {@link StreamIdleTimeoutError}
 * which {@link BaseProvider.toProviderError} maps onto a retryable timeout
 * {@link ProviderError}. The window is {@link BaseProvider.streamIdleTimeoutMs}
 * (reuses {@link ProviderOptions.timeoutMs}).
 *
 * HTTP is performed exclusively through the global `fetch`.
 */

import { NoopLogger, ProviderError, sleep, truncate } from "@ultracode/shared";
import type {
  CompletionChunk,
  CompletionRequest,
  CompletionResult,
  ILLMProvider,
  Logger,
  ProviderId,
  ProviderOptions,
} from "@ultracode/shared";
import { StreamIdleTimeoutError } from "./sse.js";

/** Maximum delay (ms) we are willing to wait between retries. */
const MAX_BACKOFF_MS = 60_000;

/** Maximum number of characters of an error response body kept in details. */
const MAX_ERROR_BODY_CHARS = 2_000;

/** Default timeout (ms) for the lightweight {@link BaseProvider.ping}. */
const HEALTH_CHECK_TIMEOUT_MS = 5_000;

/** Options for a single resilient HTTP request. */
export interface ProviderRequestInit {
  /** HTTP method. Defaults to `"GET"`. */
  method?: string;
  /** Request headers. */
  headers?: Record<string, string>;
  /** Serialised request body. */
  body?: string;
  /** Caller cancellation signal; takes precedence over timeout/retry. */
  signal?: AbortSignal;
  /** Per-attempt timeout override in milliseconds. */
  timeoutMs?: number;
}

/**
 * Parse a `Retry-After` header value into milliseconds.
 * Supports delta-seconds and HTTP-date forms; returns `undefined` when the
 * value is absent or unparsable.
 */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1_000;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

/** Whether an HTTP status code is worth retrying. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Abstract provider base implementing the resilient HTTP layer described in
 * the module docs. Concrete providers implement the wire formats.
 */
export abstract class BaseProvider implements ILLMProvider {
  /** Stable provider identifier. */
  public abstract readonly name: ProviderId;

  protected readonly options: ProviderOptions;
  protected readonly logger: Logger;

  protected constructor(options: ProviderOptions, logger?: Logger) {
    this.options = options;
    this.logger = logger ?? new NoopLogger();
  }

  public abstract listModels(): Promise<string[]>;
  public abstract complete(req: CompletionRequest): Promise<CompletionResult>;
  public abstract stream(req: CompletionRequest): AsyncIterable<CompletionChunk>;
  public abstract healthCheck(): Promise<boolean>;

  /**
   * Perform an HTTP request with timeout, retry/backoff and `Retry-After`
   * support. Resolves with the (ok) `Response`; throws {@link ProviderError}
   * on any failure.
   */
  protected async fetchWithRetry(url: string, init: ProviderRequestInit = {}): Promise<Response> {
    const maxRetries = Math.max(0, Math.floor(this.options.maxRetries));
    const signal = init.signal;
    let attempt = 0;

    for (;;) {
      if (signal?.aborted) throw this.abortError(signal.reason);

      let response: Response;
      try {
        response = await this.fetchOnce(url, init);
      } catch (err) {
        const providerError = this.toProviderError(err, `Request to ${url} failed`);
        const canRetry =
          providerError.retryable && attempt < maxRetries && signal?.aborted !== true;
        if (!canRetry) throw providerError;
        await this.backoff(attempt, undefined, signal);
        attempt += 1;
        continue;
      }

      if (response.ok) return response;

      const status = response.status;
      const retryable = isRetryableStatus(status);
      const bodyText = await this.safeReadBody(response);

      // The caller's abort always wins: no retry, abort error surfaces.
      if (signal?.aborted === true) throw this.abortError(signal.reason);

      if (retryable && attempt < maxRetries) {
        const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
        this.logger.debug(`HTTP ${status} from ${this.name}; retrying`, {
          attempt,
          retryAfterMs,
        });
        await this.backoff(attempt, retryAfterMs, signal);
        attempt += 1;
        continue;
      }

      throw new ProviderError(
        `${this.name} request failed with HTTP ${status}${bodyText ? `: ${truncate(bodyText, 200)}` : ""}`,
        {
          provider: String(this.name),
          statusCode: status,
          retryable,
          details: { url, body: truncate(bodyText, MAX_ERROR_BODY_CHARS) },
        },
      );
    }
  }

  /**
   * One single `fetch` attempt with its own timeout controller. The caller's
   * signal is forwarded so an external abort cancels the in-flight request.
   */
  private async fetchOnce(url: string, init: ProviderRequestInit): Promise<Response> {
    const timeoutMs = init.timeoutMs ?? this.options.timeoutMs;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    // Avoid keeping the event loop alive for the duration of the timeout.
    if (typeof (timer as { unref?: () => void }).unref === "function") {
      (timer as unknown as { unref: () => void }).unref();
    }
    const callerSignal = init.signal;
    const onAbort = (): void => controller.abort(callerSignal?.reason);
    if (callerSignal !== undefined) {
      if (callerSignal.aborted) {
        clearTimeout(timer);
        throw this.abortError(callerSignal.reason);
      }
      callerSignal.addEventListener("abort", onAbort, { once: true });
    }
    try {
      const requestInit: RequestInit = { signal: controller.signal };
      if (init.method !== undefined) requestInit.method = init.method;
      if (init.headers !== undefined) requestInit.headers = init.headers;
      if (init.body !== undefined) requestInit.body = init.body;
      return await fetch(url, requestInit);
    } catch (err) {
      if (callerSignal?.aborted) throw this.abortError(callerSignal.reason ?? err);
      if (timedOut) {
        throw new ProviderError(`${this.name} request timed out after ${timeoutMs}ms`, {
          provider: String(this.name),
          retryable: true,
          cause: err,
          details: { url, timeoutMs },
        });
      }
      throw new ProviderError(
        `${this.name} network error: ${err instanceof Error ? err.message : String(err)}`,
        { provider: String(this.name), retryable: true, cause: err, details: { url } },
      );
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onAbort);
    }
  }

  /** Wait before the next retry: `Retry-After` wins, else exponential backoff + jitter. */
  private async backoff(
    attempt: number,
    retryAfterMs: number | undefined,
    signal?: AbortSignal,
  ): Promise<void> {
    const base = Math.max(0, this.options.retryDelayMs) * 2 ** attempt;
    const jitter = base * 0.25 * Math.random();
    const delay = Math.min(MAX_BACKOFF_MS, retryAfterMs ?? base + jitter);
    try {
      await sleep(delay, signal);
    } catch (err) {
      throw this.abortError(err);
    }
  }

  /** Read a response body as text without ever throwing. */
  private async safeReadBody(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      return "";
    }
  }

  /** Build the non-retryable {@link ProviderError} representing a caller abort. */
  protected abortError(reason: unknown): ProviderError {
    const message =
      reason instanceof Error && reason.message !== ""
        ? `Request aborted: ${reason.message}`
        : "Request aborted";
    return new ProviderError(message, {
      provider: String(this.name),
      retryable: false,
      cause: reason,
      details: { aborted: true },
    });
  }

  /**
   * Map an arbitrary thrown value onto a {@link ProviderError}. Existing
   * `ProviderError`s pass through unchanged; abort-shaped errors (or any error
   * raised while `signal` is aborted) become non-retryable abort errors;
   * everything else becomes retryable=false.
   */
  protected toProviderError(err: unknown, message: string, signal?: AbortSignal): ProviderError {
    if (err instanceof ProviderError) return err;
    // Caller's external abort always wins over an idle timeout.
    if (signal?.aborted === true) return this.abortError(signal.reason ?? err);
    if (err instanceof StreamIdleTimeoutError) {
      return new ProviderError(
        `${this.name} streaming response stalled after ${err.idleTimeoutMs}ms of inactivity`,
        {
          provider: String(this.name),
          retryable: true,
          cause: err,
          details: { idleTimeoutMs: err.idleTimeoutMs, timeout: true },
        },
      );
    }
    if (this.isAbortError(err)) return this.abortError(err);
    return new ProviderError(
      `${message}: ${err instanceof Error ? err.message : String(err)}`,
      { provider: String(this.name), retryable: false, cause: err },
    );
  }

  /** Heuristic for DOM/Node abort errors. */
  protected isAbortError(err: unknown): boolean {
    return (
      (err instanceof DOMException && err.name === "AbortError") ||
      (err instanceof Error && err.name === "AbortError")
    );
  }

  /** Parse a JSON response body; throws a non-retryable {@link ProviderError} on malformed JSON. */
  protected async readJson(response: Response, url: string): Promise<unknown> {
    const text = await this.safeReadBody(response);
    if (text.trim() === "") {
      throw new ProviderError(`${this.name} returned an empty response body`, {
        provider: String(this.name),
        statusCode: response.status,
        retryable: false,
        details: { url },
      });
    }
    try {
      return JSON.parse(text) as unknown;
    } catch (err) {
      throw new ProviderError(`${this.name} returned malformed JSON`, {
        provider: String(this.name),
        statusCode: response.status,
        retryable: false,
        cause: err,
        details: { url, body: truncate(text, MAX_ERROR_BODY_CHARS) },
      });
    }
  }

  /**
   * Inactivity window (ms) for streaming bodies. Reuses the per-request
   * {@link ProviderOptions.timeoutMs}; if a streaming body produces no data
   * within this window the parser aborts the read and the run does not wedge.
   * Concrete providers pass this to the SSE/line parsers (`parseSSEJson`,
   * `parseNDJSON`, `streamLines`) as their `idleTimeoutMs` argument.
   */
  protected streamIdleTimeoutMs(): number {
    return this.options.timeoutMs;
  }

  /** Require a readable body on a streaming response. */
  protected requireBody(response: Response, url: string): ReadableStream<Uint8Array> {
    if (response.body === null) {
      throw new ProviderError(`${this.name} returned a response without a body`, {
        provider: String(this.name),
        statusCode: response.status,
        retryable: false,
        details: { url },
      });
    }
    return response.body;
  }

  /**
   * Fire a single, short, never-throwing probe request. Returns `true` iff the
   * response status is OK. Used by `healthCheck` implementations.
   */
  protected async ping(url: string, headers?: Record<string, string>): Promise<boolean> {
    const controller = new AbortController();
    const timeoutMs = Math.min(this.options.timeoutMs, HEALTH_CHECK_TIMEOUT_MS);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (typeof (timer as { unref?: () => void }).unref === "function") {
      (timer as unknown as { unref: () => void }).unref();
    }
    try {
      const init: RequestInit = { signal: controller.signal };
      if (headers !== undefined) init.headers = headers;
      const response = await fetch(url, init);
      // Drain/cancel the body so connections are not leaked.
      try {
        await response.body?.cancel();
      } catch {
        /* ignore */
      }
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
