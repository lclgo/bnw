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
import { getDocContent, getDocMeta, updateDocContent, updateDocTitle } from "../services/storage";
import type { DocMeta } from "../types";
import { getNoteSlashMenuItem, schema } from "../utils/editorSchema";
import "./DocEditor.css";
import TableOfContents from "./TableOfContents";

interface DocEditorProps {
  docId: string;
  onTitleChange: () => void;
}

export default function DocEditor({ docId, onTitleChange }: DocEditorProps) {
  const [mode, setMode] = useState<"edit" | "preview">("preview");
  const [meta, setMeta] = useState<DocMeta | null>(null);
  const [tocVisible, setTocVisible] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
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

  const handleSave = useCallback(async () => {
    await updateDocContent(docId, editor.document as Block[]);
    setMode("preview");
  }, [docId, editor]);

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
        setMode('edit');
      } else if (mode === 'edit' && e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, handleSave]);

  const autoSave = useCallback(async () => {
    if (mode !== "edit") return;
    await updateDocContent(docId, editor.document as Block[]);
  }, [docId, editor, mode]);

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
              <button className="btn btn-primary" onClick={() => setMode("edit")}>
                Edit
              </button>
            ) : (
              <>
                <button className="btn btn-secondary" onClick={() => setMode("preview")}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSave}>
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
        blocks={editor.document as Block[]}
        visible={tocVisible}
        onToggle={() => setTocVisible(!tocVisible)}
      />
    </div>
  );
}
