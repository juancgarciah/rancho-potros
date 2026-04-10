require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ── CONEXIÓN MONGODB ATLAS ──
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✓ Conectado a MongoDB Atlas'))
  .catch(err => { console.error('✗ Error MongoDB:', err.message); process.exit(1); });

// ── MODELOS ──
const entrySchema = new mongoose.Schema({
  id:     { type: String, required: true },
  date:   { type: String },
  stage:  { type: String },
  note:   { type: String, default: '' },
  weight: { type: String, default: '' }
}, { _id: false });

const foalSchema = new mongoose.Schema({
  id:      { type: String, required: true, unique: true },
  name:    { type: String, required: true },
  dob:     { type: String },
  sex:     { type: String, default: 'macho' },
  breed:   { type: String, default: '' },
  mother:  { type: String, default: '' },
  father:  { type: String, default: '' },
  entries: { type: [entrySchema], default: [] }
}, { timestamps: true });

const Foal = mongoose.model('Foal', foalSchema);

// ── RUTAS ──

// GET /api/foals — devuelve todos los potrillos
app.get('/api/foals', async (req, res) => {
  try {
    const foals = await Foal.find({}, { __v: 0, _id: 0, createdAt: 0, updatedAt: 0 }).lean();
    res.json(foals);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/foals — crear un potrillo
app.post('/api/foals', async (req, res) => {
  try {
    const foal = await Foal.create(req.body);
    const plain = foal.toObject();
    delete plain._id; delete plain.__v;
    res.status(201).json(plain);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PUT /api/foals/:id — actualizar un potrillo
app.put('/api/foals/:id', async (req, res) => {
  try {
    const updated = await Foal.findOneAndUpdate(
      { id: req.params.id },
      { $set: req.body },
      { new: true, upsert: true, projection: { __v: 0, _id: 0 } }
    ).lean();
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /api/foals/:id — eliminar un potrillo
app.delete('/api/foals/:id', async (req, res) => {
  try {
    await Foal.deleteOne({ id: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/foals/:id/entries — reemplazar entradas de un potrillo
app.put('/api/foals/:id/entries', async (req, res) => {
  try {
    const updated = await Foal.findOneAndUpdate(
      { id: req.params.id },
      { $set: { entries: req.body } },
      { new: true, projection: { __v: 0, _id: 0 } }
    ).lean();
    if (!updated) return res.status(404).json({ error: 'Potrillo no encontrado' });
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/sync — sincronización completa (cliente envía todo su estado)
app.post('/api/sync', async (req, res) => {
  try {
    const foals = req.body; // array completo
    if (!Array.isArray(foals)) return res.status(400).json({ error: 'Se esperaba un array' });

    // Upsert cada potrillo
    const ops = foals.map(f => ({
      updateOne: {
        filter: { id: f.id },
        update: { $set: f },
        upsert: true
      }
    }));
    if (ops.length) await Foal.bulkWrite(ops);

    // Eliminar los que ya no existen en el cliente
    const clientIds = foals.map(f => f.id);
    await Foal.deleteMany({ id: { $nin: clientIds } });

    res.json({ ok: true, synced: foals.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── ARRANQUE ──
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Servidor escuchando en http://localhost:${PORT}`));
