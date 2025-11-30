"use client";

import clsx from "clsx";
import React, { useState } from "react";
import { useSelectionEdit } from "@/store/slices/selectionEdit";

interface SelectionEditableWrapperProps {
  children: React.ReactNode;
  onAiEditClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const SelectionEditableWrapper: React.FC<SelectionEditableWrapperProps> = ({
  children,
  onAiEditClick,
  className,
  style,
}) => {
  const { enabled } = useSelectionEdit();
  const [hovered, setHovered] = useState(false);

  const showOverlay = enabled && hovered;

  return (
    <div
      className={clsx("relative", className)}
      style={style}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={clsx(
          showOverlay
            ? "outline outline-2 outline-[#5146E5] outline-offset-2 rounded-md"
            : ""
        )}
      >
        {children}
      </div>

      {showOverlay && onAiEditClick && (
        <button
          type="button"
          onClick={onAiEditClick}
          className="absolute -top-2 right-0 translate-y-[-50%] translate-x-[20%] px-2 py-0.5 rounded-full bg-[#5141e5] text-white text-xs shadow hover:bg-[#4336c9]"
        >
          AI Edit
        </button>
      )}
    </div>
  );
};

export default SelectionEditableWrapper;
