"use client";
import { Button } from "@/components/ui/button";
import {
  SquareArrowOutUpRight,
  Play,
  Loader2,
  Redo2,
  Undo2,

} from "lucide-react";
import React, { useState } from "react";
import clsx from "clsx";
import Wrapper from "@/components/Wrapper";
import { usePathname } from "next/navigation";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PresentationGenerationApi } from "../../services/api/presentation-generation";
import { OverlayLoader } from "@/components/ui/overlay-loader";
import { useDispatch, useSelector } from "react-redux";

import Link from "next/link";

import { RootState } from "@/store/store";
import { toast } from "sonner";


import Announcement from "@/components/Announcement";
import { PptxPresentationModel } from "@/types/pptx_models";
import HeaderNav from "../../components/HeaderNab";
import PDFIMAGE from "@/public/pdf.svg";
import PPTXIMAGE from "@/public/pptx.svg";
import Image from "next/image";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import { usePresentationUndoRedo } from "../hooks/PresentationUndoRedo";
import ToolTip from "@/components/ToolTip";
import { clearPresentationData } from "@/store/slices/presentationGeneration";
import { clearHistory } from "@/store/slices/undoRedoSlice";
import { useTenantNavigation } from "@/app/tenant-provider";
import { sanitizeFilename } from "../../utils/others";
import { getHeader } from "../../services/api/header";
import { useSelectionEdit } from "@/store/slices/selectionEdit";

const SparklesIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="lucide lucide-sparkles w-3.5 h-3.5 text-[#5146E5]"
  >
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    <path d="M20 3v4" />
    <path d="M22 5h-4" />
    <path d="M4 17v2" />
    <path d="M5 18H3" />
  </svg>
);

const Header = ({
  presentation_id,
  currentSlide,
}: {
  presentation_id: string;
  currentSlide?: number;
}) => {
  const [open, setOpen] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const { pushWithTenant, appendTenantParam } = useTenantNavigation();
  const dashboardHref = appendTenantParam("/dashboard");
  const pathname = usePathname();
  const dispatch = useDispatch();
  const { enabled: selectionEditEnabled, toggle: toggleSelectionEdit } =
    useSelectionEdit();


  const { presentationData, isStreaming } = useSelector(
    (state: RootState) => state.presentationGeneration
  );

  const { onUndo, onRedo, canUndo, canRedo } = usePresentationUndoRedo();

  const get_presentation_pptx_model = async (id: string): Promise<PptxPresentationModel> => {
    const response = await fetch(
      appendTenantParam(`/api/presentation_to_pptx_model?id=${id}`)
    );
    const pptx_model = await response.json();
    return pptx_model;
  };

  const handleExportPptx = async () => {
    if (isStreaming) return;

    try {
      setOpen(false);
      setShowLoader(true);
      // Save the presentation data before exporting
      trackEvent(MixpanelEvent.Header_UpdatePresentationContent_API_Call);
      await PresentationGenerationApi.updatePresentationContent(presentationData);
      trackEvent(MixpanelEvent.Header_GetPptxModel_API_Call);
      const pptx_model = await get_presentation_pptx_model(presentation_id);
      if (!pptx_model) {
        throw new Error("Failed to get presentation PPTX model");
      }
      trackEvent(MixpanelEvent.Header_ExportAsPPTX_API_Call);
      const pptxUrl = appendTenantParam(
        `/api/v1/ppt/presentation/export/pptx?presentation_id=${presentation_id}`
      );
      const response = await fetch(pptxUrl, {
        method: 'POST',
        headers: getHeader(),
        body: JSON.stringify(pptx_model),
      });

      if (!response.ok) {
        throw new Error("Failed to export PPTX");
      }

      const blob = await response.blob();
      const filename =
        getFilenameFromResponse(response) ||
        `${sanitizeFilename(presentationData?.title || "presentation") || "presentation"}.pptx`;
      triggerBlobDownload(blob, filename);
    } catch (error) {
      console.error("Export failed:", error);
      setShowLoader(false);
      toast.error("Having trouble exporting!", {
        description:
          "We are having trouble exporting your presentation. Please try again.",
      });
    } finally {
      setShowLoader(false);
    }
  };

  const handleExportPdf = async () => {
    if (isStreaming) return;

    try {
      setOpen(false);
      setShowLoader(true);
      // Save the presentation data before exporting
      trackEvent(MixpanelEvent.Header_UpdatePresentationContent_API_Call);
      await PresentationGenerationApi.updatePresentationContent(presentationData);

      trackEvent(MixpanelEvent.Header_ExportAsPDF_API_Call);
      const sanitizedTitle = sanitizeFilename(
        presentationData?.title || "presentation"
      );
      const pdfUrl = appendTenantParam(
        `/api/export-as-pdf?id=${presentation_id}&title=${encodeURIComponent(
          sanitizedTitle || "presentation"
        )}`
      );
      const response = await fetch(pdfUrl, { method: 'GET' });

      if (!response.ok) {
        throw new Error("Failed to export PDF");
      }

      const blob = await response.blob();
      const filename =
        getFilenameFromResponse(response) || `${sanitizedTitle || "presentation"}.pdf`;
      triggerBlobDownload(blob, filename);

    } catch (err) {
      console.error(err);
      toast.error("Having trouble exporting!", {
        description:
          "We are having trouble exporting your presentation. Please try again.",
      });
    } finally {
      setShowLoader(false);
    }
  };
  const handleReGenerate = () => {
    dispatch(clearPresentationData());
    dispatch(clearHistory())
    trackEvent(MixpanelEvent.Header_ReGenerate_Button_Clicked, { pathname });
    pushWithTenant(`/presentation?id=${presentation_id}&stream=true`);
  };

  const getFilenameFromResponse = (response: Response) => {
    const disposition = response.headers.get("Content-Disposition");
    if (!disposition) return null;
    const match = disposition.match(/filename="?([^";]+)"?/);
    return match?.[1] || null;
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(link);
  };

  const ExportOptions = ({ mobile }: { mobile: boolean }) => (
    <div className={`space-y-2 max-md:mt-4 ${mobile ? "" : "bg-white"} rounded-lg`}>
      <Button
        onClick={() => {
          trackEvent(MixpanelEvent.Header_Export_PDF_Button_Clicked, { pathname });
          handleExportPdf();
        }}
        variant="ghost"
        className={`pb-4 border-b rounded-none border-gray-300 w-full flex justify-start text-[#5146E5] ${mobile ? "bg-white py-6 border-none rounded-lg" : ""}`} >
        <Image src={PDFIMAGE} alt="pdf export" width={30} height={30} />
        Export as PDF
      </Button>
      <Button
        onClick={() => {
          trackEvent(MixpanelEvent.Header_Export_PPTX_Button_Clicked, { pathname });
          handleExportPptx();
        }}
        variant="ghost"
        className={`w-full flex justify-start text-[#5146E5] ${mobile ? "bg-white py-6" : ""}`}
      >
        <Image src={PPTXIMAGE} alt="pptx export" width={30} height={30} />
        Export as PPTX
      </Button>


    </div>
  );

  const MenuItems = ({ mobile }: { mobile: boolean }) => (
    <div className="flex flex-col lg:flex-row items-center gap-4">
      {/* undo redo */}
      <button onClick={handleReGenerate} disabled={isStreaming || !presentationData} className="text-white  disabled:opacity-50" >

        Re-Generate
      </button>
      <div className="flex items-center gap-2 ">
        <ToolTip content="Undo">
          <button disabled={!canUndo} className="text-white disabled:opacity-50" onClick={() => {
            onUndo();
          }}>

            <Undo2 className="w-6 h-6 " />

          </button>
        </ToolTip>
        <ToolTip content="Redo">

          <button disabled={!canRedo} className="text-white disabled:opacity-50" onClick={() => {
            onRedo();
          }}>
            <Redo2 className="w-6 h-6 " />

          </button>
        </ToolTip>

      </div>

      {/* Present Button */}
      <Button
        onClick={() => {
          const to = `/presentation?id=${presentation_id}&mode=present&slide=${currentSlide || 0}`;
          trackEvent(MixpanelEvent.Navigation, { from: pathname, to });
          pushWithTenant(to);
        }}
        variant="ghost"
        className="border border-white font-bold text-white rounded-[32px] transition-all duration-300 group"
      >
        <Play className="w-4 h-4 mr-1 stroke-white group-hover:stroke-black" />
        Present
      </Button>

      {/* Desktop Export Button with Popover */}

      <div style={{
        zIndex: 100
      }} className="hidden lg:block relative ">
        <Popover open={open} onOpenChange={setOpen} >
          <PopoverTrigger asChild>
            <Button className={`border py-5 text-[#5146E5] font-bold rounded-[32px] transition-all duration-500 hover:border hover:bg-[#5146E5] hover:text-white w-full ${mobile ? "" : "bg-white"}`}>
              <SquareArrowOutUpRight className="w-4 h-4 mr-1" />
              Export
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[250px] space-y-2 py-3 px-2 ">
            <ExportOptions mobile={false} />
          </PopoverContent>
        </Popover>
      </div>

      {/* Mobile Export Section */}
      <div className="lg:hidden flex flex-col w-full">
        <ExportOptions mobile={true} />
      </div>
    </div>
  );

  return (
    <>
      <OverlayLoader
        show={showLoader}
        text="Exporting presentation..."
        showProgress={true}
        duration={40}
      />
      <div

        className="bg-[#5146E5] w-full shadow-lg sticky top-0 ">

        <Announcement />
        <Wrapper className="flex items-center justify-between py-1">
          <Link href={dashboardHref} className="min-w-[162px]">
            <img
              className="h-16"
              src="/logo.png"
              alt="Digital Launchpad"
            />
          </Link>

          {/* Desktop Menu */}
          <div className="hidden lg:flex items-center gap-4 2xl:gap-6">
            {isStreaming && (
              <Loader2 className="animate-spin text-white font-bold w-6 h-6" />
            )}

            <button
              type="button"
              onClick={toggleSelectionEdit}
              className={clsx(
                "flex items-center gap-2 rounded-full px-3 py-1 text-xs border transition",
                selectionEditEnabled
                  ? "bg-emerald-50 border-emerald-400 text-emerald-700"
                  : "bg-white border-gray-200 text-gray-600"
              )}
            >
              <SparklesIcon />
              <span className="font-medium">Enable Select Edit</span>
              <span
                className={clsx(
                  "ml-1 inline-flex h-4 w-7 items-center rounded-full p-0.5 transition",
                  selectionEditEnabled ? "bg-emerald-500" : "bg-gray-300"
                )}
              >
                <span
                  className={clsx(
                    "h-3 w-3 rounded-full bg-white shadow transform transition",
                    selectionEditEnabled ? "translate-x-3" : "translate-x-0"
                  )}
                />
              </span>
            </button>

            <MenuItems mobile={false} />
            <HeaderNav />
          </div>

          {/* Mobile Menu */}
          <div className="lg:hidden flex items-center gap-4">
            <HeaderNav />

          </div>
        </Wrapper>

      </div>
    </>
  );
};

export default Header;
