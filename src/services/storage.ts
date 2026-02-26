import type { Block } from "@blocknote/core";
import type { DocContent, DocMeta, DocNode } from "../types";

const API_BASE = "/api";

// Cache for document metadata to avoid repeated fetches during drag operations
let docMetasCache: DocMeta[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5000; // 5 seconds

function invalidateMetasCache() {
  docMetasCache = null;
  cacheTimestamp = 0;
}

async function getDocMetasWithCache(): Promise<DocMeta[]> {
  const now = Date.now();
  if (docMetasCache && (now - cacheTimestamp) < CACHE_TTL) {
    return docMetasCache;
  }
  const metas = await getAllDocMetas();
  docMetasCache = metas;
  cacheTimestamp = now;
  return metas;
}

// Async API functions
export async function getAllDocMetas(): Promise<DocMeta[]> {
  const response = await fetch(`${API_BASE}/docs`);
  if (!response.ok) throw new Error("Failed to get documents");
  const metas = await response.json();
  return metas.sort((a: DocMeta, b: DocMeta) => a.order - b.order);
}

export async function getDocMeta(id: string): Promise<DocMeta | null> {
  try {
    const response = await fetch(`${API_BASE}/docs/${id}/meta`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function getDocContent(id: string): Promise<DocContent | null> {
  try {
    const response = await fetch(`${API_BASE}/docs/${id}/content`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function createDoc(title: string, parentId: string | null = null): Promise<DocMeta> {
  const response = await fetch(`${API_BASE}/docs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, parentId }),
  });
  if (!response.ok) throw new Error("Failed to create document");
  invalidateMetasCache();
  return await response.json();
}

export async function updateDocTitle(id: string, title: string): Promise<void> {
  await fetch(`${API_BASE}/docs/${id}/meta`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  invalidateMetasCache();
}

export async function updateDocParent(id: string, newParentId: string | null): Promise<void> {
  const metas = await getDocMetasWithCache();
  const siblings = metas.filter((m) => m.parentId === newParentId && m.id !== id);
  const maxOrder = siblings.length > 0 ? Math.max(...siblings.map((s) => s.order)) : -1;

  await fetch(`${API_BASE}/docs/${id}/meta`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentId: newParentId, order: maxOrder + 1 }),
  });
  invalidateMetasCache();
}

export async function moveDocToPosition(
  id: string,
  newParentId: string | null,
  targetId: string | null,
  position: "before" | "after"
): Promise<void> {
  const metas = await getDocMetasWithCache();
  const siblings = metas
    .filter((m) => m.parentId === newParentId && m.id !== id)
    .sort((a, b) => a.order - b.order);

  let newOrder: number;

  if (targetId === null) {
    newOrder = siblings.length > 0 ? siblings[siblings.length - 1].order + 1 : 0;
  } else {
    const targetIndex = siblings.findIndex((s) => s.id === targetId);
    if (targetIndex === -1) {
      newOrder = siblings.length > 0 ? siblings[siblings.length - 1].order + 1 : 0;
    } else if (position === "before") {
      if (targetIndex === 0) {
        newOrder = siblings[0].order - 1;
      } else {
        newOrder = (siblings[targetIndex - 1].order + siblings[targetIndex].order) / 2;
      }
    } else {
      if (targetIndex === siblings.length - 1) {
        newOrder = siblings[targetIndex].order + 1;
      } else {
        newOrder = (siblings[targetIndex].order + siblings[targetIndex + 1].order) / 2;
      }
    }
  }

  await fetch(`${API_BASE}/docs/${id}/meta`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentId: newParentId, order: newOrder }),
  });
  invalidateMetasCache();
}

export async function deleteDoc(id: string): Promise<void> {
  await fetch(`${API_BASE}/docs/${id}`, { method: "DELETE" });
  invalidateMetasCache();
}

export function buildDocTree(metas: DocMeta[]): DocNode[] {
  const metaMap = new Map<string, DocNode>();
  metas.forEach((meta) => {
    metaMap.set(meta.id, { ...meta, children: [] });
  });

  const roots: DocNode[] = [];
  metaMap.forEach((node) => {
    if (node.parentId === null) {
      roots.push(node);
    } else {
      const parent = metaMap.get(node.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
  });

  const sortChildren = (nodes: DocNode[]) => {
    nodes.sort((a, b) => a.order - b.order);
    nodes.forEach((n) => sortChildren(n.children));
  };
  sortChildren(roots);

  return roots;
}

export async function updateDocContent(id: string, blocks: Block[]): Promise<void> {
  await fetch(`${API_BASE}/docs/${id}/content`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks }),
  });
}

export async function getDocTree(): Promise<DocNode[]> {
  const metas = await getAllDocMetas();
  return buildDocTree(metas);
}

export interface SearchResult {
  id: string;
  title: string;
  matchText: string;
  matchType: "title" | "content";
}

export async function searchDocs(keyword: string): Promise<SearchResult[]> {
  const response = await fetch(`${API_BASE}/docs/search?q=${encodeURIComponent(keyword)}`);
  if (!response.ok) throw new Error("Failed to search documents");
  return await response.json();
}

// --- Edit Lock APIs ---

export async function acquireEditLock(docId: string): Promise<number> {
  const response = await fetch(`${API_BASE}/docs/${docId}/lock`, {
    method: "POST",
  });
  const data = await response.json();
  return data.lockSeq;
}

export async function checkEditLock(docId: string): Promise<number> {
  const response = await fetch(`${API_BASE}/docs/${docId}/lock`);
  const data = await response.json();
  return data.lockSeq;
}
