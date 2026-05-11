const router = require('express').Router();
const { query } = require('../db');
const { auth, noReadOnly } = require('../middleware/auth');

// Crear tabla si no existe
const initTable = async () => {
  await query(`CREATE TABLE IF NOT EXISTS catalogo (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    categoria TEXT,
    storage TEXT,
    precio_gs BIGINT DEFAULT 0,
    precio_usd NUMERIC(10,2) DEFAULT 0,
    condicion TEXT DEFAULT 'Americano',
    wa TEXT DEFAULT '595976500020',
    foto TEXT,
    descripcion TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
};
initTable().catch(console.error);

// GET todos (público - sin auth para que catalogo.html pueda leer)
router.get('/', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM catalogo ORDER BY created_at ASC');
    res.json(rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST nuevo producto
router.post('/', auth, noReadOnly, async (req, res) => {
  try {
    const { id, nombre, categoria, storage, precio_gs, precio_usd, condicion, wa, foto, descripcion, activo } = req.body;
    const { rows } = await query(
      `INSERT INTO catalogo (id,nombre,categoria,storage,precio_gs,precio_usd,condicion,wa,foto,descripcion,activo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [id, nombre, categoria, storage, precio_gs||0, precio_usd||0, condicion||'Americano', wa||'595976500020', foto||'', descripcion||'', activo!==false]
    );
    res.json(rows[0]);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// PUT editar
router.put('/:id', auth, noReadOnly, async (req, res) => {
  try {
    const { nombre, categoria, storage, precio_gs, precio_usd, condicion, wa, foto, descripcion, activo } = req.body;
    const { rows } = await query(
      `UPDATE catalogo SET nombre=$1,categoria=$2,storage=$3,precio_gs=$4,precio_usd=$5,
       condicion=$6,wa=$7,foto=$8,descripcion=$9,activo=$10,updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [nombre, categoria, storage, precio_gs||0, precio_usd||0, condicion, wa, foto||'', descripcion||'', activo!==false, req.params.id]
    );
    res.json(rows[0]);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// DELETE
router.delete('/:id', auth, noReadOnly, async (req, res) => {
  try {
    await query('DELETE FROM catalogo WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST registro de click (público)
router.post('/click', async (req, res) => {
  try {
    const { prod_id } = req.body;
    await query(
      `INSERT INTO catalogo_clicks (prod_id, fecha) VALUES ($1, NOW())
       ON CONFLICT DO NOTHING`,
      [prod_id]
    );
    res.json({ ok: true });
  } catch(err) { res.json({ ok: false }); }
});

// GET analytics de clicks
router.get('/clicks', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT prod_id, COUNT(*) as total,
       COUNT(*) FILTER (WHERE fecha > NOW() - INTERVAL '1 day') as hoy,
       COUNT(*) FILTER (WHERE fecha > NOW() - INTERVAL '7 days') as semana,
       COUNT(*) FILTER (WHERE fecha > NOW() - INTERVAL '30 days') as mes
       FROM catalogo_clicks GROUP BY prod_id ORDER BY total DESC`
    );
    res.json(rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

// Init clicks table
const initClicksTable = async () => {
  await query(`CREATE TABLE IF NOT EXISTS catalogo_clicks (
    id SERIAL PRIMARY KEY,
    prod_id TEXT,
    fecha TIMESTAMPTZ DEFAULT NOW()
  )`);
};
initClicksTable().catch(console.error);
