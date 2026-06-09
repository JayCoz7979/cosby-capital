/**
 * PCI-compliant structured logger (S14-003)
 * Strips card numbers, SSN, EIN, API keys, JWTs, passwords before logging.
 * Never use console.log directly — use this logger.
 */

const SCRUB_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, label: "[CARD]" },
  { pattern: /\b\d{3}-?\d{2}-?\d{4}\b/g, label: "[SSN]" },
  { pattern: /\b\d{2}-?\d{7}\b/g, label: "[EIN]" },
  {
    pattern: /sk-ant-api[0-9]{2}-[a-zA-Z0-9\-_]{93}AA/g,
    label: "[ANTHROPIC_KEY]",
  },
  { pattern: /eyJ[a-zA-Z0-9+/=]{100,}/g, label: "[JWT]" },
  {
    pattern: /rk_(live|test)_[a-zA-Z0-9]{24,}/g,
    label: "[STRIPE_RESTRICTED_KEY]",
  },
  { pattern: /sk_(live|test)_[a-zA-Z0-9]{24,}/g, label: "[STRIPE_SECRET_KEY]" },
  { pattern: /re_[a-zA-Z0-9]{30,}/g, label: "[RESEND_KEY]" },
  { pattern: /"password"\s*:\s*"[^"]*"/g, label: '"password":"[REDACTED]"' },
  { pattern: /"secret"\s*:\s*"[^"]*"/g, label: '"secret":"[REDACTED]"' },
  { pattern: /"token"\s*:\s*"[^"]*"/g, label: '"token":"[REDACTED]"' },
  {
    pattern: /Authorization:\s*Bearer\s+[^\s]+/gi,
    label: "Authorization: Bearer [REDACTED]",
  },
];

export function sanitizeForLog(data: unknown): unknown {
  if (data === null || data === undefined) return data;

  if (typeof data === "string") {
    let sanitized = data;
    for (const { pattern, label } of SCRUB_PATTERNS) {
      pattern.lastIndex = 0;
      sanitized = sanitized.replace(pattern, label);
    }
    return sanitized;
  }

  if (typeof data === "number" || typeof data === "boolean") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForLog(item));
  }

  if (typeof data === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey === "password" ||
        lowerKey === "secret" ||
        lowerKey === "token" ||
        lowerKey === "api_key" ||
        lowerKey === "apikey" ||
        lowerKey === "authorization" ||
        lowerKey === "ssn" ||
        lowerKey === "ein" ||
        lowerKey === "card_number" ||
        lowerKey === "cardnumber"
      ) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = sanitizeForLog(value);
      }
    }
    return sanitized;
  }

  return data;
}

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: unknown;
  error?: {
    message: string;
    name: string;
  };
}

function writeLog(
  level: LogLevel,
  message: string,
  data?: unknown,
  error?: unknown
): void {
  const entry: LogEntry = {
    level,
    message: sanitizeForLog(message) as string,
    timestamp: new Date().toISOString(),
  };

  if (data !== undefined) {
    entry.data = sanitizeForLog(data);
  }

  if (error instanceof Error) {
    entry.error = {
      message: sanitizeForLog(error.message) as string,
      name: error.name,
    };
  }

  const output = JSON.stringify(entry);

  if (level === "error") {
    console.error(output);
  } else if (level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  info(message: string, data?: unknown): void {
    writeLog("info", message, data);
  },
  warn(message: string, data?: unknown): void {
    writeLog("warn", message, data);
  },
  error(message: string, error?: unknown, data?: unknown): void {
    writeLog("error", message, data, error);
  },
  debug(message: string, data?: unknown): void {
    if (process.env.LOG_LEVEL === "debug") {
      writeLog("debug", message, data);
    }
  },
};
