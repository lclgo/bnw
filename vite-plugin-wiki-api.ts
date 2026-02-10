import fs from "fs";
import path from "path";
import type { Connect, Plugin } from "vite";

const DATA_DIR = path.resolve(__dirname, "wiki-data");
const DOCS_DIR = path.join(DATA_DIR, "docs");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const INDEX_FILE = path.join(DATA_DIR, "index.json");

function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
  if (!fs.existsSync(INDEX_FILE)) fs.writeFileSync(INDEX_FILE, JSON.stringify({ docs: {} }, null, 2));
}

function generateShortId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const length = 8 + Math.floor(Math.random() * 5);
  return Array.from({ length }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join("");
}

function readIndex(): { docs: Record<string, DocMeta> } {
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf-8"));
  } catch {
    return { docs: {} };
  }
}

function writeIndex(index: { docs: Record<string, DocMeta> }) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
}

async function parseBody<T>(req: Connect.IncomingMessage): Promise<T> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : ({} as T));
      } catch {
        resolve({} as T);
      }
    });
  });
}

function generateImageId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

function getExtension(contentType: string): string {
  const mimeToExt: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
  };
  return mimeToExt[contentType] || ".png";
}

async function parseMultipartFormData(
  req: Connect.IncomingMessage
): Promise<{ filename: string; contentType: string; data: Buffer } | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const contentType = req.headers["content-type"] || "";
      const boundaryMatch = contentType.match(/boundary=(.+)/);
      if (!boundaryMatch) {
        resolve(null);
        return;
      }

      const boundary = boundaryMatch[1];
      const boundaryBuffer = Buffer.from(`--${boundary}`);
      const parts = [];
      let start = 0;

      while (true) {
        const boundaryIndex = body.indexOf(boundaryBuffer, start);
        if (boundaryIndex === -1) break;
        if (start !== 0) {
          parts.push(body.slice(start, boundaryIndex - 2));
        }
        start = boundaryIndex + boundaryBuffer.length + 2;
      }

      for (const part of parts) {
        const headerEnd = part.indexOf("\r\n\r\n");
        if (headerEnd === -1) continue;

        const headers = part.slice(0, headerEnd).toString();
        const fileData = part.slice(headerEnd + 4);

        const filenameMatch = headers.match(/filename="([^"]+)"/);
        const contentTypeMatch = headers.match(/Content-Type:\s*(.+)/i);

        if (filenameMatch && contentTypeMatch) {
          resolve({
            filename: filenameMatch[1],
            contentType: contentTypeMatch[1].trim(),
            data: fileData,
          });
          return;
        }
      }
      resolve(null);
    });
  });
}

function extractTextFromBlocks(blocks: unknown[]): string {
  const texts: string[] = [];

  function extractFromContent(content: unknown[]): void {
    if (!Array.isArray(content)) return;
    for (const item of content) {
      if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        if (typeof obj.text === "string") {
          texts.push(obj.text);
        }
        if (Array.isArray(obj.content)) {
          extractFromContent(obj.content);
        }
      }
    }
  }

  function processBlock(block: unknown): void {
    if (typeof block !== "object" || block === null) return;
    const b = block as Record<string, unknown>;
    if (Array.isArray(b.content)) {
      extractFromContent(b.content);
    }
    if (Array.isArray(b.children)) {
      for (const child of b.children) {
        processBlock(child);
      }
    }
  }

  for (const block of blocks) {
    processBlock(block);
  }

  return texts.join(" ");
}

interface DocMeta {
  id: string;
  title: string;
  parentId: string | null;
  order: number;
  createdAt: number;
  updatedAt: number;
}

type ApiHandler = (
  req: Connect.IncomingMessage,
  res: { setHeader: Function; end: Function; statusCode?: number },
  params?: Record<string, string>
) => Promise<void>;

const routes: Array<{ method: string; pattern: RegExp; handler: ApiHandler }> = [
  {
    method: "GET",
    pattern: /^\/api\/docs$/,
    handler: async (_req, res) => {
      const metas = Object.values(readIndex().docs);
      res.end(JSON.stringify(metas));
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/docs$/,
    handler: async (req, res) => {
      const { title, parentId } = await parseBody<{ title?: string; parentId?: string }>(req);
      const index = readIndex();

      let id: string;
      do {
        id = generateShortId();
      } while (index.docs[id]);

      const siblings = Object.values(index.docs).filter((d) => d.parentId === (parentId || null));
      const maxOrder = siblings.length > 0 ? Math.max(...siblings.map((s) => s.order)) : -1;

      const meta: DocMeta = {
        id,
        title: title || "Untitled",
        parentId: parentId || null,
        order: maxOrder + 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      index.docs[id] = meta;
      writeIndex(index);
      fs.writeFileSync(path.join(DOCS_DIR, `${id}.json`), JSON.stringify({ id, blocks: [] }, null, 2));

      res.end(JSON.stringify(meta));
    },
  },
  {
    method: "PUT",
    pattern: /^\/api\/docs\/tree\/order$/,
    handler: async (req, res) => {
      const { order } = await parseBody<{ order?: Array<{ id: string; parentId: string | null; order: number }> }>(req);
      const index = readIndex();

      order?.forEach(({ id, parentId, order: orderNum }) => {
        if (index.docs[id]) {
          index.docs[id].parentId = parentId;
          index.docs[id].order = orderNum;
          index.docs[id].updatedAt = Date.now();
        }
      });

      writeIndex(index);
      res.end(JSON.stringify({ success: true }));
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/docs\/([^/]+)\/meta$/,
    handler: async (_req, res, params) => {
      const meta = readIndex().docs[params!.id];
      if (!meta) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "Not found" }));
        return;
      }
      res.end(JSON.stringify(meta));
    },
  },
  {
    method: "PUT",
    pattern: /^\/api\/docs\/([^/]+)\/meta$/,
    handler: async (req, res, params) => {
      const body = await parseBody<Partial<DocMeta>>(req);
      const index = readIndex();
      const meta = index.docs[params!.id];

      if (!meta) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "Not found" }));
        return;
      }

      Object.assign(meta, body, { updatedAt: Date.now() });
      writeIndex(index);
      res.end(JSON.stringify(meta));
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/docs\/([^/]+)\/content$/,
    handler: async (_req, res, params) => {
      const docFile = path.join(DOCS_DIR, `${params!.id}.json`);
      if (!fs.existsSync(docFile)) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "Not found" }));
        return;
      }
      res.end(fs.readFileSync(docFile, "utf-8"));
    },
  },
  {
    method: "PUT",
    pattern: /^\/api\/docs\/([^/]+)\/content$/,
    handler: async (req, res, params) => {
      const { blocks } = await parseBody<{ blocks?: unknown[] }>(req);
      const content = { id: params!.id, blocks };
      fs.writeFileSync(path.join(DOCS_DIR, `${params!.id}.json`), JSON.stringify(content, null, 2));

      const index = readIndex();
      if (index.docs[params!.id]) {
        index.docs[params!.id].updatedAt = Date.now();
        writeIndex(index);
      }
      res.end(JSON.stringify(content));
    },
  },
  {
    method: "DELETE",
    pattern: /^\/api\/docs\/([^/]+)$/,
    handler: async (_req, res, params) => {
      const index = readIndex();

      const deleteRecursive = (docId: string) => {
        Object.values(index.docs)
          .filter((d) => d.parentId === docId)
          .forEach((child) => deleteRecursive(child.id));

        delete index.docs[docId];
        const docFile = path.join(DOCS_DIR, `${docId}.json`);
        if (fs.existsSync(docFile)) fs.unlinkSync(docFile);
      };

      deleteRecursive(params!.id);
      writeIndex(index);
      res.end(JSON.stringify({ success: true }));
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/images\/upload$/,
    handler: async (req, res) => {
      const fileData = await parseMultipartFormData(req);
      if (!fileData) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "No file uploaded" }));
        return;
      }

      const ext = getExtension(fileData.contentType);
      const imageId = generateImageId();
      const filename = `${imageId}${ext}`;
      const filePath = path.join(IMAGES_DIR, filename);

      fs.writeFileSync(filePath, fileData.data);
      res.end(JSON.stringify({ url: `/api/images/${filename}` }));
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/images\/([^/]+)$/,
    handler: async (_req, res, params) => {
      const filename = params!.id;
      const filePath = path.join(IMAGES_DIR, filename);

      if (!fs.existsSync(filePath)) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "Image not found" }));
        return;
      }

      const ext = path.extname(filename).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
      };

      res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
      res.end(fs.readFileSync(filePath));
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/docs\/search/,
    handler: async (req, res) => {
      const query = new URL(req.url || "", "http://localhost").searchParams.get("q")?.toLowerCase() || "";
      if (!query) return res.end("[]");

      const results: Array<{ id: string; title: string; matchText: string; matchType: "title" | "content" }> = [];

      for (const meta of Object.values(readIndex().docs)) {
        if (meta.title.toLowerCase().includes(query)) {
          results.push({ id: meta.id, title: meta.title, matchText: meta.title, matchType: "title" });
          continue;
        }

        const docFile = path.join(DOCS_DIR, `${meta.id}.json`);
        if (!fs.existsSync(docFile)) continue;

        try {
          const textContent = extractTextFromBlocks(JSON.parse(fs.readFileSync(docFile, "utf-8")).blocks || []);
          const matchIndex = textContent.toLowerCase().indexOf(query);
          if (matchIndex === -1) continue;

          const start = Math.max(0, matchIndex - 30);
          const end = Math.min(textContent.length, matchIndex + query.length + 50);
          let matchText = textContent.slice(start, end).replace(/\s+/g, " ").trim();
          if (start > 0) matchText = "..." + matchText;
          if (end < textContent.length) matchText += "...";

          results.push({ id: meta.id, title: meta.title, matchText, matchType: "content" });
        } catch {}
      }

      res.end(JSON.stringify(results.slice(0, 20)));
    },
  },
];

function createMiddleware(): Connect.NextHandleFunction {
  ensureDirectories();

  return async (req, res, next) => {
    const url = req.url || "";
    const method = req.method || "GET";

    if (!url.startsWith("/api")) return next();

    res.setHeader("Content-Type", "application/json");

    for (const route of routes) {
      if (route.method !== method) continue;

      const match = url.match(route.pattern);
      if (!match) continue;

      try {
        const params = match[1] ? { id: match[1] } : undefined;
        await route.handler(req, res, params);
        return;
      } catch (error) {
        console.error("API Error:", error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "Internal server error" }));
        return;
      }
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Not found" }));
  };
}

export function wikiApiPlugin(): Plugin {
  const middleware = createMiddleware();
  return {
    name: "wiki-api",
    configureServer: (server) => {
      server.middlewares.use(middleware);
    },
    configurePreviewServer: (server) => {
      server.middlewares.use(middleware);
    },
  };
}
