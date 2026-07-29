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

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  authError: string | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  clearAuthError: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const homePathForRole = (role: string | undefined): string => {
  if (role === "teacher") return "/teacher";
  if (role === "admin" || role === "super_admin") return "/admin";
  return "/signin";
};

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

  return (
    <AuthContext.Provider value={{ user, loading, authError, login, logout, clearAuthError }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
