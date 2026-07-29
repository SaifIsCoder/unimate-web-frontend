import API_ENDPOINTS from "@/config/api";

const ACCESS_TOKEN_KEY = "unimate_access_token";
const REFRESH_TOKEN_KEY = "unimate_refresh_token";
const USER_KEY = "unimate_user";

export type AuthUser = {
  id: string;
  email: string;
  role: string;
  is_active?: boolean;
  password_changed?: boolean;
};

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

type AuthFailureHandler = (message?: string) => void;
let authFailureHandler: AuthFailureHandler | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export const setAuthFailureHandler = (handler: AuthFailureHandler | null) => {
  authFailureHandler = handler;
};

const isBrowser = () => typeof window !== "undefined";

export const getAccessToken = (): string | null => {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
};

export const getRefreshToken = (): string | null => {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
};

export const setTokens = (accessToken?: string, refreshToken?: string) => {
  if (!isBrowser()) return;
  if (accessToken) window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
};

export const clearTokens = () => {
  if (!isBrowser()) return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
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
  if (authFailureHandler) {
    authFailureHandler(message);
  }
};

const refreshAccessToken = async (): Promise<string | null> => {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const currentRefreshToken = getRefreshToken();
    if (!currentRefreshToken) {
      handleAuthFailure();
      return null;
    }

    const response = await fetch(API_ENDPOINTS.AUTH.REFRESH, {
      method: "POST",
      headers: buildHeaders(null),
      body: JSON.stringify({ refreshToken: currentRefreshToken }),
    });

    const payload = await safeParseJson(response);

    if (!response.ok) {
      const message =
        payload?.error?.message || payload?.message || "Unable to refresh session";
      handleAuthFailure(message);
      return null;
    }

    const data = payload?.data || {};
    const nextAccessToken: string | undefined = data.accessToken;
    const nextRefreshToken: string | undefined = data.refreshToken;

    if (!nextAccessToken) {
      handleAuthFailure("Invalid refresh response from server");
      return null;
    }

    setTokens(nextAccessToken, nextRefreshToken || currentRefreshToken);
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
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || "Request failed";
    throw new ApiError(message, response.status, payload);
  }
  return payload;
};

const AUTH_ENDPOINTS: string[] = [
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

  const response = await fetch(url, {
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
