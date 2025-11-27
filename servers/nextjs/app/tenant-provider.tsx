"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  TENANT_QUERY_KEY,
  appendTenantToUrl,
  clearTenantIdFromStorage,
  getTenantIdFromStorage,
  setTenantIdInStorage,
} from "@/utils/tenant";
import { useRouter } from "next/navigation";

interface TenantContextValue {
  tenantId: string | null;
  appendTenantParam: (url: string) => string;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export const TenantProvider = ({ children }: { children: React.ReactNode }) => {
  const searchParams = useSearchParams();
  const tenantFromUrl = searchParams.get(TENANT_QUERY_KEY);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

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
    (url: string) => appendTenantToUrl(url, tenantFromUrl || tenantId),
    [tenantFromUrl, tenantId]
  );

  const value = useMemo(
    () => ({ tenantId, appendTenantParam }),
    [appendTenantParam, tenantId]
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
    return {
      tenantId: storedTenant,
      appendTenantParam: (url: string) => appendTenantToUrl(url, storedTenant),
    } satisfies TenantContextValue;
  }
  return context;
};

export const useTenantNavigation = () => {
  const router = useRouter();
  const { appendTenantParam, tenantId } = useTenantContext();

  const pushWithTenant = useCallback(
    (url: string, options?: Parameters<typeof router.push>[1]) =>
      router.push(appendTenantParam(url), options),
    [router, appendTenantParam]
  );

  return {
    tenantId,
    appendTenantParam,
    pushWithTenant,
  };
};
