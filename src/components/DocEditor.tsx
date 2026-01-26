import type { Block } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDocContent, getDocMeta, updateDocContent, updateDocTitle } from "../services/storage";
import type { DocMeta } from "../types";
import "./DocEditor.css";
import TableOfContents from "./TableOfContents";

interface DocEditorProps {
  docId: string;
  onTitleChange: () => void;
}

export default function DocEditor({ docId, onTitleChange }: DocEditorProps) {
  // Synchronously load document data on mount
  const initialData = useMemo(() => {
    if (!docId) {
      return { meta: null, content: null, notFound: false };
    }
    const meta = getDocMeta(docId);
    const content = getDocContent(docId);
    return { meta, content, notFound: !meta };
  }, [docId]);

  const [mode, setMode] = useState<"edit" | "preview">("preview");
  const [meta, setMeta] = useState<DocMeta | null>(initialData.meta);
  const [blocks, setBlocks] = useState<Block[]>(initialData.content?.blocks || []);
  const [tocVisible, setTocVisible] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(initialData.meta?.title || "");
  const [notFound] = useState(initialData.notFound);
  const editorInitialized = useRef(false);

  const editor = useCreateBlockNote();

  // Initialize editor content after editor is ready
  useEffect(() => {
    if (!editor || !meta || editorInitialized.current) return;
    
    const timer = setTimeout(() => {
      try {
        const content = initialData.content;
        if (content?.blocks && content.blocks.length > 0) {
          editor.replaceBlocks(editor.document, content.blocks);
        } else {
          editor.replaceBlocks(editor.document, []);
        }
        editorInitialized.current = true;
      } catch (e) {
        console.error("Error initializing editor:", e);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [editor, meta, initialData.content]);

  const handleSave = useCallback(() => {
    const currentBlocks = editor.document;
    updateDocContent(docId, currentBlocks);
    setBlocks(currentBlocks);
    setMode("preview");
  }, [docId, editor]);

  const handleTitleSave = () => {
    if (titleValue.trim() && meta && titleValue !== meta.title) {
      updateDocTitle(docId, titleValue.trim());
      setMeta({ ...meta, title: titleValue.trim() });
      onTitleChange();
    }
    setEditingTitle(false);
  };

  const handleBlocksChange = useCallback(() => {
    setBlocks(editor.document);
  }, [editor]);



  if (!docId) {
    return (
      <div className="doc-editor-wrapper">
        <div className="doc-editor empty">
          <p>Select a document to view or edit</p>
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
            onChange={handleBlocksChange}
          />
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
