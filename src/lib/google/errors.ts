/**
 * Auth required (user not signed in, or silent renewal failed).
 * UI should respond by showing the LoginScreen.
 */
export class AuthRequiredError extends Error {
  constructor(message = 'Authentication required', options?: ErrorOptions) {
    super(message, options);
    this.name = 'AuthRequiredError';
  }
}

/**
 * Returned when Google's OAuth flow rejects the request explicitly
 * (popup_closed_by_user, access_denied, etc.).
 */
export class AuthDeniedError extends Error {
  readonly reason: string;
  constructor(reason: string, message = `Authentication denied: ${reason}`) {
    super(message);
    this.name = 'AuthDeniedError';
    this.reason = reason;
  }
}

/** Non-2xx response from a Google API endpoint. */
export class GoogleApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly endpoint: string;
  readonly body: unknown;
  constructor(status: number, statusText: string, endpoint: string, body: unknown) {
    super(`Google API ${status} ${statusText} at ${endpoint}`);
    this.name = 'GoogleApiError';
    this.status = status;
    this.statusText = statusText;
    this.endpoint = endpoint;
    this.body = body;
  }
}

/**
 * GoogleApiError's own .message only ever contains status/statusText/endpoint
 * — the actual reason Google rejected the request lives in .body, which this
 * pulls out so error banners can show it instead of a bare "400" (see ISS-24,
 * where this exact gap hid the real cause of a sync failure for a long time).
 */
function extractGoogleApiErrorDetail(body: unknown): string | null {
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object' && 'error' in body) {
    return (body as { error?: { message?: string } }).error?.message ?? JSON.stringify(body);
  }
  if (body) return JSON.stringify(body);
  return null;
}

/** Formats any caught error for display, including Google's own detail message when available. */
export function describeError(err: unknown): string {
  if (err instanceof GoogleApiError) {
    const detail = extractGoogleApiErrorDetail(err.body);
    return `${err.message}${detail ? ` — ${detail}` : ''}`;
  }
  return err instanceof Error ? err.message : String(err);
}
