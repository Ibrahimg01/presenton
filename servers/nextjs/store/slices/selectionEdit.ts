import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../store";
import { toast } from "sonner";

interface SelectionEditorState {
  open: boolean;
  prompt: string;
  text: string;
  slideId: string | null;
  elementId: string | null;
  loading: boolean;
}

interface SelectionEditState {
  enabled: boolean;
  editor: SelectionEditorState;
}

const initialEditorState: SelectionEditorState = {
  open: false,
  prompt: "",
  text: "",
  slideId: null,
  elementId: null,
  loading: false,
};

const initialState: SelectionEditState = {
  enabled: false,
  editor: initialEditorState,
};

const selectionEditSlice = createSlice({
  name: "selectionEdit",
  initialState,
  reducers: {
    toggleSelectionEdit(state) {
      state.enabled = !state.enabled;
    },
    setSelectionEdit(state, action: PayloadAction<boolean>) {
      state.enabled = action.payload;
    },
    openSelectionEditor(
      state,
      action: PayloadAction<{
        text: string;
        slideId?: string | number | null;
        elementId?: string | null;
      }>
    ) {
      state.editor = {
        open: true,
        prompt: "",
        text: action.payload.text,
        slideId:
          action.payload.slideId !== undefined && action.payload.slideId !== null
            ? String(action.payload.slideId)
            : null,
        elementId: action.payload.elementId ?? null,
        loading: false,
      };
    },
    closeSelectionEditor(state) {
      state.editor = initialEditorState;
    },
    setSelectionEditorPrompt(state, action: PayloadAction<string>) {
      state.editor.prompt = action.payload;
    },
    setSelectionEditorLoading(state, action: PayloadAction<boolean>) {
      state.editor.loading = action.payload;
    },
  },
});

export const {
  toggleSelectionEdit,
  setSelectionEdit,
  openSelectionEditor,
  closeSelectionEditor,
  setSelectionEditorPrompt,
  setSelectionEditorLoading,
} = selectionEditSlice.actions;

export const useSelectionEdit = () => {
  const enabled = useSelector((state: RootState) => state.selectionEdit.enabled);
  const dispatch = useDispatch();

  return {
    enabled,
    toggle: () => dispatch(toggleSelectionEdit()),
    setEnabled: (value: boolean) => dispatch(setSelectionEdit(value)),
  };
};

export const useSelectionEditor = () => {
  const editor = useSelector((state: RootState) => state.selectionEdit.editor);
  const dispatch = useDispatch();

  const open = (
    payload: PayloadAction<{
      text: string;
      slideId?: string | number | null;
      elementId?: string | null;
    }>["payload"]
  ) => dispatch(openSelectionEditor(payload));

  const close = () => dispatch(closeSelectionEditor());

  const setPrompt = (value: string) => dispatch(setSelectionEditorPrompt(value));

  const apply = async () => {
    if (!editor.prompt) return;
    dispatch(setSelectionEditorLoading(true));
    try {
      // Placeholder for AI integration
      // Replace this with actual API call when available
      console.log("AI edit request", { editor });
    } catch (error) {
      console.error(error);
      toast.error("Failed to apply AI edit");
    } finally {
      dispatch(setSelectionEditorLoading(false));
      close();
    }
  };

  return {
    state: editor,
    open,
    close,
    setPrompt,
    apply,
  };
};

export default selectionEditSlice.reducer;
