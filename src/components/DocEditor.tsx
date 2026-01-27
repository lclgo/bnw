import { codeBlockOptions } from "@blocknote/code-block";
import type { Block } from "@blocknote/core";
import { BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getDocContent, getDocMeta, updateDocContent, updateDocTitle } from "../services/storage";
import type { DocMeta } from "../types";
import "./DocEditor.css";
import TableOfContents from "./TableOfContents";

interface DocEditorProps {
  docId: string;
  onTitleChange: () => void;
}

const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock: createCodeBlockSpec(codeBlockOptions),
  },
});

export default function DocEditor({ docId, onTitleChange }: DocEditorProps) {
  const [mode, setMode] = useState<"edit" | "preview">("preview");
  const [meta, setMeta] = useState<DocMeta | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [tocVisible, setTocVisible] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const editorInitialized = useRef(false);

  const editor = useCreateBlockNote({
    schema,
  });

  // Load document data asynchronously
  useEffect(() => {
    if (!docId) {
      setLoading(false);
      setMeta(null);
      return;
    }

    setLoading(true);
    editorInitialized.current = false;

    Promise.all([getDocMeta(docId), getDocContent(docId)])
      .then(([metaData, contentData]) => {
        if (!metaData) {
          setNotFound(true);
          setMeta(null);
        } else {
          setNotFound(false);
          setMeta(metaData);
          setTitleValue(metaData.title);
          setBlocks(contentData?.blocks || []);
          
          // Initialize editor content
          setTimeout(() => {
            try {
              if (contentData?.blocks && contentData.blocks.length > 0) {
                editor.replaceBlocks(editor.document, contentData.blocks);
              } else {
                editor.replaceBlocks(editor.document, []);
              }
              editorInitialized.current = true;
            } catch (e) {
              console.error("Error initializing editor:", e);
            }
          }, 50);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading document:", err);
        setNotFound(true);
        setLoading(false);
      });
  }, [docId, editor]);

  const handleSave = useCallback(async () => {
    const currentBlocks = editor.document;
    await updateDocContent(docId, currentBlocks);
    setBlocks(currentBlocks);
    setMode("preview");
  }, [docId, editor]);

  const handleTitleSave = async () => {
    if (titleValue.trim() && meta && titleValue !== meta.title) {
      await updateDocTitle(docId, titleValue.trim());
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
