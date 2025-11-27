import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useTenantNavigation } from "@/app/tenant-provider";

export const usePresentationNavigation = (
  presentationId: string,
  selectedSlide: number,
  setSelectedSlide: (slide: number) => void,
  setIsFullscreen: (fullscreen: boolean) => void
) => {
  const { pushWithTenant } = useTenantNavigation();
  const searchParams = useSearchParams();

  const isPresentMode = searchParams.get("mode") === "present";
  const stream = searchParams.get("stream");
  const currentSlide = parseInt(
    searchParams.get("slide") || `${selectedSlide}` || "0"
  );

  const handleSlideClick = useCallback((index: number) => {
    const slideElement = document.getElementById(`slide-${index}`);
    if (slideElement) {
      slideElement.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      setSelectedSlide(index);
    }
  }, [setSelectedSlide]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, [setIsFullscreen]);

  const handlePresentExit = useCallback(() => {
    setIsFullscreen(false);
    pushWithTenant(`/presentation?id=${presentationId}`);
  }, [pushWithTenant, presentationId, setIsFullscreen]);

  const handleSlideChange = useCallback((newSlide: number, presentationData: any) => {
    if (newSlide >= 0 && newSlide < presentationData?.slides.length!) {
      setSelectedSlide(newSlide);
      pushWithTenant(
        `/presentation?id=${presentationId}&mode=present&slide=${newSlide}`,
        { scroll: false }
      );
    }
  }, [pushWithTenant, presentationId, setSelectedSlide]);

  return {
    isPresentMode,
    stream,
    currentSlide,
    handleSlideClick,
    toggleFullscreen,
    handlePresentExit,
    handleSlideChange,
  };
}; 