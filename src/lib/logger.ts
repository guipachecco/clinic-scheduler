// Structured logger that keeps personal data out of the logs.
//
// Rule for the whole project: log ids, statuses and counts only. Never log
// names, phones, emails, tokens or request bodies. The redaction below is a
// safety net for mistakes and for third-party messages, not a license to log
// personal data.

type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const REDACTED = "[removido]";
const MAX_DEPTH = 6;

// Values under these keys are never written, whatever their content.
const SENSITIVE_KEY =
  /pass|secret|token|cookie|authorization|session|e-?mail|phone|telefone|whatsapp|^name$|nome|cpf|address|endere|^ip$|ip_?address|user_?agent|^code$|otp|backup/i;

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
// Brazilian numbers in their usual formats and international E.164 numbers.
// The look-arounds keep ids, dates and timestamps intact.
const PHONE_PATTERN =
  /(?<![\w-])(?:\+?55[\s-]?)?\(?\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}(?![\w-])|\+[1-9]\d{7,14}(?!\d)/g;
// Drizzle puts the query parameters (user input) in the error message.
const QUERY_PARAMS_PATTERN = /\nparams: [\s\S]*?(?=\n\s+at\s|$)/g;

// Error properties that are safe to keep (pg error code, constraint name, Next.js digest).
const SAFE_ERROR_PROPERTIES = ["code", "constraint", "digest"] as const;

export function redactText(text: string): string {
  return text
    .replace(QUERY_PARAMS_PATTERN, `\nparams: ${REDACTED}`)
    .replace(EMAIL_PATTERN, "[email]")
    .replace(PHONE_PATTERN, "[telefone]");
}

// Rebuilds an error with redacted message and stack. Driver details such as
// pg's `detail` ("Key (phone)=(...) already exists") are dropped.
export function toSafeError(error: Error, depth = 0): Error {
  const safe = new Error(redactText(error.message));
  safe.name = error.name;
  safe.stack = error.stack ? redactText(error.stack) : undefined;
  const source = error as Error & Record<string, unknown>;
  const target = safe as Error & Record<string, unknown>;
  for (const property of SAFE_ERROR_PROPERTIES) {
    const value = source[property];
    if (typeof value === "string" || typeof value === "number") {
      target[property] = value;
    }
  }
  if (error.cause instanceof Error && depth < 3) {
    safe.cause = toSafeError(error.cause, depth + 1);
  }
  return safe;
}

function serializeError(error: Error): Record<string, unknown> {
  const safe = toSafeError(error) as Error & Record<string, unknown>;
  const serialized: Record<string, unknown> = {
    name: safe.name,
    message: safe.message,
  };
  for (const property of SAFE_ERROR_PROPERTIES) {
    if (safe[property] !== undefined) serialized[property] = safe[property];
  }
  if (safe.stack) serialized.stack = safe.stack;
  if (safe.cause instanceof Error)
    serialized.cause = serializeError(safe.cause);
  return serialized;
}

export function redact(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === "string") return redactText(value);
  if (typeof value === "bigint") return value.toString();
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return serializeError(value);
  if (depth >= MAX_DEPTH) return "[...]";
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1, seen));
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY.test(key)
      ? REDACTED
      : redact(item, depth + 1, seen);
  }
  return result;
}

function currentLevel(): LogLevel {
  const level = process.env.LOG_LEVEL;
  return level && level in LEVEL_WEIGHT ? (level as LogLevel) : "info";
}

// Captured before installConsoleRedaction() wraps the console.
const output = {
  log: console.log.bind(console),
  error: console.error.bind(console),
};

function write(level: LogLevel, message: string, context?: LogContext) {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[currentLevel()]) return;
  const entry = {
    level,
    time: new Date().toISOString(),
    msg: redactText(message),
    ...(context ? (redact(context) as LogContext) : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "warn" || level === "error") output.error(line);
  else output.log(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) =>
    write("debug", message, context),
  info: (message: string, context?: LogContext) =>
    write("info", message, context),
  warn: (message: string, context?: LogContext) =>
    write("warn", message, context),
  error: (message: string, context?: LogContext) =>
    write("error", message, context),
};

function redactConsoleArgument(argument: unknown): unknown {
  if (argument instanceof Error) return toSafeError(argument);
  return redact(argument);
}

// Production safety net: everything printed through the console (Next.js
// errors, libraries) goes through the same redaction.
export function installConsoleRedaction() {
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) =>
      original(...args.map(redactConsoleArgument));
  }
}
