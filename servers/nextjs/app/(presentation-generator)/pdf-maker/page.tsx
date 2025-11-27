'use client'
import React from "react";

import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";
import PdfMakerPage from "./PdfMakerPage";
import { useTenantNavigation } from "@/app/tenant-provider";
const page = () => {

    const { pushWithTenant } = useTenantNavigation();
    const params = useSearchParams();
    const queryId = params.get("id");
    const tenant = params.get("tenant");
    if (!queryId) {
        return (
            <div className="flex flex-col items-center justify-center h-screen">
                <h1 className="text-2xl font-bold">No presentation id found</h1>
                <p className="text-gray-500 pb-4">Please try again</p>
                <Button onClick={() => pushWithTenant("/dashboard")}>Go to home</Button>
            </div>
        );
    }
    return (
        <PdfMakerPage presentation_id={queryId} tenantId={tenant} />
    );
};
export default page;
