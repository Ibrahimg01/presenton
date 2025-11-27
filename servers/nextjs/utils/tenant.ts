export const TENANT_QUERY_KEY = "tenant";
export const TENANT_STORAGE_KEY = "tenant_id";

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

export const appendTenantToUrl = (
  url: string,
  tenantId?: string | null
): string => {
  const tenant = tenantId ?? getTenantIdFromUrl() ?? getTenantIdFromStorage();

  if (!tenant) return url;

  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const urlObj = new URL(url, base);
    urlObj.searchParams.set(TENANT_QUERY_KEY, tenant);
    const hash = urlObj.hash || "";
    return `${urlObj.pathname}${urlObj.search}${hash}`;
  } catch (error) {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}${TENANT_QUERY_KEY}=${encodeURIComponent(tenant)}`;
  }
};
