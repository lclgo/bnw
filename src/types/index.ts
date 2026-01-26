import type { Block } from "@blocknote/core";

export interface DocMeta {
  id: string;
  title: string;
  parentId: string | null;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface DocContent {
  id: string;
  blocks: Block[];
}

export interface DocNode extends DocMeta {
  children: DocNode[];
}

export interface TocItem {
  id: string;
  text: string;
  level: number;
}
