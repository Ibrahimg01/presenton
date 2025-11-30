"use client";

import React from "react";
import { useSelectionEditor } from "@/store/slices/selectionEdit";

const SelectionEditorOverlay: React.FC = () => {
  const { state, close, setPrompt, apply } = useSelectionEditor();

  if (!state.open) return null;

  return (
    <div
      data-inspector-overlay="1"
      className="shadow-2xl rounded-xl backdrop-blur-sm fixed z-[41] left-1/2 top-[70%] -translate-x-1/2 -translate-y-1/2 bg-transparent"
    >
      <div className="text-black rounded-xl p-4 w-[440px] shadow-xl bg-white ring-1 ring-gray-200 overflow-hidden">
        <div className="h-1 -mx-4 -mt-4 mb-3 bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-purple-500" />
        <div className="flex items-center gap-3">
          <p className="text-sm text-black font-syne font-semibold">Edit selection</p>
        </div>
        <div className="mt-1.5">
          <textarea
            rows={2}
            id="selection-editor-prompt"
            name="selection-editor-prompt"
            placeholder="Explain the changes you want to make to the selection eg. make the heading larger"
            className="w-full p-2 rounded-md border border-gray-200 bg-white text-black placeholder-gray-400 outline-none resize-y focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
            value={state.prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>
        <div className="mt-1 pt-1 flex justify-end gap-2">
          <button
            className="px-4 py-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            type="button"
            onClick={close}
          >
            Cancel
          </button>
          <button
            className="px-4 py-1 rounded-md bg-[#5141e5] text-white hover:bg-[#4336c9] disabled:opacity-50"
            type="button"
            onClick={apply}
            disabled={!state.prompt || state.loading}
          >
            {state.loading ? "Applying..." : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SelectionEditorOverlay;
