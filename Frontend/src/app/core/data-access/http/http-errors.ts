import { HttpErrorResponse } from '@angular/common/http';

import { ApiError, ApiErrorCode, toApiError } from '../api.types';

/** Error body returned by the backend: { success: false, error: { code, message, field? } }. */
interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; field?: string };
}

function isApiErrorBody(body: unknown): body is ApiErrorBody {
  if (typeof body !== 'object' || body === null || !('error' in body)) {
    return false;
  }
  const error = (body as { error: unknown }).error;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

const CODE_MAP: Readonly<Record<string, ApiErrorCode>> = {
  VALIDATION: 'VALIDATION',
  BAD_REQUEST: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE: 'DUPLICATE',
  IN_USE: 'IN_USE',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  CSRF_FAILED: 'FORBIDDEN',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  TOO_MANY_REQUESTS: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'NETWORK',
};

const SERVER_DOWN =
  'Unable to reach the server. Make sure the backend API is running, then try again.';

const NOT_THE_API =
  'The server sent a web page instead of data, so the API is not being reached. ' +
  'Restart the frontend (npm start) so its /api proxy is active, and make sure the backend is running.';

/**
 * Returns `data` from a `{ success: true, data }` envelope. Anything else means the response did
 * not come from the API (e.g. the dev server's index.html when the proxy is not running).
 */
export function unwrapEnvelope<T>(response: unknown): T {
  if (
    typeof response === 'object' &&
    response !== null &&
    (response as { success?: unknown }).success === true &&
    'data' in response
  ) {
    return (response as { data: T }).data;
  }
  throw new ApiError('NETWORK', NOT_THE_API);
}

/** Converts an HttpClient error into the ApiError shape the UI understands. */
export function fromHttpError(error: unknown): ApiError {
  if (!(error instanceof HttpErrorResponse)) {
    return toApiError(error);
  }
  if (isApiErrorBody(error.error)) {
    const { code, message, field } = error.error.error;
    return new ApiError(CODE_MAP[code] ?? 'UNKNOWN', message, field);
  }
  // A "successful" status that failed JSON parsing means something other than the API answered —
  // typically the dev server returning index.html because the /api proxy is not running.
  if (error.status >= 200 && error.status < 300) {
    return new ApiError('NETWORK', NOT_THE_API);
  }
  // No API error body: the request never reached the backend (offline, proxy error, server down).
  if (error.status === 0 || error.status >= 500) {
    return new ApiError('NETWORK', SERVER_DOWN);
  }
  if (error.status === 404) {
    return new ApiError('NOT_FOUND', 'The requested record was not found.');
  }
  return new ApiError('UNKNOWN', `Request failed (${error.status}). Please try again.`);
}
