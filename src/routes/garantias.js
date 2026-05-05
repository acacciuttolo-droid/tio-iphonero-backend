const router = require('express').Router();
const { query, withTransaction } = require('../db');
const { auth, noReadOnly } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT g.*,
             e.modelo,e.storage,e.grade,e.imei,e.costo_gs,
             cl.nombre AS cliente_nombre,cl.ci_ruc,cl.tel AS cliente_tel,
             prov.nombre AS proveedor_nombre,prov.dias_garantia AS prov_dias,
             ec.modelo AS cambio_modelo,ec.storage AS cambio_storage,
             CASE WHEN g.fecha_envio_proveedor IS NOT NULL
                  THEN CURRENT_DATE - g.fecha_envio_proveedor ELSE NULL END AS dias_en_proveedor
      FROM garantias g
      JOIN equipos e ON g.equipo_id=e.id
      LEFT JOIN clientes cl ON g.cliente_id=cl.id
      LEFT JOIN proveedores prov ON g.proveedor_id=prov.id
      LEFT JOIN equipos ec ON g.equipo_cambio_id=ec.id
      WHERE g.estado NOT IN ('resuelto','entregado_cliente')
      ORDER BY g.created_at DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, noReadOnly, async (req, res) => {
  try {
    const result = await withTransaction(async (client) => {
      const { equipo_id, cliente_id, descripcion_problema, proveedor_id, equipo_cambio_id, estado = 'ingresado' } = req.body;
      const { rows: [g] } = await client.query(
        'INSERT INTO garantias (equipo_id,cliente_id,descripcion_problema,proveedor_id,equipo_cambio_id,estado,usuario_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [equipo_id, cliente_id || null, descripcion_problema, proveedor_id || null, equipo_cambio_id || null, estado, req.user.id]
      );
      await client.query("UPDATE equipos SET status='garantia_local' WHERE id=$1", [equipo_id]);
      if (equipo_cambio_id) {
        await client.query("UPDATE equipos SET status='cambio_asignado' WHERE id=$1", [equipo_cambio_id]);
      }
      await client.query(
        'INSERT INTO historial_equipos (equipo_id,tipo,descripcion,usuario_id) VALUES ($1,$2,$3,$4)',
        [equipo_id, 'garantia', `Garantia: ${descripcion_problema}`, req.user.id]
      );
      return g;
    });
    res.status(201).json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/:id/estado', auth, noReadOnly, async (req, res) => {
  try {
    const result = await withTransaction(async (client) => {
      const { estado, notas_proveedor, solucion, fecha_envio_proveedor } = req.body;
      const { rows: [g] } = await client.query('SELECT * FROM garantias WHERE id=$1', [req.params.id]);
      if (!g) throw new Error('Garantia no encontrada');
      const resuelto = estado === 'resuelto' || estado === 'entregado_cliente';
      await client.query(
        'UPDATE garantias SET estado=$1,notas_proveedor=COALESCE($2,notas_proveedor),solucion=COALESCE($3,solucion),fecha_envio_proveedor=COALESCE($4,fecha_envio_proveedor) WHERE id=$5',
        [estado, notas_proveedor || null, solucion || null, fecha_envio_proveedor || null, req.params.id]
      );
      const statusMap = {
        enviado_proveedor: 'garantia_proveedor',
        en_proveedor: 'garantia_proveedor',
        recibido: 'reparacion',
        resuelto: 'stock',
        entregado_cliente: 'stock'
      };
      if (statusMap[estado]) {
        await client.query('UPDATE equipos SET status=$1 WHERE id=$2', [statusMap[estado], g.equipo_id]);
      }
      if (resuelto && g.equipo_cambio_id) {
        await client.query("UPDATE equipos SET status='vendido' WHERE id=$1", [g.equipo_cambio_id]);
      }
      return { ok: true };
    });
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

module.exports = router;
