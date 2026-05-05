const router = require('express').Router();
const { query, withTransaction } = require('../db');
const { auth, noReadOnly } = require('../middleware/auth');

router.post('/', auth, noReadOnly, async (req, res) => {
  try {
    const result = await withTransaction(async (client) => {
      const {
        equipo_id, cliente, precio_lista_gs, descuento_pct = 0, monto_final_gs,
        forma_pago = 'Efectivo', aplico_comision = false,
        con_garantia = true, dias_garantia = 180, fecha_venta, notas
      } = req.body;

      const { rows: [eq] } = await client.query(
        "SELECT * FROM equipos WHERE id=$1 AND status='stock'", [equipo_id]
      );
      if (!eq) throw new Error('Equipo no disponible para venta');

      let cliente_id = null;
      if (cliente?.nombre) {
        const { rows: ex } = await client.query(
          'SELECT id FROM clientes WHERE ci_ruc=$1 AND ci_ruc IS NOT NULL LIMIT 1',
          [cliente.ci_ruc || null]
        );
        if (ex[0]) {
          cliente_id = ex[0].id;
          await client.query('UPDATE clientes SET nombre=$1,tel=$2,email=$3 WHERE id=$4',
            [cliente.nombre, cliente.tel, cliente.email, cliente_id]);
        } else {
          const { rows: [nc] } = await client.query(
            'INSERT INTO clientes (nombre,ci_ruc,tel,email) VALUES ($1,$2,$3,$4) RETURNING id',
            [cliente.nombre, cliente.ci_ruc || null, cliente.tel || null, cliente.email || null]
          );
          cliente_id = nc.id;
        }
      }

      const fv = fecha_venta || new Date().toISOString().slice(0, 10);
      const fecha_gar_vence = con_garantia
        ? new Date(new Date(fv).getTime() + dias_garantia * 86400000).toISOString().slice(0, 10)
        : null;

      const { rows: [v] } = await client.query(
        `INSERT INTO ventas
          (equipo_id,cliente_id,precio_lista_gs,descuento_pct,monto_final_gs,costo_gs,
           forma_pago,aplico_comision,con_garantia,dias_garantia,fecha_gar_vence,fecha_venta,notas,usuario_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [equipo_id, cliente_id, precio_lista_gs, descuento_pct, monto_final_gs, eq.costo_gs,
         forma_pago, aplico_comision, con_garantia, dias_garantia, fecha_gar_vence, fv, notas, req.user.id]
      );

      await client.query(
        "UPDATE equipos SET status='vendido', fecha_gar_local_inicio=$1 WHERE id=$2", [fv, equipo_id]
      );
      await client.query(
        'INSERT INTO historial_equipos (equipo_id,tipo,descripcion,usuario_id) VALUES ($1,$2,$3,$4)',
        [equipo_id, 'venta', `Vendido - ${forma_pago} - Gs.${monto_final_gs}`, req.user.id]
      );
      return { venta: v, cliente_id };
    });
    res.status(201).json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/', auth, async (req, res) => {
  try {
    const { fecha_desde, fecha_hasta, limit = 50, offset = 0 } = req.query;
    let where = ['1=1']; const params = []; let p = 1;
    if (fecha_desde) { where.push(`v.fecha_venta >= $${p++}`); params.push(fecha_desde); }
    if (fecha_hasta) { where.push(`v.fecha_venta <= $${p++}`); params.push(fecha_hasta); }
    params.push(parseInt(limit), parseInt(offset));
    const { rows } = await query(
      `SELECT v.*,e.modelo,e.storage,e.grade,e.imei,
              c.nombre AS cliente_nombre,c.ci_ruc,c.tel AS cliente_tel,
              u.nombre AS vendedor
       FROM ventas v
       JOIN equipos e ON v.equipo_id=e.id
       LEFT JOIN clientes c ON v.cliente_id=c.id
       LEFT JOIN usuarios u ON v.usuario_id=u.id
       WHERE ${where.join(' AND ')}
       ORDER BY v.fecha_venta DESC LIMIT $${p++} OFFSET $${p++}`,
      params
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
