"use client";

import { Suspense } from "react";
import TenantProviderInner, { useTenantContext, useTenantNavigation } from "./tenant-provider-inner";

export const TenantProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TenantProviderInner>{children}</TenantProviderInner>
    </Suspense>
  );
};

export { useTenantContext, useTenantNavigation };
