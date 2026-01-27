import cors from 'cors';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 37802;

// Data directory
const DATA_DIR = path.join(__dirname, 'wiki-data');
const DOCS_DIR = path.join(DATA_DIR, 'docs');
const INDEX_FILE = path.join(DATA_DIR, 'index.json');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DOCS_DIR)) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
}

// Initialize index file if not exists
if (!fs.existsSync(INDEX_FILE)) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify({ docs: {} }, null, 2));
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Generate short ID (8-12 characters)
function generateShortId() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const length = 8 + Math.floor(Math.random() * 5); // 8-12 characters
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Read index
function readIndex() {
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
  } catch {
    return { docs: {} };
  }
}

// Write index
function writeIndex(index) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
}

// Get all document metas
app.get('/api/docs', (req, res) => {
  try {
    const index = readIndex();
    const metas = Object.values(index.docs);
    res.json(metas);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get documents' });
  }
});

// Get single document meta
app.get('/api/docs/:id/meta', (req, res) => {
  try {
    const index = readIndex();
    const meta = index.docs[req.params.id];
    if (!meta) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(meta);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get document meta' });
  }
});

// Get document content
app.get('/api/docs/:id/content', (req, res) => {
  try {
    const docFile = path.join(DOCS_DIR, `${req.params.id}.json`);
    if (!fs.existsSync(docFile)) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const content = JSON.parse(fs.readFileSync(docFile, 'utf-8'));
    res.json(content);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get document content' });
  }
});

// Create new document
app.post('/api/docs', (req, res) => {
  try {
    const { title, parentId } = req.body;
    const index = readIndex();
    
    // Generate unique short ID
    let id;
    do {
      id = generateShortId();
    } while (index.docs[id]);
    
    // Calculate order
    const siblings = Object.values(index.docs).filter(d => d.parentId === (parentId || null));
    const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(s => s.order)) : -1;
    
    const meta = {
      id,
      title,
      parentId: parentId || null,
      order: maxOrder + 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    const content = { id, blocks: [] };
    
    // Save meta to index
    index.docs[id] = meta;
    writeIndex(index);
    
    // Save content to file
    const docFile = path.join(DOCS_DIR, `${id}.json`);
    fs.writeFileSync(docFile, JSON.stringify(content, null, 2));
    
    res.json(meta);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

// Update document meta
app.put('/api/docs/:id/meta', (req, res) => {
  try {
    const index = readIndex();
    const meta = index.docs[req.params.id];
    if (!meta) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    Object.assign(meta, req.body, { updatedAt: Date.now() });
    index.docs[req.params.id] = meta;
    writeIndex(index);
    
    res.json(meta);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update document meta' });
  }
});

// Update document content
app.put('/api/docs/:id/content', (req, res) => {
  try {
    const { blocks } = req.body;
    const docFile = path.join(DOCS_DIR, `${req.params.id}.json`);
    
    const content = { id: req.params.id, blocks };
    fs.writeFileSync(docFile, JSON.stringify(content, null, 2));
    
    // Update meta timestamp
    const index = readIndex();
    if (index.docs[req.params.id]) {
      index.docs[req.params.id].updatedAt = Date.now();
      writeIndex(index);
    }
    
    res.json(content);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update document content' });
  }
});

// Delete document
app.delete('/api/docs/:id', (req, res) => {
  try {
    const index = readIndex();
    const id = req.params.id;
    
    // Recursively delete children
    const deleteRecursive = (docId) => {
      const children = Object.values(index.docs).filter(d => d.parentId === docId);
      children.forEach(child => deleteRecursive(child.id));
      
      delete index.docs[docId];
      const docFile = path.join(DOCS_DIR, `${docId}.json`);
      if (fs.existsSync(docFile)) {
        fs.unlinkSync(docFile);
      }
    };
    
    deleteRecursive(id);
    writeIndex(index);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Update tree order (batch)
app.put('/api/docs/tree/order', (req, res) => {
  try {
    const { order } = req.body;
    const index = readIndex();
    
    order.forEach(({ id, parentId, order: orderNum }) => {
      if (index.docs[id]) {
        index.docs[id].parentId = parentId;
        index.docs[id].order = orderNum;
        index.docs[id].updatedAt = Date.now();
      }
    });
    
    writeIndex(index);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update tree order' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Wiki API server running at http://0.0.0.0:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
