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
