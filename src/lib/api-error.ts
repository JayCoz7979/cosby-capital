/**
 * Central API error handler (GAP-257).
 * Returns generic messages to clients — never exposes stack traces or internals.
 * Logs full error server-side via logger.ts.
 */

import { logger } from "@/lib/logger";

/** Generic client-safe messages keyed by HTTP status code */
const CLIENT_MESSAGES: Record<number, string> = {
  400: "Invalid request. Please check your input and try again.",
  401: "Authentication required. Please sign in and try again.",
  403: "You do not have permission to perform this action.",
  404: "The requested resource was not found.",
  409: "A conflict occurred. The resource may already exist.",
  413: "Request payload too large.",
  415: "Unsupported content type.",
  422: "Validation failed. Please check your input.",
  429: "Too many requests. Please wait before trying again.",
  500: "An unexpected error occurred. Please try again later.",
  503: "Service temporarily unavailable. Please try again later.",
};

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly clientMessage: string;

  constructor(statusCode: number, clientMessage?: string, cause?: unknown) {
    super(clientMessage ?? CLIENT_MESSAGES[statusCode] ?? "An error occurred");
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.clientMessage =
      clientMessage ?? CLIENT_MESSAGES[statusCode] ?? "An error occurred";

    if (cause instanceof Error && cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

/**
 * Handles any error from an API route handler.
 * - Logs full error details server-side (never sent to client)
 * - Returns a Response with a generic, safe client message
 */
export function handleApiError(error: unknown, req?: Request): Response {
  // Already an ApiError — use its status and client message
  if (error instanceof ApiError) {
    logger.warn("API error", {
      statusCode: error.statusCode,
      message: error.clientMessage,
      url: req?.url,
    });
    return Response.json(
      { error: error.clientMessage },
      { status: error.statusCode }
    );
  }

  // Zod validation error — log details, return generic 422
  if (
    error instanceof Error &&
    error.name === "ZodError" &&
    "issues" in error
  ) {
    logger.warn("Validation error", {
      issues: (error as Error & { issues: unknown }).issues,
      url: req?.url,
    });
    return Response.json(
      { error: CLIENT_MESSAGES[422] },
      { status: 422 }
    );
  }

  // Unknown error — log full details, return generic 500
  logger.error("Unhandled API error", error, { url: req?.url });
  return Response.json({ error: CLIENT_MESSAGES[500] }, { status: 500 });
}

/**
 * Validates the Content-Type header of a request.
 * Throws ApiError 415 if the type doesn't match.
 */
export function requireContentType(req: Request, type: string): void {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes(type.toLowerCase())) {
    throw new ApiError(415, `Content-Type must be ${type}`);
  }
}

/**
 * Validates the Content-Length header of a request.
 * Throws ApiError 413 if the payload exceeds maxBytes.
 */
export function requireContentLength(req: Request, maxBytes: number): void {
  const contentLengthHeader = req.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const contentLength = parseInt(contentLengthHeader, 10);
    if (!Number.isNaN(contentLength) && contentLength > maxBytes) {
      throw new ApiError(
        413,
        `Request payload must not exceed ${maxBytes} bytes`
      );
    }
  }
}

/**
 * Factory helpers for common error types.
 */
export const Errors = {
  badRequest: (msg?: string) => new ApiError(400, msg),
  unauthorized: (msg?: string) => new ApiError(401, msg),
  forbidden: (msg?: string) => new ApiError(403, msg),
  notFound: (msg?: string) => new ApiError(404, msg),
  conflict: (msg?: string) => new ApiError(409, msg),
  tooLarge: (msg?: string) => new ApiError(413, msg),
  unsupportedMedia: (msg?: string) => new ApiError(415, msg),
  unprocessable: (msg?: string) => new ApiError(422, msg),
  tooManyRequests: (msg?: string) => new ApiError(429, msg),
  internal: (msg?: string) => new ApiError(500, msg),
} as const;
