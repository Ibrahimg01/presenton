export const TENANT_QUERY_KEY = "tenant";
export const TENANT_STORAGE_KEY = "tenant_id";
export const CALLBACK_URL_QUERY_KEY = "callback_url";
export const CALLBACK_SECRET_QUERY_KEY = "callback_secret";
export const SITE_URL_QUERY_KEY = "site_url";

export const getTenantIdFromStorage = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TENANT_STORAGE_KEY);
};

export const setTenantIdInStorage = (tenantId: string) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(TENANT_STORAGE_KEY, tenantId);
};

export const clearTenantIdFromStorage = () => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TENANT_STORAGE_KEY);
};

export const getTenantIdFromUrl = (): string | null => {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get(TENANT_QUERY_KEY);
};

// Callback destinations and secrets are server-managed.
export const getCallbackParamsFromUrl = () => ({ callbackUrl: null, callbackSecret: null, siteUrl: null });
export const appendTenantToUrl = (
  url: string, tenantId?: string | null, _callbackUrl?: string | null,
  _callbackSecret?: string | null, _siteUrl?: string | null
): string => {
  const tenant = tenantId ?? getTenantIdFromUrl() ?? getTenantIdFromStorage();
  const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const parsed = new URL(url, base);
  for (const key of [CALLBACK_URL_QUERY_KEY, CALLBACK_SECRET_QUERY_KEY, SITE_URL_QUERY_KEY]) parsed.searchParams.delete(key);
  if (tenant) parsed.searchParams.set(TENANT_QUERY_KEY, tenant);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
};
