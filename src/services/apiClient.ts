import API_ENDPOINTS from "@/config/api";
import { clearSessionHint, writeSessionHint } from "@/lib/session";

const ACCESS_TOKEN_KEY = "unimate_access_token";
const REFRESH_TOKEN_KEY = "unimate_refresh_token";
const USER_KEY = "unimate_user";

/** Abort a request that the API has not answered within this window. */
const REQUEST_TIMEOUT_MS = 20_000;

export type AuthUser = {
  id: string;
  email: string;
  role: string;
  is_active?: boolean;
  password_changed?: boolean;
};

/**
 * Every failure the UI can encounter, normalised into one type.
 *
 * `status` is the HTTP status, or 0 for a transport failure (offline, DNS,
 * CORS, timeout) where no response ever arrived.
 */
export class ApiError extends Error {
  status: number;
  payload: unknown;
  /** Seconds to wait before retrying, when the server tells us (429). */
  retryAfter?: number;

  constructor(message: string, status: number, payload: unknown, retryAfter?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
    this.retryAfter = retryAfter;
  }

  /** No response reached us — offline, timed out, or the API is down. */
  get isNetwork() {
    return this.status === 0;
  }

  /** Authenticated, but the role is not permitted. Never retry this. */
  get isForbidden() {
    return this.status === 403;
  }

  /**
   * Rate limited. The API allows 100 requests / 15 min per IP globally and
   * 5 login attempts / 15 min, so this is reachable in normal use.
   */
  get isRateLimited() {
    return this.status === 429;
  }

  get isNotFound() {
    return this.status === 404;
  }

  /** Validation rejection — the message carries every Joi failure, joined. */
  get isValidation() {
    return this.status === 400;
  }
}

type AuthFailureHandler = (message?: string) => void;
let authFailureHandler: AuthFailureHandler | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export const setAuthFailureHandler = (handler: AuthFailureHandler | null) => {
  authFailureHandler = handler;
};

const isBrowser = () => typeof window !== "undefined";

export const getAccessToken = (): string | null =>
  isBrowser() ? window.localStorage.getItem(ACCESS_TOKEN_KEY) : null;

export const getRefreshToken = (): string | null =>
  isBrowser() ? window.localStorage.getItem(REFRESH_TOKEN_KEY) : null;

/**
 * Persists tokens and, when a role is supplied, refreshes the middleware's
 * session hint. Keeping both writes here means the cookie can never fall out of
 * sync with the token that justifies it.
 */
export const setTokens = (accessToken?: string, refreshToken?: string, role?: string) => {
  if (!isBrowser()) return;
  if (accessToken) window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  if (role) writeSessionHint(role);
};

export const clearTokens = () => {
  if (!isBrowser()) return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  clearSessionHint();
};

export const setStoredUser = (user: AuthUser | null) => {
  if (!isBrowser()) return;
  if (user) {
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    window.localStorage.removeItem(USER_KEY);
  }
};

export const getStoredUser = (): AuthUser | null => {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
};

const buildHeaders = (token: string | null, headers?: HeadersInit): HeadersInit => ({
  "Content-Type": "application/json",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(headers || {}),
});

const safeParseJson = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const handleAuthFailure = (message = "Session expired. Please log in again.") => {
  clearTokens();
  authFailureHandler?.(message);
};

/**
 * Wraps `fetch` so a transport failure surfaces as an ApiError rather than a
 * raw TypeError, and so no request can hang indefinitely.
 */
const fetchWithTimeout = async (url: string, init: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(
        "The server took too long to respond. Please try again.",
        0,
        { reason: "timeout" },
      );
    }
    throw new ApiError(
      "Cannot reach the server. Check your connection and try again.",
      0,
      { reason: "network" },
    );
  } finally {
    clearTimeout(timer);
  }
};

const refreshAccessToken = async (): Promise<string | null> => {
  // Single-flight: concurrent 401s must trigger exactly one refresh, or they
  // race and invalidate each other's rotated refresh token.
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const currentRefreshToken = getRefreshToken();
    if (!currentRefreshToken) {
      handleAuthFailure();
      return null;
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(API_ENDPOINTS.AUTH.REFRESH, {
        method: "POST",
        headers: buildHeaders(null),
        body: JSON.stringify({ refreshToken: currentRefreshToken }),
      });
    } catch {
      // Offline mid-refresh is not proof the session is invalid — keep the
      // tokens and let the caller surface a network error instead of
      // silently signing the user out.
      return null;
    }

    const payload = await safeParseJson(response);

    if (!response.ok) {
      const message =
        payload?.error?.message || payload?.message || "Unable to refresh session";
      handleAuthFailure(message);
      return null;
    }

    const data = payload?.data || {};
    const nextAccessToken: string | undefined = data.accessToken || data.token;
    const nextRefreshToken: string | undefined = data.refreshToken;

    if (!nextAccessToken) {
      handleAuthFailure("Invalid refresh response from server");
      return null;
    }

    setTokens(nextAccessToken, nextRefreshToken || currentRefreshToken, data.role);
    return nextAccessToken;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
};

const handleResponse = async (response: Response) => {
  const payload = await safeParseJson(response);

  if (response.ok) return payload;

  if (response.status === 429) {
    const header = response.headers.get("Retry-After");
    const retryAfter = header ? Number(header) : undefined;
    const wait =
      retryAfter && Number.isFinite(retryAfter)
        ? ` Try again in about ${Math.ceil(retryAfter / 60)} minute(s).`
        : " Please wait a few minutes and try again.";

    throw new ApiError(
      `Too many requests.${wait}`,
      429,
      payload,
      Number.isFinite(retryAfter as number) ? retryAfter : undefined,
    );
  }

  // The API's error envelope is { success: false, error: { message, ... } }.
  const message =
    payload?.error?.message ||
    payload?.message ||
    (response.status >= 500
      ? "The server ran into a problem. Please try again."
      : "Request failed");

  throw new ApiError(message, response.status, payload);
};

/** Endpoints that must never trigger the refresh-and-retry loop. */
const AUTH_ENDPOINTS: readonly string[] = [
  API_ENDPOINTS.AUTH.LOGIN,
  API_ENDPOINTS.AUTH.REFRESH,
  API_ENDPOINTS.AUTH.LOGOUT,
];

export const apiRequest = async (
  url: string,
  options: RequestInit = {},
  retryCount = 0,
): Promise<unknown> => {
  const isAuthEndpoint = AUTH_ENDPOINTS.includes(url);
  const accessToken = getAccessToken();

  const response = await fetchWithTimeout(url, {
    ...options,
    headers: buildHeaders(accessToken, options.headers),
  });

  if (response.status === 401 && retryCount < 1 && !isAuthEndpoint) {
    const refreshedAccessToken = await refreshAccessToken();

    if (!refreshedAccessToken) {
      throw new ApiError("Session expired. Please log in again.", 401, {
        error: "session_expired",
      });
    }

    return apiRequest(url, options, retryCount + 1);
  }

  return handleResponse(response);
};
