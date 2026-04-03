import type { Block } from "@blocknote/core";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import { BlockNoteView } from "@blocknote/mantine";
import {
    BasicTextStyleButton,
    BlockTypeSelect,
    ColorStyleButton,
    CreateLinkButton,
    FormattingToolbar,
    FormattingToolbarController,
    getDefaultReactSlashMenuItems,
    NestBlockButton,
    SuggestionMenuController,
    TextAlignButton,
    UnnestBlockButton,
    useCreateBlockNote
} from "@blocknote/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { acquireEditLock, checkEditLock, exportSingleDoc, getDocContent, getDocMeta, updateDocContent, updateDocTitle } from "../services/storage";
import type { DocMeta } from "../types";
import { getNoteSlashMenuItem, schema } from "../utils/editorSchema";
import "./DocEditor.css";
import { Download } from "./Icons";
import TableOfContents from "./TableOfContents";

interface DocEditorProps {
  docId: string;
  onTitleChange: () => void;
}

export default function DocEditor({ docId, onTitleChange }: DocEditorProps) {
  const [mode, setMode] = useState<"edit" | "preview">("preview");
  const [meta, setMeta] = useState<DocMeta | null>(null);
  const [tocVisible, setTocVisible] = useState(true);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const lockSeqRef = useRef<number>(0);
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const editor = useCreateBlockNote({
    schema,
    uploadFile: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/images/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      return data.url;
    },
  });

  // Hide code block language selects during copy to prevent them from being included in pasted content
  useEffect(() => {
    const handleCopy = () => {
      const selects = document.querySelectorAll<HTMLElement>(
        '.bn-editor .bn-block-content[data-content-type="codeBlock"] > div[contenteditable="false"]'
      );
      selects.forEach((el) => (el.style.display = "none"));
      // Restore after the copy event completes
      setTimeout(() => {
        selects.forEach((el) => (el.style.display = ""));
      }, 0);
    };
    document.addEventListener("copy", handleCopy, true);
    return () => document.removeEventListener("copy", handleCopy, true);
  }, []);

  // Load document data asynchronously
  useEffect(() => {
    if (!docId) {
      setLoading(false);
      setMeta(null);
      return;
    }

    setLoading(true);

    Promise.all([getDocMeta(docId), getDocContent(docId)])
      .then(([metaData, contentData]) => {
        if (!metaData) {
          setNotFound(true);
          setMeta(null);
        } else {
          setNotFound(false);
          setMeta(metaData);
          setTitleValue(metaData.title);
          // Initialize editor content
          setTimeout(() => {
            try {
              if (contentData?.blocks && contentData.blocks.length > 0) {
                editor.replaceBlocks(editor.document, contentData.blocks);
              } else {
                editor.replaceBlocks(editor.document, []);
              }
              setBlocks([...editor.document] as Block[]);
            } catch (e) {
              console.error("Failed to initialize editor content:", e);
            }
          }, 50);
        }
        setLoading(false);
      })
      .catch(() => {
        setNotFound(true);
        setLoading(false);
      });
  }, [docId, editor]);

  // Save with lock check: verify lockSeq before saving
  const saveWithLockCheck = useCallback(async (): Promise<boolean> => {
    try {
      const currentSeq = await checkEditLock(docId);
      if (currentSeq !== lockSeqRef.current) {
        // Lock has been taken by another user
        setMode("preview");
        // Reload latest content
        const contentData = await getDocContent(docId);
        if (contentData?.blocks && contentData.blocks.length > 0) {
          editor.replaceBlocks(editor.document, contentData.blocks);
        }
        setBlocks([...editor.document] as Block[]);
        alert("Another user has started editing this document. Your changes were not saved.");
        return false;
      }
      await updateDocContent(docId, editor.document as Block[]);
      return true;
    } catch (e) {
      console.error("Save failed:", e);
      return false;
    }
  }, [docId, editor]);

  const handleManualSave = useCallback(async () => {
    await saveWithLockCheck();
  }, [saveWithLockCheck]);

  const handlePublish = useCallback(async () => {
    const saved = await saveWithLockCheck();
    if (saved) {
      setMode("preview");
    }
  }, [saveWithLockCheck]);

  // Enter edit mode: acquire lock
  const enterEditMode = useCallback(async () => {
    const seq = await acquireEditLock(docId);
    lockSeqRef.current = seq;
    setMode("edit");
  }, [docId]);

  // Keyboard shortcuts: 'e' to enter edit mode, 'Ctrl+Enter' to publish
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        // Allow Ctrl+Enter in editor
        if (!(e.ctrlKey && e.key === 'Enter')) return;
      }

      if (mode === 'preview' && e.key === 'e') {
        e.preventDefault();
        enterEditMode();
      } else if (mode === 'edit' && e.ctrlKey && e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        handlePublish();
      } else if (mode === 'edit' && e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        handleManualSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, handleManualSave, handlePublish, enterEditMode]);

  const autoSave = useCallback(async () => {
    if (mode !== "edit") return;
    await saveWithLockCheck();
  }, [mode, saveWithLockCheck]);

  useEffect(() => {
    if (mode === "edit") {
      autoSaveTimerRef.current = setInterval(autoSave, 60000);
    }
    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [mode, autoSave]);

  const handleExport = useCallback(async () => {
    try {
      const result = await exportSingleDoc(docId);
      alert(`Exported to: ${result.exportPath}/${result.filename}`);
    } catch (e) {
      console.error("Export failed:", e);
      alert("Export failed. Please try again.");
    }
  }, [docId]);

  const handleTitleSave = async () => {
    if (titleValue.trim() && meta && titleValue !== meta.title) {
      await updateDocTitle(docId, titleValue.trim());
      setMeta({ ...meta, title: titleValue.trim() });
      onTitleChange();
    }
    setEditingTitle(false);
  };

  if (!docId) {
    return (
      <div className="doc-editor-wrapper">
        <div className="doc-editor empty">
          <p>Select a document to view or edit</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="doc-editor-wrapper">
        <div className="doc-editor empty">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (notFound || !meta) {
    return (
      <div className="doc-editor-wrapper">
        <div className="doc-editor empty">
          <p>Document not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="doc-editor-wrapper">
      <div className="doc-editor">
        <div className="editor-header">
          <div className="title-section">
            {editingTitle ? (
              <input
                className="title-input"
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTitleSave();
                  if (e.key === "Escape") {
                    setTitleValue(meta.title);
                    setEditingTitle(false);
                  }
                }}
                autoFocus
              />
            ) : (
              <h1
                className="doc-title"
                onClick={() => {
                  setEditingTitle(true);
                  setTitleValue(meta.title);
                }}
              >
                {meta.title || "Untitled"}
              </h1>
            )}
          </div>

          <div className="header-actions">
            {mode === "preview" ? (
              <>
                <button
                  className="btn btn-icon"
                  onClick={handleExport}
                  title="Export as Markdown"
                >
                  <Download className="icon-md" />
                </button>
                <button className="btn btn-primary" onClick={enterEditMode}>
                  Edit
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-save" onClick={handleManualSave}>
                  Save
                </button>
                <button className="btn btn-secondary" onClick={() => setMode("preview")}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handlePublish}>
                  Publish
                </button>
              </>
            )}
          </div>
        </div>

        <div className="editor-content">
          <BlockNoteView
            editor={editor}
            theme="light"
            editable={mode === "edit"}
            formattingToolbar={false}
            slashMenu={false}
            onChange={() => setBlocks([...editor.document] as Block[])}
          >
            <FormattingToolbarController
              formattingToolbar={() => (
                <FormattingToolbar>
                  <BlockTypeSelect key="blockTypeSelect" />
                  <BasicTextStyleButton basicTextStyle="bold" key="boldStyleButton" />
                  <BasicTextStyleButton basicTextStyle="italic" key="italicStyleButton" />
                  <BasicTextStyleButton basicTextStyle="underline" key="underlineStyleButton" />
                  <BasicTextStyleButton basicTextStyle="strike" key="strikeStyleButton" />
                  <BasicTextStyleButton basicTextStyle="code" key="codeStyleButton" />
                  <TextAlignButton textAlignment="left" key="textAlignLeftButton" />
                  <TextAlignButton textAlignment="center" key="textAlignCenterButton" />
                  <TextAlignButton textAlignment="right" key="textAlignRightButton" />
                  <ColorStyleButton key="colorStyleButton" />
                  <NestBlockButton key="nestBlockButton" />
                  <UnnestBlockButton key="unnestBlockButton" />
                  <CreateLinkButton key="createLinkButton" />
                </FormattingToolbar>
              )}
            />
            <SuggestionMenuController
              triggerCharacter="/"
              getItems={async (query) =>
                filterSuggestionItems(
                  [...getDefaultReactSlashMenuItems(editor), getNoteSlashMenuItem(editor)],
                  query,
                )
              }
            />
          </BlockNoteView>
        </div>
      </div>

      <TableOfContents
        blocks={blocks}
        visible={tocVisible}
        onToggle={() => setTocVisible(!tocVisible)}
      />
    </div>
  );
}
