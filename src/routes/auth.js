const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { auth, adminOnly } = require('../middleware/auth');

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y password requeridos' });
    const { rows } = await query('SELECT * FROM usuarios WHERE email=$1 AND activo=true', [email.toLowerCase().trim()]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Credenciales incorrectas' });
    const token = jwt.sign({ id: user.id, rol: user.rol }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/me', auth, (req, res) => res.json({ user: req.user }));

router.get('/usuarios', auth, adminOnly, async (req, res) => {
  const { rows } = await query('SELECT id,nombre,email,rol,activo,created_at FROM usuarios ORDER BY created_at');
  res.json(rows);
});

router.post('/usuarios', auth, adminOnly, async (req, res) => {
  try {
    const { nombre, email, password, rol } = req.body;
    const hash = await bcrypt.hash(password || 'cambiar123', 12);
    const { rows: [u] } = await query(
      'INSERT INTO usuarios (nombre,email,password,rol) VALUES ($1,$2,$3,$4) RETURNING id,nombre,email,rol',
      [nombre, email.toLowerCase(), hash, rol || 'vendedor']
    );
    res.status(201).json(u);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email ya registrado' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/usuarios/:id', auth, adminOnly, async (req, res) => {
  try {
    const { nombre, rol, activo } = req.body;
    const { rows: [u] } = await query(
      'UPDATE usuarios SET nombre=$1,rol=$2,activo=$3 WHERE id=$4 RETURNING id,nombre,email,rol,activo',
      [nombre, rol, activo, req.params.id]
    );
    if (!u) return res.status(404).json({ error: 'No encontrado' });
    res.json(u);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/password', auth, async (req, res) => {
  try {
    const { actual, nueva } = req.body;
    if (!actual || !nueva || nueva.length < 6) return res.status(400).json({ error: 'Password nueva minimo 6 caracteres' });
    const { rows } = await query('SELECT password FROM usuarios WHERE id=$1', [req.user.id]);
    const ok = await bcrypt.compare(actual, rows[0].password);
    if (!ok) return res.status(401).json({ error: 'Password actual incorrecta' });
    const hash = await bcrypt.hash(nueva, 12);
    await query('UPDATE usuarios SET password=$1 WHERE id=$2', [hash, req.user.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
