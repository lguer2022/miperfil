// Servidor local solo para desarrollo (npm start → http://localhost:3000).
// En producción el sitio es 100% estático (Netlify) y los datos viven en Supabase.
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(PORT, () => console.log(`Sitio local en http://localhost:${PORT}`));
