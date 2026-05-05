const { query } = require('../db');
const { auth, noReadOnly } = require('../middleware/auth');

const reportes = require('express').Router();
reportes.get('/resumen', auth, async (req, res) => {
  try {
    const { fecha_desde = new Date().toISOString().slice(0,10), fecha_hasta = new Date().toISOString().slice(0,10) } = req.query;
    const [v, g, s] = await Promise.all([
      query(`SELECT COUNT(*) AS cantidad, COALESCE(SUM(monto_final_gs),0) AS total, COALESCE(SUM(ganancia_gs),0) AS ganancia,
             COALESCE(SUM(CASE WHEN forma_pago='Efectivo' THEN monto_final_gs ELSE 0 END),0) AS efectivo,
             COALESCE(SUM(CASE WHEN forma_pago='Tarjeta' THEN monto_final_gs ELSE 0 END),0) AS tarjeta,
             COALESCE(SUM(CASE WHEN forma_pago='Transferencia' THEN monto_final_gs ELSE 0 END),0) AS transferencia,
             COALESCE(SUM(CASE WHEN forma_pago='USDT' THEN monto_final_gs ELSE 0 END),0) AS usdt
             FROM ventas WHERE fecha_venta BETWEEN $1 AND $2`, [fecha_desde, fecha_hasta]),
      query(`SELECT COALESCE(SUM(CASE WHEN tipo='gasto' THEN monto_gs ELSE 0 END),0) AS gastos,
             COALESCE(SUM(CASE WHEN tipo='ingreso' THEN monto_gs ELSE 0 END),0) AS ingresos
             FROM movimientos WHERE fecha BETWEEN $1 AND $2`, [fecha_desde, fecha_hasta]),
      query(`SELECT COUNT(*) FILTER (WHERE status='stock') AS en_stock,
             COUNT(*) FILTER (WHERE categoria='iPhone' AND status='stock') AS iphones,
             COALESCE(SUM(costo_gs) FILTER (WHERE status='stock'),0) AS capital FROM equipos`)
    ]);
    res.json({
      periodo: { desde: fecha_desde, hasta: fecha_hasta },
      ventas: { cantidad: parseInt(v.rows[0].cantidad), total: parseInt(v.rows[0].total), ganancia: parseInt(v.rows[0].ganancia),
                por_forma_pago: { efectivo: parseInt(v.rows[0].efectivo), tarjeta: parseInt(v.rows[0].tarjeta),
                                  transferencia: parseInt(v.rows[0].transferencia), usdt: parseInt(v.rows[0].usdt) } },
      movimientos: { gastos: parseInt(g.rows[0].gastos), ingresos: parseInt(g.rows[0].ingresos) },
      stock: { en_stock: parseInt(s.rows[0].en_stock), iphones: parseInt(s.rows[0].iphones), capital: parseInt(s.rows[0].capital) }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const proveedores = require('express').Router();
proveedores.get('/', auth, async (req, res) => {
  const { rows } = await query('SELECT * FROM proveedores WHERE activo=true ORDER BY nombre');
  res.json(rows);
});
proveedores.post('/', auth, noReadOnly, async (req, res) => {
  try {
    const { nombre, empresa, tel, email, pais, ciudad, direccion, dias_garantia = 30, notas } = req.body;
    const { rows: [p] } = await query(
      'INSERT INTO proveedores (nombre,empresa,tel,email,pais,ciudad,direccion,dias_garantia,notas) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [nombre, empresa || null, tel || null, email || null, pais || null, ciudad || null, direccion || null, dias_garantia, notas || null]
    );
    res.status(201).json(p);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
proveedores.put('/:id', auth, noReadOnly, async (req, res) => {
  try {
    const { nombre, empresa, tel, email, pais, ciudad, direccion, dias_garantia, notas } = req.body;
    const { rows: [p] } = await query(
      'UPDATE proveedores SET nombre=$1,empresa=$2,tel=$3,email=$4,pais=$5,ciudad=$6,direccion=$7,dias_garantia=$8,notas=$9 WHERE id=$10 RETURNING *',
      [nombre, empresa || null, tel || null, email || null, pais || null, ciudad || null, direccion || null, dias_garantia || 30, notas || null, req.params.id]
    );
    res.json(p);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const clientes = require('express').Router();
clientes.get('/', auth, async (req, res) => {
  try {
    const { q } = req.query;
    let sql = 'SELECT * FROM clientes';
    const params = [];
    if (q) { sql += ' WHERE nombre ILIKE $1 OR ci_ruc ILIKE $1 OR tel ILIKE $1'; params.push(`%${q}%`); }
    sql += ' ORDER BY nombre LIMIT 50';
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const movimientos = require('express').Router();
movimientos.get('/', auth, async (req, res) => {
  try {
    const { fecha_desde, fecha_hasta, tipo } = req.query;
    let where = ['1=1']; const params = []; let p = 1;
    if (fecha_desde) { where.push(`fecha >= $${p++}`); params.push(fecha_desde); }
    if (fecha_hasta) { where.push(`fecha <= $${p++}`); params.push(fecha_hasta); }
    if (tipo) { where.push(`tipo = $${p++}`); params.push(tipo); }
    const { rows } = await query(
      `SELECT m.*,u.nombre AS usuario_nombre FROM movimientos m LEFT JOIN usuarios u ON m.usuario_id=u.id WHERE ${where.join(' AND ')} ORDER BY fecha DESC`,
      params
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
movimientos.post('/', auth, noReadOnly, async (req, res) => {
  try {
    const { tipo, categoria, descripcion, monto_gs, fecha, notas } = req.body;
    const { rows: [m] } = await query(
      'INSERT INTO movimientos (tipo,categoria,descripcion,monto_gs,fecha,notas,usuario_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [tipo, categoria, descripcion || null, monto_gs, fecha || new Date().toISOString().slice(0, 10), notas || null, req.user.id]
    );
    res.status(201).json(m);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
movimientos.delete('/:id', auth, noReadOnly, async (req, res) => {
  try {
    await query('DELETE FROM movimientos WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const cajas = require('express').Router();
cajas.get('/hoy', auth, async (req, res) => {
  try {
    const hoy = new Date().toISOString().slice(0, 10);
    const { rows: [c] } = await query('SELECT * FROM cajas WHERE fecha=$1', [hoy]);
    const { rows: movs } = await query('SELECT * FROM movimientos WHERE fecha=$1 ORDER BY created_at DESC', [hoy]);
    const { rows: ventas } = await query(
      'SELECT v.*,e.modelo,e.storage,c2.nombre AS cliente_nombre FROM ventas v JOIN equipos e ON v.equipo_id=e.id LEFT JOIN clientes c2 ON v.cliente_id=c2.id WHERE v.fecha_venta=$1 ORDER BY v.created_at DESC',
      [hoy]
    );
    res.json({ caja: c || null, movimientos: movs, ventas });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
cajas.post('/abrir', auth, noReadOnly, async (req, res) => {
  try {
    const hoy = new Date().toISOString().slice(0, 10);
    const { monto_apertura = 0 } = req.body;
    const { rows: [c] } = await query(
      "INSERT INTO cajas (fecha,monto_apertura,usuario_apertura) VALUES ($1,$2,$3) ON CONFLICT (fecha) DO UPDATE SET estado='abierta' RETURNING *",
      [hoy, monto_apertura, req.user.id]
    );
    res.json(c);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
cajas.post('/cerrar', auth, noReadOnly, async (req, res) => {
  try {
    const hoy = new Date().toISOString().slice(0, 10);
    const { rows: [t] } = await query("SELECT COALESCE(SUM(monto_final_gs),0) AS total FROM ventas WHERE fecha_venta=$1", [hoy]);
    const { rows: [m] } = await query("SELECT COALESCE(SUM(monto_gs) FILTER(WHERE tipo='gasto'),0) AS gastos, COALESCE(SUM(monto_gs) FILTER(WHERE tipo='ingreso'),0) AS ingresos FROM movimientos WHERE fecha=$1", [hoy]);
    const { rows: [c] } = await query(
      "UPDATE cajas SET estado='cerrada',monto_cierre=$1,usuario_cierre=$2 WHERE fecha=$3 RETURNING *",
      [parseInt(t.total) + parseInt(m.ingresos) - parseInt(m.gastos), req.user.id, hoy]
    );
    res.json(c);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = { reportes, proveedores, clientes, movimientos, cajas };
