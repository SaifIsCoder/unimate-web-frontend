import API_ENDPOINTS from "@/config/api";
import {
  apiRequest,
  AuthUser,
  clearTokens,
  setStoredUser,
  setTokens,
} from "./apiClient";

type LoginResponseData = {
  accessToken: string;
  refreshToken: string;
  role: string;
  user: AuthUser;
};

const DASHBOARD_ROLES = ["admin", "super_admin", "teacher"];

export const loginUser = async (email: string, password: string): Promise<AuthUser> => {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail || !password) {
    throw new Error("Email and password are required.");
  }

  const payload = (await apiRequest(API_ENDPOINTS.AUTH.LOGIN, {
    method: "POST",
    body: JSON.stringify({ email: normalizedEmail, password }),
  })) as { data?: LoginResponseData };

  const data = payload?.data;
  if (!data?.accessToken || !data?.user) {
    throw new Error("Login failed: unexpected server response.");
  }

  if (!DASHBOARD_ROLES.includes(data.user.role)) {
    throw new Error(
      "This account does not have access to the admin dashboard. Please use the mobile app instead.",
    );
  }

  setTokens(data.accessToken, data.refreshToken);
  setStoredUser(data.user);

  return data.user;
};

export const logoutUser = async (): Promise<void> => {
  try {
    await apiRequest(API_ENDPOINTS.AUTH.LOGOUT, { method: "POST" });
  } catch {
    // Best-effort — always clear local session regardless of network outcome.
  } finally {
    clearTokens();
  }
};

/**
 * Confirms the current session is still valid against the backend.
 * Does not overwrite the cached identity: /auth/me's response shape is
 * role-specific profile data, not the {id,email,role} shape used for routing.
 */
export const validateSession = async (): Promise<boolean> => {
  try {
    await apiRequest(API_ENDPOINTS.AUTH.ME, { method: "GET" });
    return true;
  } catch {
    return false;
  }
};
