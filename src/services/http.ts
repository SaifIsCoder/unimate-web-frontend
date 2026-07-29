import { apiRequest } from "./apiClient";

/**
 * Every successful UniMate response is wrapped as `{ success: true, data }`.
 * These helpers unwrap that envelope so callers deal in domain shapes only.
 */
type Envelope<T> = { success?: boolean; data?: T };

const unwrap = <T,>(payload: unknown): T => (payload as Envelope<T>)?.data as T;

export const buildQuery = (
  params: Record<string, string | number | undefined | null>,
): string => {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }

  const query = search.toString();
  return query ? `?${query}` : "";
};

export const httpGet = async <T,>(url: string): Promise<T> =>
  unwrap<T>(await apiRequest(url, { method: "GET" }));

export const httpPost = async <T,>(url: string, body: unknown): Promise<T> =>
  unwrap<T>(await apiRequest(url, { method: "POST", body: JSON.stringify(body) }));

export const httpPatch = async <T,>(url: string, body: unknown): Promise<T> =>
  unwrap<T>(await apiRequest(url, { method: "PATCH", body: JSON.stringify(body) }));

export const httpDelete = async <T,>(url: string): Promise<T> =>
  unwrap<T>(await apiRequest(url, { method: "DELETE" }));
