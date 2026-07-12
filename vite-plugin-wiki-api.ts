import archiver from "archiver";
import crypto from "crypto";
import fs from "fs";
import type { ServerResponse } from "http";
import path from "path";
import type { Connect, Plugin } from "vite";

const DATA_DIR = path.resolve(__dirname, "wiki-data");
const DOCS_DIR = path.join(DATA_DIR, "docs");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const INDEX_FILE = path.join(DATA_DIR, "index.json");
const EXPORT_DIR = path.resolve(__dirname, "export");
const EXPORT_PASSWORD_HASH = "e553db54d403b7aaa74a47b9d8e162dfb48500dd714357a5743b36785c2d72b7";

function verifyPassword(password: string | undefined): boolean {
  if (!password) return false;
  const hash = crypto.createHash("sha256").update(password).digest("hex");
  return hash === EXPORT_PASSWORD_HASH;
}

interface DocMeta {
  id: string;
  title: string;
  parentId: string | null;
  order: number;
  createdAt: number;
  updatedAt: number;
}

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

// Convert inline content to markdown text
function inlineContentToMarkdown(content: unknown[]): string {
  if (!Array.isArray(content)) return "";
  let result = "";
  for (const item of content) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;
    if (obj.type === "text" && typeof obj.text === "string") {
      let text = obj.text;
      const styles = (obj.styles || {}) as Record<string, unknown>;
      if (styles.bold) text = `**${text}**`;
      if (styles.italic) text = `*${text}*`;
      if (styles.strike) text = `~~${text}~~`;
      if (styles.code) text = `\`${text}\``;
      result += text;
    } else if (obj.type === "link") {
      const linkContent = Array.isArray(obj.content) ? inlineContentToMarkdown(obj.content) : "";
      result += `[${linkContent}](${obj.href || ""})`;
    }
  }
  return result;
}

// Convert BlockNote blocks to markdown string
function blocksToMarkdown(blocks: unknown[]): string {
  const lines: string[] = [];

  function processBlock(block: unknown, indent: string = ""): void {
    if (typeof block !== "object" || block === null) return;
    const b = block as Record<string, unknown>;
    const type = b.type as string;
    const props = (b.props || {}) as Record<string, unknown>;
    const content = Array.isArray(b.content) ? b.content : [];
    const children = Array.isArray(b.children) ? b.children : [];
    const text = inlineContentToMarkdown(content);

    switch (type) {
      case "heading": {
        const level = (props.level as number) || 1;
        lines.push(`${indent}${"#".repeat(level)} ${text}`);
        lines.push("");
        break;
      }
      case "paragraph": {
        lines.push(`${indent}${text}`);
        lines.push("");
        break;
      }
      case "bulletListItem": {
        lines.push(`${indent}- ${text}`);
        break;
      }
      case "numberedListItem": {
        lines.push(`${indent}1. ${text}`);
        break;
      }
      case "checkListItem": {
        const checked = props.checked ? "x" : " ";
        lines.push(`${indent}- [${checked}] ${text}`);
        break;
      }
      case "codeBlock": {
        const lang = (props.language as string) || "";
        lines.push(`${indent}\`\`\`${lang}`);
        lines.push(text);
        lines.push(`${indent}\`\`\``);
        lines.push("");
        break;
      }
      case "image": {
        const url = (props.url as string) || "";
        const caption = (props.caption as string) || "";
        lines.push(`${indent}![${caption}](${url})`);
        lines.push("");
        break;
      }
      case "table": {
        const tableContent = b.content as Record<string, unknown>;
        if (tableContent && typeof tableContent === "object" && Array.isArray((tableContent as any).rows)) {
          const rows = (tableContent as any).rows as unknown[][];
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i] as unknown[];
            const cells = row.map((cell: unknown) => {
              if (Array.isArray(cell)) return inlineContentToMarkdown(cell);
              return "";
            });
            lines.push(`| ${cells.join(" | ")} |`);
            if (i === 0) {
              lines.push(`| ${cells.map(() => "---").join(" | ")} |`);
            }
          }
          lines.push("");
        }
        break;
      }
      case "note": {
        lines.push(`${indent}> 📌 ${text}`);
        lines.push("");
        break;
      }
      default: {
        if (text) {
          lines.push(`${indent}${text}`);
          lines.push("");
        }
        break;
      }
    }

    // Process nested children with increased indent
    for (const child of children) {
      processBlock(child, indent + "  ");
    }
  }

  for (const block of blocks) {
    processBlock(block);
  }

  // Clean up trailing empty lines
  let result = lines.join("\n");
  result = result.replace(/\n{3,}/g, "\n\n").trim();
  return result + "\n";
}

// Sanitize filename: replace invalid characters
function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"\/\\|?*]/g, "_").replace(/\s+/g, " ").trim() || "Untitled";
}

// Read a document's blocks and convert to markdown with title
function readDocAsMarkdown(docId: string, title: string): string {
  const docFile = path.join(DOCS_DIR, `${docId}.json`);
  try {
    const docData = JSON.parse(fs.readFileSync(docFile, "utf-8"));
    return `# ${title}\n\n${blocksToMarkdown(docData.blocks || [])}`;
  } catch {
    return `# ${title}\n`;
  }
}

// Export all documents with hierarchical directory structure
function exportAllDocs(): void {
  if (fs.existsSync(EXPORT_DIR)) {
    fs.rmSync(EXPORT_DIR, { recursive: true });
  }
  fs.mkdirSync(EXPORT_DIR, { recursive: true });

  const docs = readIndex().docs;
  const allMetas = Object.values(docs).sort((a, b) => a.order - b.order);
  const childrenOf = (pid: string | null) => allMetas.filter((m) => m.parentId === pid);

  function exportNode(meta: DocMeta, dirPath: string): void {
    const children = childrenOf(meta.id);
    const safeName = sanitizeFilename(meta.title);
    const targetDir = children.length > 0 ? path.join(dirPath, safeName) : dirPath;
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(
      path.join(targetDir, `${safeName}.md`),
      readDocAsMarkdown(meta.id, meta.title),
      "utf-8",
    );
    for (const child of children) {
      exportNode(child, targetDir);
    }
  }

  for (const root of childrenOf(null)) {
    exportNode(root, EXPORT_DIR);
  }
}

function extractTextFromBlocks(blocks: unknown[]): string {
  const texts: string[] = [];
  const queue: unknown[] = [...blocks];
  while (queue.length > 0) {
    const item = queue.shift();
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj.text === "string") texts.push(obj.text);
    if (Array.isArray(obj.content)) queue.push(...obj.content);
    if (Array.isArray(obj.children)) queue.push(...obj.children);
  }
  return texts.join(" ");
}

// In-memory edit lock: docId -> current lock sequence number
const editLockSeqs = new Map<string, number>();

type ApiHandler = (
  req: Connect.IncomingMessage,
  res: ServerResponse,
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
    // Acquire edit lock: always succeeds, returns incremented lockSeq
    method: "POST",
    pattern: /^\/api\/docs\/([^/]+)\/lock$/,
    handler: async (_req, res, params) => {
      const docId = params!.id;
      const prev = editLockSeqs.get(docId) || 0;
      const newSeq = prev + 1;
      editLockSeqs.set(docId, newSeq);
      res.end(JSON.stringify({ lockSeq: newSeq }));
    },
  },
  {
    // Check edit lock: returns current lockSeq for the document
    method: "GET",
    pattern: /^\/api\/docs\/([^/]+)\/lock$/,
    handler: async (_req, res, params) => {
      const docId = params!.id;
      const seq = editLockSeqs.get(docId) || 0;
      res.end(JSON.stringify({ lockSeq: seq }));
    },
  },
  {
    // Export all documents as a zip download (password protected)
    method: "POST",
    pattern: /^\/api\/export\/all$/,
    handler: async (req, res) => {
      const { password } = await parseBody<{ password?: string }>(req);
      if (!verifyPassword(password)) {
        res.statusCode = 403;
        res.end(JSON.stringify({ error: "Invalid password" }));
        return;
      }

      exportAllDocs();

      const archive = archiver("zip", { zlib: { level: 9 } });
      const zipName = `wiki-export-${new Date().toISOString().slice(0, 10)}.zip`;

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

      archive.pipe(res);
      archive.directory(EXPORT_DIR, false);
      await archive.finalize();
    },
  },
  {
    // Export a single document as markdown download
    method: "POST",
    pattern: /^\/api\/export\/([^/]+)$/,
    handler: async (_req, res, params) => {
      const docs = readIndex().docs;
      const meta = docs[params!.id];
      if (!meta) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "Document not found" }));
        return;
      }

      const markdown = readDocAsMarkdown(params!.id, meta.title);
      const filename = `${sanitizeFilename(meta.title)}.md`;

      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
      res.end(markdown);
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/docs\/search/,
    handler: async (req, res) => {
      const query = new URL(req.url || "", "http://localhost").searchParams.get("q")?.toLowerCase() || "";
      if (!query) { res.end("[]"); return; }

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
