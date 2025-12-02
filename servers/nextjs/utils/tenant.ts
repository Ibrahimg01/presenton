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

export const getCallbackParamsFromUrl = () => {
  if (typeof window === "undefined")
    return { callbackUrl: null, callbackSecret: null, siteUrl: null } as const;

  const params = new URLSearchParams(window.location.search);
  const callbackUrl = params.get(CALLBACK_URL_QUERY_KEY);

  return {
    callbackUrl: callbackUrl ? decodeURIComponent(callbackUrl) : null,
    callbackSecret: params.get(CALLBACK_SECRET_QUERY_KEY),
    siteUrl: params.get(SITE_URL_QUERY_KEY),
  } as const;
};

export const appendTenantToUrl = (
  url: string,
  tenantId?: string | null,
  callbackUrl?: string | null,
  callbackSecret?: string | null,
  siteUrl?: string | null
): string => {
  const tenant = tenantId ?? getTenantIdFromUrl() ?? getTenantIdFromStorage();
  const callbackParams = getCallbackParamsFromUrl();
  const finalCallbackUrl = callbackUrl ?? callbackParams.callbackUrl;
  const finalCallbackSecret = callbackSecret ?? callbackParams.callbackSecret;
  const finalSiteUrl = siteUrl ?? callbackParams.siteUrl;

  if (!tenant && !finalCallbackUrl && !finalCallbackSecret && !finalSiteUrl)
    return url;

  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const urlObj = new URL(url, base);
    if (tenant) {
      urlObj.searchParams.set(TENANT_QUERY_KEY, tenant);
    }
    if (finalCallbackUrl) {
      urlObj.searchParams.set(CALLBACK_URL_QUERY_KEY, finalCallbackUrl);
    }
    if (finalCallbackSecret) {
      urlObj.searchParams.set(CALLBACK_SECRET_QUERY_KEY, finalCallbackSecret);
    }
    if (finalSiteUrl) {
      urlObj.searchParams.set(SITE_URL_QUERY_KEY, finalSiteUrl);
    }
    const hash = urlObj.hash || "";
    return `${urlObj.pathname}${urlObj.search}${hash}`;
  } catch (error) {
    const params = new URLSearchParams();
    if (tenant) {
      params.append(TENANT_QUERY_KEY, tenant);
    }
    if (finalCallbackUrl) {
      params.append(CALLBACK_URL_QUERY_KEY, finalCallbackUrl);
    }
    if (finalCallbackSecret) {
      params.append(CALLBACK_SECRET_QUERY_KEY, finalCallbackSecret);
    }
    if (finalSiteUrl) {
      params.append(SITE_URL_QUERY_KEY, finalSiteUrl);
    }

    const separator = url.includes("?") ? "&" : "?";
    const paramString = params.toString();
    return paramString ? `${url}${separator}${paramString}` : url;
  }
};
