import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, FileText, Folder, FolderOpen, Search, X } from "../components/Icons";
import { useDocSearch } from "../hooks/useDocSearch";
import { getDocContent, getDocMeta, getDocTree } from "../services/storage";
import type { DocMeta, DocNode } from "../types";
import { schema } from "../utils/editorSchema";
import "./MobilePage.css";

interface MobileTreeItemProps {
  node: DocNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
}

function MobileTreeItem({ node, depth, selectedId, onSelect, expandedIds, onToggleExpand }: MobileTreeItemProps) {
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = node.children.length > 0;

  return (
    <div className="m-tree-item-container">
      <div
        className={`m-tree-item ${selectedId === node.id ? "selected" : ""}`}
        onClick={() => onSelect(node.id)}
      >
        <div className="m-tree-indent" style={{ width: depth * 20 }} />
        {hasChildren ? (
          <button
            className="m-btn-icon m-expand-btn"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.id);
            }}
          >
            {isExpanded ? <ChevronDown className="m-icon-sm" /> : <ChevronRight className="m-icon-sm" />}
          </button>
        ) : (
          <div className="m-expand-placeholder" />
        )}
        {hasChildren ? (
          isExpanded ? <FolderOpen className="m-doc-icon" /> : <Folder className="m-doc-icon" />
        ) : (
          <FileText className="m-doc-icon" />
        )}
        <span className="m-title">{node.title || "Untitled"}</span>
      </div>
      {hasChildren && isExpanded && (
        <div className="m-children">
          {node.children.map((child) => (
            <MobileTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MobileDocViewer({ docId, onBack }: { docId: string; onBack: () => void }) {
  const [meta, setMeta] = useState<DocMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const editor = useCreateBlockNote({ schema });

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    Promise.all([getDocMeta(docId), getDocContent(docId)])
      .then(([metaData, contentData]) => {
        if (!metaData) {
          setNotFound(true);
        } else {
          setMeta(metaData);
          timerRef.current = setTimeout(() => {
            try {
              const blocks = contentData?.blocks?.length ? contentData.blocks : [];
              editor.replaceBlocks(editor.document, blocks);
            } catch (e) {
              console.error("Failed to load editor blocks:", e);
            }
          }, 50);
        }
        setLoading(false);
      })
      .catch(() => {
        setNotFound(true);
        setLoading(false);
      });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [docId, editor]);

  if (loading) {
    return (
      <div className="m-viewer">
        <div className="m-viewer-header">
          <button className="m-btn-icon m-back-btn" onClick={onBack}>
            <ChevronLeft className="m-icon" />
          </button>
          <span className="m-viewer-title">Loading...</span>
        </div>
        <div className="m-loading">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="m-skeleton" style={{ width: `${80 - i * 10}%`, marginLeft: `${i * 5}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (notFound || !meta) {
    return (
      <div className="m-viewer">
        <div className="m-viewer-header">
          <button className="m-btn-icon m-back-btn" onClick={onBack}>
            <ChevronLeft className="m-icon" />
          </button>
          <span className="m-viewer-title">Not Found</span>
        </div>
        <div className="m-viewer-empty">Document not found</div>
      </div>
    );
  }

  return (
    <div className="m-viewer">
      <div className="m-viewer-header">
        <button className="m-btn-icon m-back-btn" onClick={onBack}>
          <ChevronLeft className="m-icon" />
        </button>
        <span className="m-viewer-title">{meta.title || "Untitled"}</span>
      </div>
      <div className="m-viewer-content">
        <BlockNoteView editor={editor} theme="light" editable={false} />
      </div>
    </div>
  );
}

function MobileSearchModal({
  isOpen,
  onClose,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const { query, results, searching, setQuery } = useDocSearch(isOpen);

  if (!isOpen) return null;

  return (
    <div className="m-search-overlay" onClick={onClose}>
      <div className="m-search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="m-search-input-wrap">
          <Search className="m-search-icon" />
          <input
            className="m-search-input"
            placeholder="Search documents..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <button className="m-btn-icon m-search-close" onClick={onClose}>
            <X className="m-icon-sm" />
          </button>
        </div>
        <div className="m-search-results">
          {!query && <div className="m-search-empty">Type to search documents</div>}
          {query && !searching && results.length === 0 && (
            <div className="m-search-empty">No results found</div>
          )}
          {results.map((result) => (
            <div
              key={result.id}
              className="m-search-result"
              onClick={() => {
                onSelect(result.id);
                onClose();
              }}
            >
              <FileText className="m-search-result-icon" />
              <div className="m-search-result-info">
                <div className="m-search-result-title">{result.title || "Untitled"}</div>
                {result.matchType === "content" && result.matchText && (
                  <div className="m-search-result-match">{result.matchText}</div>
                )}
              </div>
              <span className="m-search-result-type">{result.matchType}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MobilePage() {
  const [tree, setTree] = useState<DocNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    getDocTree()
      .then((data) => {
        setTree(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedId(null);
  }, []);

  if (selectedId) {
    return <MobileDocViewer docId={selectedId} onBack={handleBack} />;
  }

  return (
    <div className="m-page">
      <div className="m-page-header">
        <h2>Wiki</h2>
        <div className="m-header-actions">
          <button className="m-btn-icon m-header-btn" onClick={() => setSearchOpen(true)}>
            <Search className="m-icon" />
          </button>
        </div>
      </div>
      <MobileSearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={handleSelect}
      />
      <div className="m-page-content">
        {loading ? (
          <div className="m-loading">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="m-skeleton" style={{ width: `${85 - i * 8}%` }} />
            ))}
          </div>
        ) : tree.length === 0 ? (
          <div className="m-empty">
            <FileText className="m-empty-icon" />
            <p>No documents yet</p>
            <p className="m-hint">Create documents on desktop</p>
          </div>
        ) : (
          tree.map((node) => (
            <MobileTreeItem
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              onSelect={handleSelect}
              expandedIds={expandedIds}
              onToggleExpand={handleToggleExpand}
            />
          ))
        )}
      </div>
    </div>
  );
}
