/**
 * Logging contract for UltraCode.
 *
 * Components receive a {@link Logger} via their context (e.g. {@link ToolContext})
 * rather than reaching for a global. Two reference implementations are provided:
 * {@link ConsoleLogger} (level-filtered, optionally silent) and {@link NoopLogger}
 * (discards everything — ideal for tests and library embedding).
 */

/** Structured metadata attached to a log line. JSON-safe by convention. */
export type LogMeta = Record<string, unknown>;

/** Ordered log severities, lowest to highest. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Minimal structured logger. All methods are non-throwing and fire-and-forget;
 * a logger MUST NOT propagate I/O errors to its callers.
 */
export interface Logger {
  debug(msg: string, meta?: LogMeta): void;
  info(msg: string, meta?: LogMeta): void;
  warn(msg: string, meta?: LogMeta): void;
  error(msg: string, meta?: LogMeta): void;
}

/** Numeric rank for each level; higher means more severe. */
const LEVEL_RANK: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Sink abstraction so {@link ConsoleLogger} stays testable without stubbing globals. */
export interface LogSink {
  debug(msg: string, meta?: LogMeta): void;
  info(msg: string, meta?: LogMeta): void;
  warn(msg: string, meta?: LogMeta): void;
  error(msg: string, meta?: LogMeta): void;
}

/** Options for {@link ConsoleLogger}. */
export interface ConsoleLoggerOptions {
  /** Minimum level to emit. Lines below this are dropped. Defaults to `"info"`. */
  level?: LogLevel;
  /** When `true`, suppresses all output regardless of level. Defaults to `false`. */
  silent?: boolean;
  /** Output sink. Defaults to the global `console`. */
  sink?: LogSink;
}

/**
 * Level-filtered logger writing to a {@link LogSink} (the global `console` by
 * default). Honours a `silent` flag for fully suppressed output.
 */
export class ConsoleLogger implements Logger {
  private level: LogLevel;
  private silent: boolean;
  private readonly sink: LogSink;

  constructor(options: ConsoleLoggerOptions = {}) {
    this.level = options.level ?? "info";
    this.silent = options.silent ?? false;
    this.sink = options.sink ?? console;
  }

  /** Change the minimum emitted level at runtime. */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /** Toggle silent mode at runtime. */
  setSilent(silent: boolean): void {
    this.silent = silent;
  }

  private enabled(level: LogLevel): boolean {
    if (this.silent) return false;
    return LEVEL_RANK[level] >= LEVEL_RANK[this.level];
  }

  debug(msg: string, meta?: LogMeta): void {
    if (this.enabled("debug")) this.sink.debug(msg, meta);
  }

  info(msg: string, meta?: LogMeta): void {
    if (this.enabled("info")) this.sink.info(msg, meta);
  }

  warn(msg: string, meta?: LogMeta): void {
    if (this.enabled("warn")) this.sink.warn(msg, meta);
  }

  error(msg: string, meta?: LogMeta): void {
    if (this.enabled("error")) this.sink.error(msg, meta);
  }
}

/** A {@link Logger} that discards every message. */
export class NoopLogger implements Logger {
  debug(): void {
    /* intentionally empty */
  }
  info(): void {
    /* intentionally empty */
  }
  warn(): void {
    /* intentionally empty */
  }
  error(): void {
    /* intentionally empty */
  }
}
