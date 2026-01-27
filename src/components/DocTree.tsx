import { useCallback, useEffect, useRef, useState } from "react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import {
  createDoc,
  deleteDoc,
  getDocTree,
  moveDocToPosition,
  updateDocParent,
  updateDocTitle,
} from "../services/storage";
import type { DocNode } from "../types";
import "./DocTree.css";
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Plus, Trash2 } from "./Icons";

const ItemType = "WIKI_DOC";

interface DragItem {
  id: string;
  type: string;
}

interface DocTreeProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  refreshKey: number;
  onTreeChange: () => void;
}

type DropPosition = 'before' | 'inside' | 'after' | null;

interface TreeItemProps {
  node: DocNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onAddChild: (parentId: string) => void;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onMoveAsChild: (draggedId: string, targetId: string) => void;
  onMoveToPosition: (draggedId: string, targetId: string, parentId: string | null, position: 'before' | 'after') => void;
  parentId: string | null;
}

function TreeItem({
  node,
  depth,
  selectedId,
  onSelect,
  onDelete,
  onRename,
  onAddChild,
  expandedIds,
  onToggleExpand,
  onMoveAsChild,
  onMoveToPosition,
  parentId,
}: TreeItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(node.title);
  const [showMenu, setShowMenu] = useState(false);
  const [dropPosition, setDropPosition] = useState<DropPosition>(null);

  const isExpanded = expandedIds.has(node.id);
  const hasChildren = node.children.length > 0;

  const [{ isDragging }, drag] = useDrag({
    type: ItemType,
    item: { id: node.id, type: ItemType },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [{ isOver, canDrop }, drop] = useDrop({
    accept: ItemType,
    hover: (item: DragItem, monitor) => {
      if (!ref.current || item.id === node.id) {
        setDropPosition(null);
        return;
      }
      const hoverBoundingRect = ref.current.getBoundingClientRect();
      const hoverHeight = hoverBoundingRect.bottom - hoverBoundingRect.top;
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;
      const ratio = hoverClientY / hoverHeight;
      
      if (ratio < 0.3) {
        setDropPosition('before');
      } else if (ratio > 0.7) {
        setDropPosition('after');
      } else {
        setDropPosition('inside');
      }
    },
    drop: (item: DragItem, monitor) => {
      if (monitor.didDrop()) return;
      if (item.id === node.id) return;
      
      if (dropPosition === 'inside') {
        onMoveAsChild(item.id, node.id);
      } else if (dropPosition === 'before') {
        onMoveToPosition(item.id, node.id, parentId, 'before');
      } else if (dropPosition === 'after') {
        onMoveToPosition(item.id, node.id, parentId, 'after');
      }
      setDropPosition(null);
    },
    canDrop: (item: DragItem) => item.id !== node.id,
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
      canDrop: monitor.canDrop(),
    }),
  });

  useEffect(() => {
    if (!isOver) {
      setDropPosition(null);
    }
  }, [isOver]);

  drag(drop(ref));

  const handleSaveTitle = () => {
    if (editTitle.trim() && editTitle !== node.title) {
      onRename(node.id, editTitle.trim());
    } else {
      setEditTitle(node.title);
    }
    setIsEditing(false);
  };

  const dropClass = isOver && canDrop && dropPosition ? `drop-${dropPosition}` : '';

  return (
    <div className="tree-item-container">
      <div
        ref={ref}
        className={`tree-item ${selectedId === node.id ? "selected" : ""} ${
          isDragging ? "dragging" : ""
        } ${dropClass}`}
        onClick={() => onSelect(node.id)}
        onMouseEnter={() => setShowMenu(true)}
        onMouseLeave={() => setShowMenu(false)}
      >
        <div className="tree-item-indent" style={{ width: depth * 16 }} />
        {hasChildren ? (
          <button
            className="expand-btn"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.id);
            }}
          >
            {isExpanded ? (
              <ChevronDown className="icon-sm" />
            ) : (
              <ChevronRight className="icon-sm" />
            )}
          </button>
        ) : (
          <div className="expand-placeholder" />
        )}

        {hasChildren ? (
          isExpanded ? (
            <FolderOpen className="doc-icon" />
          ) : (
            <Folder className="doc-icon" />
          )
        ) : (
          <FileText className="doc-icon" />
        )}

        {isEditing ? (
          <input
            className="title-input"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveTitle();
              if (e.key === "Escape") {
                setEditTitle(node.title);
                setIsEditing(false);
              }
            }}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="title" onDoubleClick={() => setIsEditing(true)}>
            {node.title || "Untitled"}
          </span>
        )}

        {showMenu && (
          <div className="item-menu">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddChild(node.id);
              }}
              title="Add sub-document"
            >
              <Plus className="icon-xs" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("Are you sure to delete this document?")) {
                  onDelete(node.id);
                }
              }}
              title="Delete"
              className="delete-btn"
            >
              <Trash2 className="icon-xs" />
            </button>
          </div>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div className="children">
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onDelete={onDelete}
              onRename={onRename}
              onAddChild={onAddChild}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              onMoveAsChild={onMoveAsChild}
              onMoveToPosition={onMoveToPosition}
              parentId={node.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DocTreeInner({
  selectedId,
  onSelect,
  refreshKey,
  onTreeChange,
}: DocTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [tree, setTree] = useState<DocNode[]>([]);
  const [loading, setLoading] = useState(true);

  // Load tree asynchronously
  useEffect(() => {
    setLoading(true);
    getDocTree()
      .then((data) => {
        setTree(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [refreshKey]);

  const findNodeById = useCallback((nodes: DocNode[], id: string): DocNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
    return null;
  }, []);

  const isDescendant = useCallback((nodes: DocNode[], parentId: string, childId: string): boolean => {
    const parent = findNodeById(nodes, parentId);
    if (!parent) return false;
    
    const checkChildren = (node: DocNode): boolean => {
      if (node.id === childId) return true;
      return node.children.some(checkChildren);
    };
    
    return checkChildren(parent);
  }, [findNodeById]);

  const handleToggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleMoveAsChild = async (draggedId: string, targetId: string) => {
    if (isDescendant(tree, draggedId, targetId)) return;
    
    await updateDocParent(draggedId, targetId);
    setExpandedIds((prev) => new Set(prev).add(targetId));
    onTreeChange();
  };

  const handleMoveToPosition = async (
    draggedId: string,
    targetId: string,
    parentId: string | null,
    position: 'before' | 'after'
  ) => {
    if (parentId && isDescendant(tree, draggedId, parentId)) return;
    
    await moveDocToPosition(draggedId, parentId, targetId, position);
    if (parentId) {
      setExpandedIds((prev) => new Set(prev).add(parentId));
    }
    onTreeChange();
  };

  const handleAddRoot = async () => {
    const meta = await createDoc("New Document");
    onTreeChange();
    onSelect(meta.id);
  };

  const handleAddChild = async (parentId: string) => {
    const meta = await createDoc("New Document", parentId);
    setExpandedIds((prev) => new Set(prev).add(parentId));
    onTreeChange();
    onSelect(meta.id);
  };

  const handleDelete = async (id: string) => {
    await deleteDoc(id);
    onTreeChange();
    if (selectedId === id) {
      onSelect(tree.length > 0 && tree[0].id !== id ? tree[0].id : "");
    }
  };

  const handleRename = async (id: string, title: string) => {
    await updateDocTitle(id, title);
    onTreeChange();
  };

  return (
    <div className="doc-tree">
      <div className="tree-header">
        <h3>Wiki</h3>
        <button onClick={handleAddRoot} title="Add document" className="add-btn">
          <Plus className="icon-md" />
        </button>
      </div>

      <div className="tree-content">
        {loading ? (
          <div className="empty-hint">
            <p>Loading...</p>
          </div>
        ) : tree.length === 0 ? (
          <div className="empty-hint">
            <FileText className="empty-icon" />
            <p>No documents yet</p>
            <p className="hint-text">Click + to create one</p>
          </div>
        ) : (
          tree.map((node) => (
            <TreeItem
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              onSelect={onSelect}
              onDelete={handleDelete}
              onRename={handleRename}
              onAddChild={handleAddChild}
              expandedIds={expandedIds}
              onToggleExpand={handleToggleExpand}
              onMoveAsChild={handleMoveAsChild}
              onMoveToPosition={handleMoveToPosition}
              parentId={null}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default function DocTree(props: DocTreeProps) {
  return (
    <DndProvider backend={HTML5Backend}>
      <DocTreeInner {...props} />
    </DndProvider>
  );
}
