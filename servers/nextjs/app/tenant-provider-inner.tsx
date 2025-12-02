"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  TENANT_QUERY_KEY,
  appendTenantToUrl,
  clearTenantIdFromStorage,
  getTenantIdFromStorage,
  getCallbackParamsFromUrl,
  setTenantIdInStorage,
} from "@/utils/tenant";

interface TenantContextValue {
  tenantId: string | null;
  callbackUrl: string | null;
  callbackSecret: string | null;
  siteUrl: string | null;
  appendTenantParam: (url: string) => string;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

const TenantProviderInner = ({ children }: { children: React.ReactNode }) => {
  const searchParams = useSearchParams();
  const tenantFromUrl = searchParams.get(TENANT_QUERY_KEY);
  const callbackUrl = searchParams.get("callback_url");
  const callbackSecret = searchParams.get("callback_secret");
  const siteUrl = searchParams.get("site_url");

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const decodedCallbackUrl = callbackUrl ? decodeURIComponent(callbackUrl) : null;

  useEffect(() => {
    if (tenantFromUrl) {
      setTenantId(tenantFromUrl);
      setTenantIdInStorage(tenantFromUrl);
      setChecked(true);
      return;
    }

    clearTenantIdFromStorage();
    setTenantId(null);
    setChecked(true);
  }, [tenantFromUrl]);

  const appendTenantParam = useCallback(
    (url: string) =>
      appendTenantToUrl(
        url,
        tenantFromUrl || tenantId,
        decodedCallbackUrl,
        callbackSecret,
        siteUrl
      ),
    [callbackSecret, decodedCallbackUrl, siteUrl, tenantFromUrl, tenantId]
  );

  const value = useMemo(
    () => ({
      tenantId,
      callbackUrl: decodedCallbackUrl,
      callbackSecret,
      siteUrl,
      appendTenantParam,
    }),
    [appendTenantParam, callbackSecret, decodedCallbackUrl, siteUrl, tenantId]
  );

  if (checked && !tenantFromUrl) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="max-w-xl rounded-lg border border-red-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-red-700">Access Denied</h1>
          <p className="mt-4 text-gray-700">
            Access Denied: Tenant ID is required. Please access this application through your dashboard.
          </p>
        </div>
      </div>
    );
  }

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
};

export const useTenantContext = () => {
  const context = useContext(TenantContext);
  if (!context) {
    const storedTenant = getTenantIdFromStorage();
    const { callbackUrl, callbackSecret, siteUrl } = getCallbackParamsFromUrl();
    return {
      tenantId: storedTenant,
      callbackUrl,
      callbackSecret,
      siteUrl,
      appendTenantParam: (url: string) =>
        appendTenantToUrl(url, storedTenant, callbackUrl, callbackSecret, siteUrl),
    } satisfies TenantContextValue;
  }
  return context;
};

export const useTenantNavigation = () => {
  const router = useRouter();
  const { appendTenantParam, tenantId, callbackUrl, callbackSecret, siteUrl } =
    useTenantContext();

  const pushWithTenant = useCallback(
    (url: string, options?: Parameters<typeof router.push>[1]) =>
      router.push(appendTenantParam(url), options),
    [router, appendTenantParam]
  );

  return {
    tenantId,
    callbackUrl,
    callbackSecret,
    siteUrl,
    appendTenantParam,
    pushWithTenant,
  };
};

export default TenantProviderInner;
