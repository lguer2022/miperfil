import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

const DATA_DIR = path.join(__dirname, 'data');
const ARTICLES_FILE = path.join(DATA_DIR, 'articles.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const BOOKS_FILE = path.join(DATA_DIR, 'books.json');

// Ensure data folder and file exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// API: Authentication
app.post('/api/auth', (req, res) => {
  const { username, password } = req.body || {};
  if (username === 'admin3595' && password === '3595*3595') {
    return res.json({
      success: true,
      token: 'auth_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
      user: { username: 'admin3595', role: 'admin' }
    });
  }
  return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
});

// API: Get books and chapters
app.get('/api/books', (req, res) => {
  try {
    if (fs.existsSync(BOOKS_FILE)) {
      const content = fs.readFileSync(BOOKS_FILE, 'utf-8');
      return res.json(JSON.parse(content));
    }
    return res.json([]);
  } catch (err) {
    console.error('Error reading books:', err);
    return res.status(500).json({ error: 'Error al leer libros' });
  }
});

// API: Save books and chapters
app.post('/api/books', (req, res) => {
  try {
    const books = req.body;
    if (!Array.isArray(books)) {
      return res.status(400).json({ error: 'Formato inválido: se esperaba un array' });
    }
    fs.writeFileSync(BOOKS_FILE, JSON.stringify(books, null, 2), 'utf-8');
    return res.json({ success: true, count: books.length });
  } catch (err) {
    console.error('Error writing books:', err);
    return res.status(500).json({ error: 'Error al guardar libros' });
  }
});

// API: Save custom book cover image
app.post('/api/book-cover', (req, res) => {
  try {
    const { bookId, imageBase64 } = req.body || {};
    if (!bookId || !imageBase64) {
      return res.status(400).json({ error: 'Faltan parámetros' });
    }
    const filename = `cover_${bookId}_${Date.now()}.jpg`;
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    fs.writeFileSync(path.join(__dirname, 'assets', filename), buffer);
    return res.json({ success: true, coverPath: `assets/${filename}` });
  } catch (err) {
    console.error('Error saving book cover:', err);
    return res.status(500).json({ error: 'Error al guardar la portada' });
  }
});

// API: Get projects
app.get('/api/projects', (req, res) => {
  try {
    if (fs.existsSync(PROJECTS_FILE)) {
      const content = fs.readFileSync(PROJECTS_FILE, 'utf-8');
      return res.json(JSON.parse(content));
    }
    return res.json([]);
  } catch (err) {
    console.error('Error reading projects:', err);
    return res.status(500).json({ error: 'Error al leer proyectos' });
  }
});

// API: Save projects
app.post('/api/projects', (req, res) => {
  try {
    const projects = req.body;
    if (!Array.isArray(projects)) {
      return res.status(400).json({ error: 'Formato inválido: se esperaba un array' });
    }
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), 'utf-8');
    return res.json({ success: true, count: projects.length });
  } catch (err) {
    console.error('Error writing projects:', err);
    return res.status(500).json({ error: 'Error al guardar proyectos' });
  }
});

// API: Get articles
app.get('/api/articles', (req, res) => {
  try {
    if (fs.existsSync(ARTICLES_FILE)) {
      const content = fs.readFileSync(ARTICLES_FILE, 'utf-8');
      return res.json(JSON.parse(content));
    }
    return res.json([]);
  } catch (err) {
    console.error('Error reading articles:', err);
    return res.status(500).json({ error: 'Error al leer publicaciones' });
  }
});

// API: Save articles
app.post('/api/articles', (req, res) => {
  try {
    const articles = req.body;
    if (!Array.isArray(articles)) {
      return res.status(400).json({ error: 'Formato inválido: se esperaba un array' });
    }
    fs.writeFileSync(ARTICLES_FILE, JSON.stringify(articles, null, 2), 'utf-8');
    return res.json({ success: true, count: articles.length });
  } catch (err) {
    console.error('Error writing articles:', err);
    return res.status(500).json({ error: 'Error al guardar publicaciones' });
  }
});

// API: Save avatar image
app.post('/api/avatar', (req, res) => {
  try {
    const { imageBase64 } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: 'Falta la imagen' });
    }
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    fs.writeFileSync(path.join(__dirname, 'assets', 'foto_leandro.jpg'), buffer);
    return res.json({ success: true, message: 'Foto actualizada correctamente' });
  } catch (err) {
    console.error('Error saving avatar:', err);
    return res.status(500).json({ error: 'Error al guardar la foto' });
  }
});

// Fallback to index.html for SPA routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
