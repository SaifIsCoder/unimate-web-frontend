"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AuthUser,
  getAccessToken,
  getStoredUser,
  setAuthFailureHandler,
} from "@/services/apiClient";
import { loginUser, logoutUser, validateSession } from "@/services/authService";
import { hasRole, homePathForRole, writeSessionHint } from "@/lib/session";

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  authError: string | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  clearAuthError: () => void;
  /** True when the signed-in user satisfies every role in `allowed`. */
  can: (allowed: readonly string[]) => boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Re-exported so existing imports keep working; the definition now lives in
// lib/session.ts because middleware needs it too and cannot import client code.
export { homePathForRole };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    const handleAuthFailure = (message?: string) => {
      if (!isMounted) return;
      setUser(null);
      setAuthError(message || "Your session has expired. Please log in again.");
      router.push("/signin");
    };

    setAuthFailureHandler(handleAuthFailure);

    const hydrate = async () => {
      const cachedUser = getStoredUser();
      const token = getAccessToken();

      if (cachedUser && token) {
        setUser(cachedUser);
        // Re-assert the middleware hint on every boot. It expires independently
        // of the tokens, so a returning user whose cookie lapsed would otherwise
        // be bounced to sign-in by the edge despite holding a valid session.
        writeSessionHint(cachedUser.role);

        // Fire-and-forget session validation; a failure triggers handleAuthFailure
        // via the apiClient's 401 -> refresh -> logout pipeline.
        void validateSession();
      }

      if (isMounted) setLoading(false);
    };

    hydrate();

    return () => {
      isMounted = false;
      setAuthFailureHandler(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    const loggedInUser = await loginUser(email, password);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const logout = useCallback(async () => {
    await logoutUser();
    setUser(null);
    setAuthError(null);
    router.push("/signin");
  }, [router]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  // Mirrors the API's role hierarchy, so a `super_admin` satisfies an `admin`
  // gate without every call site having to list both.
  const can = useCallback(
    (allowed: readonly string[]) => hasRole(user?.role, allowed),
    [user],
  );

  const value = React.useMemo(
    () => ({ user, loading, authError, login, logout, clearAuthError, can }),
    [user, loading, authError, login, logout, clearAuthError, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
