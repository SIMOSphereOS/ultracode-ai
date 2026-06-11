/**
 * Error hierarchy for UltraCode.
 *
 * All runtime errors thrown across UltraCode packages derive from
 * {@link UltraCodeError}. Each error carries a stable, machine-readable
 * `code`, an optional underlying `cause`, and arbitrary structured
 * `details`. Errors are `instanceof`-safe across transpilation targets
 * (via `Object.setPrototypeOf`) and serialise cleanly via `toJSON()`.
 */

/** Structured, JSON-safe representation of an {@link UltraCodeError}. */
export interface SerializedError {
  /** Class name of the error (e.g. `"ConfigError"`). */
  name: string;
  /** Human-readable message. */
  message: string;
  /** Stable machine-readable error code. */
  code: string;
  /** Optional stack trace, when available. */
  stack?: string;
  /** Structured, JSON-safe detail payload. */
  details?: Record<string, unknown>;
  /** Serialised underlying cause, if any. */
  cause?: unknown;
}

/** Options accepted by every {@link UltraCodeError} subclass. */
export interface UltraCodeErrorOptions {
  /** Underlying error or value that triggered this error. */
  cause?: unknown;
  /** Structured, JSON-safe detail payload. */
  details?: Record<string, unknown>;
}

/**
 * Abstract base class for all UltraCode errors.
 *
 * Subclasses MUST provide a stable {@link UltraCodeError.code}. The base
 * class normalises `name`, fixes the prototype chain for reliable
 * `instanceof` checks, and captures a stack trace where supported.
 */
export abstract class UltraCodeError extends Error {
  /** Stable, machine-readable error code (e.g. `"CONFIG_ERROR"`). */
  public readonly code: string;
  /** Structured, JSON-safe detail payload. */
  public readonly details?: Record<string, unknown>;

  protected constructor(code: string, message: string, options: UltraCodeErrorOptions = {}) {
    // `cause` is part of the standard ErrorOptions in ES2022.
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.code = code;
    this.details = options.details;
    this.name = new.target.name;
    // Restore prototype chain so `instanceof` works after transpilation/bundling.
    Object.setPrototypeOf(this, new.target.prototype);
    // Capture a clean stack trace where the V8 API is available.
    if (typeof (Error as { captureStackTrace?: unknown }).captureStackTrace === "function") {
      (Error as unknown as { captureStackTrace: (t: object, c?: unknown) => void }).captureStackTrace(
        this,
        new.target,
      );
    }
  }

  /** JSON-safe representation, suitable for transport and event buses. */
  public toJSON(): SerializedError {
    const out: SerializedError = {
      name: this.name,
      message: this.message,
      code: this.code,
    };
    if (this.stack !== undefined) out.stack = this.stack;
    if (this.details !== undefined) out.details = this.details;
    if (this.cause !== undefined) out.cause = serializeCause(this.cause);
    return out;
  }
}

/** Reduce an arbitrary `cause` to a JSON-safe form without throwing. */
function serializeCause(cause: unknown): unknown {
  if (cause instanceof UltraCodeError) return cause.toJSON();
  if (cause instanceof Error) {
    const out: SerializedError = { name: cause.name, message: cause.message, code: "ERROR" };
    if (cause.stack !== undefined) out.stack = cause.stack;
    return out;
  }
  return cause;
}

/** Configuration loading, parsing or validation failed. */
export class ConfigError extends UltraCodeError {
  constructor(message: string, options: UltraCodeErrorOptions = {}) {
    super("CONFIG_ERROR", message, options);
  }
}

/** Options specific to {@link ProviderError}. */
export interface ProviderErrorOptions extends UltraCodeErrorOptions {
  /** Provider name that produced the error (e.g. `"mistral"`). */
  provider: string;
  /** HTTP status code, when the error originated from an HTTP response. */
  statusCode?: number;
  /** Whether the operation may succeed if retried. Defaults to `false`. */
  retryable?: boolean;
}

/** An LLM provider request failed. */
export class ProviderError extends UltraCodeError {
  /** Provider name that produced the error. */
  public readonly provider: string;
  /** HTTP status code, when applicable. */
  public readonly statusCode?: number;
  /** Whether the operation may succeed if retried. */
  public readonly retryable: boolean;

  constructor(message: string, options: ProviderErrorOptions) {
    super("PROVIDER_ERROR", message, options);
    this.provider = options.provider;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
  }

  public override toJSON(): SerializedError {
    return {
      ...super.toJSON(),
      details: {
        ...this.details,
        provider: this.provider,
        statusCode: this.statusCode,
        retryable: this.retryable,
      },
    };
  }
}

/** Options specific to {@link ToolError} and its subclasses. */
export interface ToolErrorOptions extends UltraCodeErrorOptions {
  /** Name of the tool that failed. */
  toolName: string;
}

/** A tool encountered an error during execution. */
export class ToolError extends UltraCodeError {
  /** Name of the tool that failed. */
  public readonly toolName: string;

  constructor(message: string, options: ToolErrorOptions);
  constructor(code: string, message: string, options: ToolErrorOptions);
  constructor(a: string, b: string | ToolErrorOptions, c?: ToolErrorOptions) {
    const code = typeof c === "undefined" ? "TOOL_ERROR" : a;
    const message = typeof c === "undefined" ? a : (b as string);
    const options = (typeof c === "undefined" ? (b as ToolErrorOptions) : c);
    super(code, message, options);
    this.toolName = options.toolName;
  }

  public override toJSON(): SerializedError {
    return {
      ...super.toJSON(),
      details: { ...this.details, toolName: this.toolName },
    };
  }
}

/** A tool was invoked but the user/permission system denied it. */
export class ToolPermissionDeniedError extends ToolError {
  constructor(message: string, options: ToolErrorOptions) {
    super("TOOL_PERMISSION_DENIED", message, options);
  }
}

/** A tool exceeded its configured execution timeout. */
export class ToolTimeoutError extends ToolError {
  constructor(message: string, options: ToolErrorOptions) {
    super("TOOL_TIMEOUT", message, options);
  }
}

/** A tool was requested that is not registered. */
export class ToolNotFoundError extends ToolError {
  constructor(message: string, options: ToolErrorOptions) {
    super("TOOL_NOT_FOUND", message, options);
  }
}

/** An agent failed during its run lifecycle. */
export class AgentError extends UltraCodeError {
  constructor(message: string, options: UltraCodeErrorOptions = {}) {
    super("AGENT_ERROR", message, options);
  }
}

/** A session operation (create, load, append, prune) failed. */
export class SessionError extends UltraCodeError {
  constructor(message: string, options: UltraCodeErrorOptions = {}) {
    super("SESSION_ERROR", message, options);
  }
}

/** A versioning / release-planning operation failed. */
export class VersioningError extends UltraCodeError {
  constructor(message: string, options: UltraCodeErrorOptions = {}) {
    super("VERSIONING_ERROR", message, options);
  }
}

/** Input validation failed (e.g. tool argument schema mismatch). */
export class ValidationError extends UltraCodeError {
  constructor(message: string, options: UltraCodeErrorOptions = {}) {
    super("VALIDATION_ERROR", message, options);
  }
}
