const router = require('express').Router();
const { query, withTransaction } = require('../db');
const { auth, noReadOnly } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { status, categoria, q, limit = 100, offset = 0 } = req.query;
    let where = ['1=1']; const params = []; let p = 1;
    if (status) { where.push(`e.status = $${p++}`); params.push(status); }
    if (categoria) { where.push(`e.categoria = $${p++}`); params.push(categoria); }
    if (q) {
      where.push(`(e.modelo ILIKE $${p} OR e.imei ILIKE $${p} OR e.color ILIKE $${p} OR e.observaciones ILIKE $${p})`);
      params.push(`%${q}%`); p++;
    }
    params.push(parseInt(limit), parseInt(offset));
    const { rows } = await query(
      `SELECT e.*,prov.nombre AS proveedor_nombre,u.nombre AS usuario_nombre
       FROM equipos e
       LEFT JOIN proveedores prov ON e.proveedor_id=prov.id
       LEFT JOIN usuarios u ON e.usuario_id=u.id
       WHERE ${where.join(' AND ')}
       ORDER BY e.created_at DESC
       LIMIT $${p++} OFFSET $${p++}`,
      params
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const { rows: [e] } = await query(
      'SELECT e.*,prov.nombre AS proveedor_nombre FROM equipos e LEFT JOIN proveedores prov ON e.proveedor_id=prov.id WHERE e.id=$1',
      [req.params.id]
    );
    if (!e) return res.status(404).json({ error: 'No encontrado' });
    const { rows: historial } = await query(
      'SELECT h.*,u.nombre AS usuario_nombre FROM historial_equipos h LEFT JOIN usuarios u ON h.usuario_id=u.id WHERE h.equipo_id=$1 ORDER BY h.created_at ASC',
      [req.params.id]
    );
    const { rows: garantias } = await query(
      'SELECT g.*,cl.nombre AS cliente_nombre FROM garantias g LEFT JOIN clientes cl ON g.cliente_id=cl.id WHERE g.equipo_id=$1 ORDER BY g.created_at DESC',
      [req.params.id]
    );
    res.json({ ...e, historial, garantias });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, noReadOnly, async (req, res) => {
  try {
    const {
      modelo, categoria = 'iPhone', storage = '128GB', grade = 'A', origin = 'Americano',
      color, imei, bateria, proveedor_id, costo_gs = 0, costo_usd = 0,
      precio_venta_gs = 0, precio_venta_usd = 0, observaciones, fecha_ingreso,
      dias_gar_local = 180, dias_gar_proveedor = 30
    } = req.body;
    const { rows: [e] } = await query(
      `INSERT INTO equipos
        (modelo,categoria,storage,grade,origin,color,imei,bateria,proveedor_id,
         costo_gs,costo_usd,precio_venta_gs,precio_venta_usd,observaciones,
         fecha_ingreso,dias_gar_local,dias_gar_proveedor,usuario_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [modelo, categoria, storage, grade, origin, color || null, imei || null, bateria || null,
       proveedor_id || null, costo_gs, costo_usd, precio_venta_gs, precio_venta_usd,
       observaciones || null, fecha_ingreso || new Date().toISOString().slice(0, 10),
       dias_gar_local, dias_gar_proveedor, req.user.id]
    );
    await query(
      'INSERT INTO historial_equipos (equipo_id,tipo,descripcion,usuario_id) VALUES ($1,$2,$3,$4)',
      [e.id, 'ingreso', `Ingreso por ${req.user.nombre}`, req.user.id]
    );
    res.status(201).json(e);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', auth, noReadOnly, async (req, res) => {
  try {
    const fields = ['modelo','categoria','storage','grade','origin','color','imei','bateria',
                    'proveedor_id','costo_gs','costo_usd','precio_venta_gs','precio_venta_usd',
                    'observaciones','status','dias_gar_local','dias_gar_proveedor',
                    'fecha_gar_local_inicio','fecha_gar_prov_inicio'];
    const updates = []; const values = []; let p = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f}=$${p++}`); values.push(req.body[f] || null); }
    }
    if (!updates.length) return res.status(400).json({ error: 'Nada que actualizar' });
    values.push(req.params.id);
    const { rows: [e] } = await query(
      `UPDATE equipos SET ${updates.join(',')} WHERE id=$${p} RETURNING *`, values
    );
    if (!e) return res.status(404).json({ error: 'No encontrado' });
    await query(
      'INSERT INTO historial_equipos (equipo_id,tipo,descripcion,usuario_id) VALUES ($1,$2,$3,$4)',
      [req.params.id, 'edicion', `Editado por ${req.user.nombre}`, req.user.id]
    );
    res.json(e);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
