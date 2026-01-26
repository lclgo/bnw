import type { Block } from "@blocknote/core";
import { v4 as uuidv4 } from "uuid";
import type { DocContent, DocMeta, DocNode } from "../types";

const DOC_META_PREFIX = "wiki_doc_meta_";
const DOC_CONTENT_PREFIX = "wiki_doc_content_";

export function getAllDocMetas(): DocMeta[] {
  const metas: DocMeta[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(DOC_META_PREFIX)) {
      const meta = JSON.parse(localStorage.getItem(key)!) as DocMeta;
      metas.push(meta);
    }
  }
  return metas.sort((a, b) => a.order - b.order);
}

export function getDocMeta(id: string): DocMeta | null {
  const data = localStorage.getItem(DOC_META_PREFIX + id);
  return data ? JSON.parse(data) : null;
}

export function saveDocMeta(meta: DocMeta): void {
  localStorage.setItem(DOC_META_PREFIX + meta.id, JSON.stringify(meta));
}

export function deleteDocMeta(id: string): void {
  localStorage.removeItem(DOC_META_PREFIX + id);
}

export function getDocContent(id: string): DocContent | null {
  const data = localStorage.getItem(DOC_CONTENT_PREFIX + id);
  return data ? JSON.parse(data) : null;
}

export function saveDocContent(content: DocContent): void {
  localStorage.setItem(DOC_CONTENT_PREFIX + content.id, JSON.stringify(content));
}

export function deleteDocContent(id: string): void {
  localStorage.removeItem(DOC_CONTENT_PREFIX + id);
}

export function createDoc(title: string, parentId: string | null = null): DocMeta {
  const id = uuidv4();
  const siblings = getAllDocMetas().filter((m) => m.parentId === parentId);
  const maxOrder = siblings.length > 0 ? Math.max(...siblings.map((s) => s.order)) : -1;

  const meta: DocMeta = {
    id,
    title,
    parentId,
    order: maxOrder + 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const content: DocContent = {
    id,
    blocks: [],
  };

  saveDocMeta(meta);
  saveDocContent(content);
  return meta;
}

export function updateDocTitle(id: string, title: string): void {
  const meta = getDocMeta(id);
  if (meta) {
    meta.title = title;
    meta.updatedAt = Date.now();
    saveDocMeta(meta);
  }
}

export function updateDocParent(id: string, newParentId: string | null): void {
  const meta = getDocMeta(id);
  if (!meta) return;

  const siblings = getAllDocMetas().filter(
    (m) => m.parentId === newParentId && m.id !== id
  );
  const maxOrder = siblings.length > 0 ? Math.max(...siblings.map((s) => s.order)) : -1;

  meta.parentId = newParentId;
  meta.order = maxOrder + 1;
  meta.updatedAt = Date.now();
  saveDocMeta(meta);
}

export function deleteDoc(id: string): void {
  const allMetas = getAllDocMetas();
  const children = allMetas.filter((m) => m.parentId === id);
  children.forEach((child) => deleteDoc(child.id));

  deleteDocMeta(id);
  deleteDocContent(id);
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

export function updateDocContent(id: string, blocks: Block[]): void {
  const content: DocContent = { id, blocks };
  saveDocContent(content);

  const meta = getDocMeta(id);
  if (meta) {
    meta.updatedAt = Date.now();
    saveDocMeta(meta);
  }
}

export function getDocTree(): DocNode[] {
  return buildDocTree(getAllDocMetas());
}

export function exportDocToJson(id: string): string {
  const meta = getDocMeta(id);
  const content = getDocContent(id);
  return JSON.stringify({ meta, content }, null, 2);
}

export function saveDocTreeOrder(order: { id: string; parentId: string | null; order: number }[]): void {
  order.forEach(({ id, parentId, order: orderNum }) => {
    const meta = getDocMeta(id);
    if (meta) {
      meta.parentId = parentId;
      meta.order = orderNum;
      meta.updatedAt = Date.now();
      saveDocMeta(meta);
    }
  });
}
