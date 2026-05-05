const jwt = require('jsonwebtoken');
const { query } = require('../db');

const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token requerido' });
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await query('SELECT id,nombre,email,rol,activo FROM usuarios WHERE id=$1', [decoded.id]);
    if (!rows[0] || !rows[0].activo) return res.status(401).json({ error: 'Usuario inactivo' });
    req.user = rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalido' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.rol)) return res.status(403).json({ error: 'Sin permisos' });
  next();
};

const adminOnly = requireRole('admin');
const noReadOnly = requireRole('admin', 'vendedor', 'tecnico');

module.exports = { auth, requireRole, adminOnly, noReadOnly };
