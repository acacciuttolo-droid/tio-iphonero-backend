@echo off
echo Creando estructura del backend...

mkdir src\routes src\middleware src\db scripts 2>nul

:: package.json
(
echo {
echo   "name": "tio-iphonero-backend",
echo   "version": "1.0.0",
echo   "main": "src/index.js",
echo   "scripts": {
echo     "start": "node src/index.js",
echo     "dev": "nodemon src/index.js",
echo     "db:migrate": "node scripts/migrate.js",
echo     "db:seed": "node scripts/seed.js"
echo   },
echo   "dependencies": {
echo     "bcryptjs": "^2.4.3",
echo     "cors": "^2.8.5",
echo     "dotenv": "^16.3.1",
echo     "express": "^4.18.2",
echo     "jsonwebtoken": "^9.0.2",
echo     "pg": "^8.11.3",
echo     "uuid": "^9.0.0"
echo   },
echo   "devDependencies": {
echo     "nodemon": "^3.0.2"
echo   }
echo }
) > package.json

:: .env
(
echo DATABASE_URL=postgresql://usuario:password@host:5432/tioiphonero
echo JWT_SECRET=cambia_esto_por_un_string_largo_y_random
echo PORT=3001
echo NODE_ENV=production
echo FRONTEND_URL=*
) > .env.example

:: src/db/index.js
(
echo const { Pool } = require('pg'^);
echo.
echo const pool = new Pool({
echo   connectionString: process.env.DATABASE_URL,
echo   ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
echo }^);
echo.
echo pool.on('error', (err^) =^> console.error('DB error:', err^)^);
echo.
echo const query = (text, params^) =^> pool.query(text, params^);
echo.
echo const withTransaction = async (callback^) =^> {
echo   const client = await pool.connect(^);
echo   try {
echo     await client.query('BEGIN'^);
echo     const result = await callback(client^);
echo     await client.query('COMMIT'^);
echo     return result;
echo   } catch (err^) {
echo     await client.query('ROLLBACK'^);
echo     throw err;
echo   } finally {
echo     client.release(^);
echo   }
echo };
echo.
echo module.exports = { query, withTransaction, pool };
) > src\db\index.js

:: src/middleware/auth.js
(
echo const jwt = require('jsonwebtoken'^);
echo const { query } = require('../db'^);
echo.
echo const auth = async (req, res, next^) =^> {
echo   try {
echo     const header = req.headers.authorization;
echo     if (!header?.startsWith('Bearer '^)^) return res.status(401^).json({ error: 'Token requerido' }^);
echo     const token = header.split(' '^)[1];
echo     const decoded = jwt.verify(token, process.env.JWT_SECRET^);
echo     const { rows } = await query('SELECT id,nombre,email,rol,activo FROM usuarios WHERE id=$1', [decoded.id]^);
echo     if (!rows[0] ^|^| !rows[0].activo^) return res.status(401^).json({ error: 'Usuario inactivo' }^);
echo     req.user = rows[0];
echo     next(^);
echo   } catch (err^) {
echo     return res.status(401^).json({ error: 'Token invalido' }^);
echo   }
echo };
echo.
echo const requireRole = (...roles^) =^> (req, res, next^) =^> {
echo   if (!roles.includes(req.user?.rol^)^) return res.status(403^).json({ error: 'Sin permisos' }^);
echo   next(^);
echo };
echo.
echo const adminOnly = requireRole('admin'^);
echo const noReadOnly = requireRole('admin','vendedor','tecnico'^);
echo.
echo module.exports = { auth, requireRole, adminOnly, noReadOnly };
) > src\middleware\auth.js

:: src/routes/auth.js
(
echo const router = require('express'^).Router(^);
echo const bcrypt = require('bcryptjs'^);
echo const jwt = require('jsonwebtoken'^);
echo const { query } = require('../db'^);
echo const { auth, adminOnly } = require('../middleware/auth'^);
echo.
echo router.post('/login', async (req, res^) =^> {
echo   try {
echo     const { email, password } = req.body;
echo     if (!email ^|^| !password^) return res.status(400^).json({ error: 'Email y password requeridos' }^);
echo     const { rows } = await query('SELECT * FROM usuarios WHERE email=$1 AND activo=true', [email.toLowerCase(^).trim(^)]^);
echo     const user = rows[0];
echo     if (!user^) return res.status(401^).json({ error: 'Credenciales incorrectas' }^);
echo     const ok = await bcrypt.compare(password, user.password^);
echo     if (!ok^) return res.status(401^).json({ error: 'Credenciales incorrectas' }^);
echo     const token = jwt.sign({ id: user.id, rol: user.rol }, process.env.JWT_SECRET, { expiresIn: '7d' }^);
echo     res.json({ token, user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol } }^);
echo   } catch (err^) { res.status(500^).json({ error: err.message }^); }
echo }^);
echo.
echo router.get('/me', auth, (req, res^) =^> res.json({ user: req.user }^)^);
echo.
echo router.get('/usuarios', auth, adminOnly, async (req, res^) =^> {
echo   const { rows } = await query('SELECT id,nombre,email,rol,activo,created_at FROM usuarios ORDER BY created_at'^);
echo   res.json(rows^);
echo }^);
echo.
echo router.post('/usuarios', auth, adminOnly, async (req, res^) =^> {
echo   try {
echo     const { nombre, email, password, rol } = req.body;
echo     const hash = await bcrypt.hash(password ^|^| 'cambiar123', 12^);
echo     const { rows: [u] } = await query('INSERT INTO usuarios (nombre,email,password,rol^) VALUES ($1,$2,$3,$4^) RETURNING id,nombre,email,rol', [nombre, email.toLowerCase(^), hash, rol ^|^| 'vendedor']^);
echo     res.status(201^).json(u^);
echo   } catch (err^) {
echo     if (err.code === '23505'^) return res.status(400^).json({ error: 'Email ya registrado' }^);
echo     res.status(500^).json({ error: err.message }^);
echo   }
echo }^);
echo.
echo router.put('/usuarios/:id', auth, adminOnly, async (req, res^) =^> {
echo   try {
echo     const { nombre, rol, activo } = req.body;
echo     const { rows: [u] } = await query('UPDATE usuarios SET nombre=$1,rol=$2,activo=$3 WHERE id=$4 RETURNING id,nombre,email,rol,activo', [nombre, rol, activo, req.params.id]^);
echo     if (!u^) return res.status(404^).json({ error: 'No encontrado' }^);
echo     res.json(u^);
echo   } catch (err^) { res.status(500^).json({ error: err.message }^); }
echo }^);
echo.
echo module.exports = router;
) > src\routes\auth.js

:: src/routes/equipos.js
(
echo const router = require('express'^).Router(^);
echo const { query, withTransaction } = require('../db'^);
echo const { auth, noReadOnly } = require('../middleware/auth'^);
echo.
echo router.get('/', auth, async (req, res^) =^> {
echo   try {
echo     const { status, categoria, q, limit=100, offset=0 } = req.query;
echo     let where = ['1=1']; const params = []; let p = 1;
echo     if (status^) { where.push(`e.status = $${p++}`^); params.push(status^); }
echo     if (categoria^) { where.push(`e.categoria = $${p++}`^); params.push(categoria^); }
echo     if (q^) { where.push(`(e.modelo ILIKE $${p} OR e.imei ILIKE $${p} OR e.color ILIKE $${p} OR e.observaciones ILIKE $${p}^)`^); params.push(`%${q}%`^); p++; }
echo     params.push(parseInt(limit^), parseInt(offset^)^);
echo     const { rows } = await query(`SELECT e.*,prov.nombre AS proveedor_nombre,u.nombre AS usuario_nombre FROM equipos e LEFT JOIN proveedores prov ON e.proveedor_id=prov.id LEFT JOIN usuarios u ON e.usuario_id=u.id WHERE ${where.join(' AND '^)} ORDER BY e.created_at DESC LIMIT $${p++} OFFSET $${p++}`, params^);
echo     res.json(rows^);
echo   } catch (err^) { res.status(500^).json({ error: err.message }^); }
echo }^);
echo.
echo router.get('/:id', auth, async (req, res^) =^> {
echo   try {
echo     const { rows: [e] } = await query('SELECT e.*,prov.nombre AS proveedor_nombre FROM equipos e LEFT JOIN proveedores prov ON e.proveedor_id=prov.id WHERE e.id=$1', [req.params.id]^);
echo     if (!e^) return res.status(404^).json({ error: 'No encontrado' }^);
echo     const { rows: historial } = await query('SELECT h.*,u.nombre AS usuario_nombre FROM historial_equipos h LEFT JOIN usuarios u ON h.usuario_id=u.id WHERE h.equipo_id=$1 ORDER BY h.created_at ASC', [req.params.id]^);
echo     res.json({ ...e, historial }^);
echo   } catch (err^) { res.status(500^).json({ error: err.message }^); }
echo }^);
echo.
echo router.post('/', auth, noReadOnly, async (req, res^) =^> {
echo   try {
echo     const { modelo,categoria='iPhone',storage='128GB',grade='A',origin='Americano',color,imei,bateria,proveedor_id,costo_gs=0,costo_usd=0,precio_venta_gs=0,precio_venta_usd=0,observaciones,fecha_ingreso,dias_gar_local=180,dias_gar_proveedor=30 } = req.body;
echo     const { rows: [e] } = await query('INSERT INTO equipos (modelo,categoria,storage,grade,origin,color,imei,bateria,proveedor_id,costo_gs,costo_usd,precio_venta_gs,precio_venta_usd,observaciones,fecha_ingreso,dias_gar_local,dias_gar_proveedor,usuario_id^) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18^) RETURNING *', [modelo,categoria,storage,grade,origin,color^|^|null,imei^|^|null,bateria^|^|null,proveedor_id^|^|null,costo_gs,costo_usd,precio_venta_gs,precio_venta_usd,observaciones^|^|null,fecha_ingreso^|^|new Date(^).toISOString(^).slice(0,10^),dias_gar_local,dias_gar_proveedor,req.user.id]^);
echo     await query('INSERT INTO historial_equipos (equipo_id,tipo,descripcion,usuario_id^) VALUES ($1,$2,$3,$4^)', [e.id,'ingreso',`Ingreso por ${req.user.nombre}`,req.user.id]^);
echo     res.status(201^).json(e^);
echo   } catch (err^) { res.status(500^).json({ error: err.message }^); }
echo }^);
echo.
echo router.put('/:id', auth, noReadOnly, async (req, res^) =^> {
echo   try {
echo     const fields = ['modelo','categoria','storage','grade','origin','color','imei','bateria','proveedor_id','costo_gs','costo_usd','precio_venta_gs','precio_venta_usd','observaciones','status','dias_gar_local','dias_gar_proveedor'];
echo     const updates = []; const values = []; let p = 1;
echo     for (const f of fields^) { if (req.body[f] !== undefined^) { updates.push(`${f}=$${p++}`^); values.push(req.body[f]^|^|null^); } }
echo     if (!updates.length^) return res.status(400^).json({ error: 'Nada que actualizar' }^);
echo     values.push(req.params.id^);
echo     const { rows: [e] } = await query(`UPDATE equipos SET ${updates.join(',')} WHERE id=$${p} RETURNING *`, values^);
echo     if (!e^) return res.status(404^).json({ error: 'No encontrado' }^);
echo     res.json(e^);
echo   } catch (err^) { res.status(500^).json({ error: err.message }^); }
echo }^);
echo.
echo module.exports = router;
) > src\routes\equipos.js

:: src/routes/ventas.js
(
echo const router = require('express'^).Router(^);
echo const { query, withTransaction } = require('../db'^);
echo const { auth, noReadOnly } = require('../middleware/auth'^);
echo.
echo router.post('/', auth, noReadOnly, async (req, res^) =^> {
echo   try {
echo     const result = await withTransaction(async (client^) =^> {
echo       const { equipo_id, cliente, precio_lista_gs, descuento_pct=0, monto_final_gs, forma_pago='Efectivo', aplico_comision=false, con_garantia=true, dias_garantia=180, fecha_venta, notas } = req.body;
echo       const { rows: [eq] } = await client.query("SELECT * FROM equipos WHERE id=$1 AND status='stock'", [equipo_id]^);
echo       if (!eq^) throw new Error('Equipo no disponible'^);
echo       let cliente_id = null;
echo       if (cliente?.nombre^) {
echo         const { rows: ex } = await client.query('SELECT id FROM clientes WHERE ci_ruc=$1 AND ci_ruc IS NOT NULL LIMIT 1', [cliente.ci_ruc^|^|null]^);
echo         if (ex[0]^) { cliente_id = ex[0].id; }
echo         else { const { rows: [nc] } = await client.query('INSERT INTO clientes (nombre,ci_ruc,tel,email^) VALUES ($1,$2,$3,$4^) RETURNING id', [cliente.nombre,cliente.ci_ruc^|^|null,cliente.tel^|^|null,cliente.email^|^|null]^); cliente_id = nc.id; }
echo       }
echo       const fv = fecha_venta ^|^| new Date(^).toISOString(^).slice(0,10^);
echo       const fecha_gar_vence = con_garantia ? new Date(new Date(fv^).getTime(^)+dias_garantia*86400000^).toISOString(^).slice(0,10^) : null;
echo       const { rows: [v] } = await client.query('INSERT INTO ventas (equipo_id,cliente_id,precio_lista_gs,descuento_pct,monto_final_gs,costo_gs,forma_pago,aplico_comision,con_garantia,dias_garantia,fecha_gar_vence,fecha_venta,notas,usuario_id^) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14^) RETURNING *', [equipo_id,cliente_id,precio_lista_gs,descuento_pct,monto_final_gs,eq.costo_gs,forma_pago,aplico_comision,con_garantia,dias_garantia,fecha_gar_vence,fv,notas,req.user.id]^);
echo       await client.query("UPDATE equipos SET status='vendido',fecha_gar_local_inicio=$1 WHERE id=$2", [fv,equipo_id]^);
echo       await client.query('INSERT INTO historial_equipos (equipo_id,tipo,descripcion,usuario_id^) VALUES ($1,$2,$3,$4^)', [equipo_id,'venta',`Vendido a ${cliente?.nombre^|^|'cliente'} - ${forma_pago} - Gs.${monto_final_gs}`,req.user.id]^);
echo       return { venta: v, cliente_id };
echo     }^);
echo     res.status(201^).json(result^);
echo   } catch (err^) { res.status(400^).json({ error: err.message }^); }
echo }^);
echo.
echo router.get('/', auth, async (req, res^) =^> {
echo   try {
echo     const { fecha_desde, fecha_hasta, limit=50, offset=0 } = req.query;
echo     let where = ['1=1']; const params = []; let p=1;
echo     if (fecha_desde^) { where.push(`v.fecha_venta >= $${p++}`^); params.push(fecha_desde^); }
echo     if (fecha_hasta^) { where.push(`v.fecha_venta <= $${p++}`^); params.push(fecha_hasta^); }
echo     params.push(parseInt(limit^), parseInt(offset^)^);
echo     const { rows } = await query(`SELECT v.*,e.modelo,e.storage,e.grade,e.imei,c.nombre AS cliente_nombre,c.ci_ruc,c.tel AS cliente_tel,u.nombre AS vendedor FROM ventas v JOIN equipos e ON v.equipo_id=e.id LEFT JOIN clientes c ON v.cliente_id=c.id LEFT JOIN usuarios u ON v.usuario_id=u.id WHERE ${where.join(' AND '^)} ORDER BY v.fecha_venta DESC LIMIT $${p++} OFFSET $${p++}`, params^);
echo     res.json(rows^);
echo   } catch (err^) { res.status(500^).json({ error: err.message }^); }
echo }^);
echo.
echo module.exports = router;
) > src\routes\ventas.js

:: src/routes/misc.js (proveedores, clientes, movimientos, reportes)
(
echo const { query } = require('../db'^);
echo const { auth, noReadOnly } = require('../middleware/auth'^);
echo.
echo const reportes = require('express'^).Router(^);
echo reportes.get('/resumen', auth, async (req, res^) =^> {
echo   try {
echo     const { fecha_desde = new Date(^).toISOString(^).slice(0,10^), fecha_hasta = new Date(^).toISOString(^).slice(0,10^) } = req.query;
echo     const [v,g,s] = await Promise.all([
echo       query(`SELECT COUNT(*^) AS cantidad,COALESCE(SUM(monto_final_gs^),0^) AS total,COALESCE(SUM(ganancia_gs^),0^) AS ganancia,COALESCE(SUM(CASE WHEN forma_pago='Efectivo' THEN monto_final_gs ELSE 0 END^),0^) AS efectivo,COALESCE(SUM(CASE WHEN forma_pago='Tarjeta' THEN monto_final_gs ELSE 0 END^),0^) AS tarjeta,COALESCE(SUM(CASE WHEN forma_pago='Transferencia' THEN monto_final_gs ELSE 0 END^),0^) AS transferencia,COALESCE(SUM(CASE WHEN forma_pago='USDT' THEN monto_final_gs ELSE 0 END^),0^) AS usdt FROM ventas WHERE fecha_venta BETWEEN $1 AND $2`, [fecha_desde,fecha_hasta]^),
echo       query(`SELECT COALESCE(SUM(CASE WHEN tipo='gasto' THEN monto_gs ELSE 0 END^),0^) AS gastos,COALESCE(SUM(CASE WHEN tipo='ingreso' THEN monto_gs ELSE 0 END^),0^) AS ingresos FROM movimientos WHERE fecha BETWEEN $1 AND $2`, [fecha_desde,fecha_hasta]^),
echo       query(`SELECT COUNT(*^) FILTER (WHERE status='stock'^) AS en_stock,COUNT(*^) FILTER (WHERE categoria='iPhone' AND status='stock'^) AS iphones,COALESCE(SUM(costo_gs^) FILTER (WHERE status='stock'^),0^) AS capital FROM equipos`^)
echo     ]^);
echo     res.json({ periodo:{desde:fecha_desde,hasta:fecha_hasta}, ventas:{cantidad:parseInt(v.rows[0].cantidad^),total:parseInt(v.rows[0].total^),ganancia:parseInt(v.rows[0].ganancia^),por_forma_pago:{efectivo:parseInt(v.rows[0].efectivo^),tarjeta:parseInt(v.rows[0].tarjeta^),transferencia:parseInt(v.rows[0].transferencia^),usdt:parseInt(v.rows[0].usdt^)}}, movimientos:{gastos:parseInt(g.rows[0].gastos^),ingresos:parseInt(g.rows[0].ingresos^)}, stock:{en_stock:parseInt(s.rows[0].en_stock^),iphones:parseInt(s.rows[0].iphones^),capital:parseInt(s.rows[0].capital^)} }^);
echo   } catch (err^) { res.status(500^).json({ error: err.message }^); }
echo }^);
echo.
echo const proveedores = require('express'^).Router(^);
echo proveedores.get('/', auth, async (req,res^) =^> { const {rows}=await query('SELECT * FROM proveedores WHERE activo=true ORDER BY nombre'^); res.json(rows^); }^);
echo proveedores.post('/', auth, noReadOnly, async (req,res^) =^> { try { const {nombre,empresa,tel,email,pais,ciudad,direccion,dias_garantia=30,notas}=req.body; const {rows:[p]}=await query('INSERT INTO proveedores (nombre,empresa,tel,email,pais,ciudad,direccion,dias_garantia,notas^) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9^) RETURNING *',[nombre,empresa^|^|null,tel^|^|null,email^|^|null,pais^|^|null,ciudad^|^|null,direccion^|^|null,dias_garantia,notas^|^|null]^); res.status(201^).json(p^); } catch(err^){res.status(500^).json({error:err.message}^);} }^);
echo proveedores.put('/:id', auth, noReadOnly, async (req,res^) =^> { try { const {nombre,empresa,tel,email,pais,ciudad,direccion,dias_garantia,notas}=req.body; const {rows:[p]}=await query('UPDATE proveedores SET nombre=$1,empresa=$2,tel=$3,email=$4,pais=$5,ciudad=$6,direccion=$7,dias_garantia=$8,notas=$9 WHERE id=$10 RETURNING *',[nombre,empresa^|^|null,tel^|^|null,email^|^|null,pais^|^|null,ciudad^|^|null,direccion^|^|null,dias_garantia^|^|30,notas^|^|null,req.params.id]^); res.json(p^); } catch(err^){res.status(500^).json({error:err.message}^);} }^);
echo.
echo const clientes = require('express'^).Router(^);
echo clientes.get('/', auth, async (req,res^) =^> { try { const {q}=req.query; let sql='SELECT * FROM clientes'; const params=[]; if(q^){sql+=' WHERE nombre ILIKE $1 OR ci_ruc ILIKE $1 OR tel ILIKE $1';params.push(`%${q}%`^);} sql+=' ORDER BY nombre LIMIT 50'; const {rows}=await query(sql,params^); res.json(rows^); } catch(err^){res.status(500^).json({error:err.message}^);} }^);
echo.
echo const movimientos = require('express'^).Router(^);
echo movimientos.get('/', auth, async (req,res^) =^> { try { const {fecha_desde,fecha_hasta,tipo}=req.query; let where=['1=1'];const params=[];let p=1; if(fecha_desde^){where.push(`fecha>=$${p++}`^);params.push(fecha_desde^);} if(fecha_hasta^){where.push(`fecha<=$${p++}`^);params.push(fecha_hasta^);} if(tipo^){where.push(`tipo=$${p++}`^);params.push(tipo^);} const {rows}=await query(`SELECT m.*,u.nombre AS usuario_nombre FROM movimientos m LEFT JOIN usuarios u ON m.usuario_id=u.id WHERE ${where.join(' AND '^)} ORDER BY fecha DESC`,params^); res.json(rows^); } catch(err^){res.status(500^).json({error:err.message}^);} }^);
echo movimientos.post('/', auth, noReadOnly, async (req,res^) =^> { try { const {tipo,categoria,descripcion,monto_gs,fecha,notas}=req.body; const {rows:[m]}=await query('INSERT INTO movimientos (tipo,categoria,descripcion,monto_gs,fecha,notas,usuario_id^) VALUES ($1,$2,$3,$4,$5,$6,$7^) RETURNING *',[tipo,categoria,descripcion^|^|null,monto_gs,fecha^|^|new Date(^).toISOString(^).slice(0,10^),notas^|^|null,req.user.id]^); res.status(201^).json(m^); } catch(err^){res.status(500^).json({error:err.message}^);} }^);
echo movimientos.delete('/:id', auth, noReadOnly, async (req,res^) =^> { try { await query('DELETE FROM movimientos WHERE id=$1',[req.params.id]^); res.json({ok:true}^); } catch(err^){res.status(500^).json({error:err.message}^);} }^);
echo.
echo const cajas = require('express'^).Router(^);
echo cajas.get('/hoy', auth, async (req,res^) =^> { try { const hoy=new Date(^).toISOString(^).slice(0,10^); const {rows:[c]}=await query('SELECT * FROM cajas WHERE fecha=$1',[hoy]^); const {rows:movs}=await query('SELECT * FROM movimientos WHERE fecha=$1 ORDER BY created_at DESC',[hoy]^); const {rows:ventas}=await query(`SELECT v.*,e.modelo,e.storage FROM ventas v JOIN equipos e ON v.equipo_id=e.id WHERE v.fecha_venta=$1 ORDER BY v.created_at DESC`,[hoy]^); res.json({caja:c^|^|null,movimientos:movs,ventas}^); } catch(err^){res.status(500^).json({error:err.message}^);} }^);
echo cajas.post('/abrir', auth, noReadOnly, async (req,res^) =^> { try { const hoy=new Date(^).toISOString(^).slice(0,10^); const {monto_apertura=0}=req.body; const {rows:[c]}=await query("INSERT INTO cajas (fecha,monto_apertura,usuario_apertura^) VALUES ($1,$2,$3^) ON CONFLICT (fecha^) DO UPDATE SET estado='abierta' RETURNING *",[hoy,monto_apertura,req.user.id]^); res.json(c^); } catch(err^){res.status(500^).json({error:err.message}^);} }^);
echo cajas.post('/cerrar', auth, noReadOnly, async (req,res^) =^> { try { const hoy=new Date(^).toISOString(^).slice(0,10^); const {rows:[t]}=await query("SELECT COALESCE(SUM(monto_final_gs^),0^) AS total FROM ventas WHERE fecha_venta=$1",[hoy]^); const {rows:[m]}=await query("SELECT COALESCE(SUM(monto_gs^) FILTER(WHERE tipo='gasto'^),0^) AS gastos,COALESCE(SUM(monto_gs^) FILTER(WHERE tipo='ingreso'^),0^) AS ingresos FROM movimientos WHERE fecha=$1",[hoy]^); const {rows:[c]}=await query("UPDATE cajas SET estado='cerrada',monto_cierre=$1,usuario_cierre=$2 WHERE fecha=$3 RETURNING *",[parseInt(t.total^)+parseInt(m.ingresos^)-parseInt(m.gastos^),req.user.id,hoy]^); res.json(c^); } catch(err^){res.status(500^).json({error:err.message}^);} }^);
echo.
echo module.exports = { reportes, proveedores, clientes, movimientos, cajas };
) > src\routes\misc.js

:: src/routes/garantias.js
(
echo const router = require('express'^).Router(^);
echo const { query, withTransaction } = require('../db'^);
echo const { auth, noReadOnly } = require('../middleware/auth'^);
echo.
echo router.get('/', auth, async (req,res^) =^> {
echo   try {
echo     const {rows}=await query(`SELECT g.*,e.modelo,e.storage,e.grade,e.imei,e.costo_gs,cl.nombre AS cliente_nombre,cl.ci_ruc,cl.tel AS cliente_tel,prov.nombre AS proveedor_nombre,prov.dias_garantia AS prov_dias,ec.modelo AS cambio_modelo,ec.storage AS cambio_storage,CASE WHEN g.fecha_envio_proveedor IS NOT NULL THEN CURRENT_DATE-g.fecha_envio_proveedor ELSE NULL END AS dias_en_proveedor FROM garantias g JOIN equipos e ON g.equipo_id=e.id LEFT JOIN clientes cl ON g.cliente_id=cl.id LEFT JOIN proveedores prov ON g.proveedor_id=prov.id LEFT JOIN equipos ec ON g.equipo_cambio_id=ec.id WHERE g.estado NOT IN ('resuelto','entregado_cliente'^) ORDER BY g.created_at DESC`^);
echo     res.json(rows^);
echo   } catch(err^){res.status(500^).json({error:err.message}^);}
echo }^);
echo.
echo router.post('/', auth, noReadOnly, async (req,res^) =^> {
echo   try {
echo     const result=await withTransaction(async (client^) =^> {
echo       const {equipo_id,cliente_id,descripcion_problema,proveedor_id,equipo_cambio_id,estado='ingresado'}=req.body;
echo       const {rows:[g]}=await client.query('INSERT INTO garantias (equipo_id,cliente_id,descripcion_problema,proveedor_id,equipo_cambio_id,estado,usuario_id^) VALUES ($1,$2,$3,$4,$5,$6,$7^) RETURNING *',[equipo_id,cliente_id^|^|null,descripcion_problema,proveedor_id^|^|null,equipo_cambio_id^|^|null,estado,req.user.id]^);
echo       await client.query("UPDATE equipos SET status='garantia_local' WHERE id=$1",[equipo_id]^);
echo       if(equipo_cambio_id^) await client.query("UPDATE equipos SET status='cambio_asignado' WHERE id=$1",[equipo_cambio_id]^);
echo       return g;
echo     }^);
echo     res.status(201^).json(result^);
echo   } catch(err^){res.status(400^).json({error:err.message}^);}
echo }^);
echo.
echo router.put('/:id/estado', auth, noReadOnly, async (req,res^) =^> {
echo   try {
echo     const result=await withTransaction(async (client^) =^> {
echo       const {estado,notas_proveedor,solucion,fecha_envio_proveedor}=req.body;
echo       const {rows:[g]}=await client.query('SELECT * FROM garantias WHERE id=$1',[req.params.id]^);
echo       if(!g^) throw new Error('No encontrada'^);
echo       const resuelto=estado==='resuelto'^|^|estado==='entregado_cliente';
echo       await client.query('UPDATE garantias SET estado=$1,notas_proveedor=COALESCE($2,notas_proveedor^),solucion=COALESCE($3,solucion^),fecha_envio_proveedor=COALESCE($4,fecha_envio_proveedor^) WHERE id=$5',[estado,notas_proveedor^|^|null,solucion^|^|null,fecha_envio_proveedor^|^|null,req.params.id]^);
echo       const statusMap={enviado_proveedor:'garantia_proveedor',en_proveedor:'garantia_proveedor',recibido:'reparacion',resuelto:'stock',entregado_cliente:'stock'};
echo       if(statusMap[estado]^) await client.query('UPDATE equipos SET status=$1 WHERE id=$2',[statusMap[estado],g.equipo_id]^);
echo       if(resuelto^&^&g.equipo_cambio_id^) await client.query("UPDATE equipos SET status='vendido' WHERE id=$1",[g.equipo_cambio_id]^);
echo       return {ok:true};
echo     }^);
echo     res.json(result^);
echo   } catch(err^){res.status(400^).json({error:err.message}^);}
echo }^);
echo.
echo module.exports = router;
) > src\routes\garantias.js

:: src/index.js
(
echo require('dotenv'^).config(^);
echo const express = require('express'^);
echo const cors = require('cors'^);
echo const app = express(^);
echo.
echo app.use(cors({ origin: process.env.FRONTEND_URL ^|^| '*', credentials: true }^)^);
echo app.use(express.json(^)^);
echo.
echo app.use('/api/auth',        require('./routes/auth'^)^);
echo app.use('/api/equipos',     require('./routes/equipos'^)^);
echo app.use('/api/ventas',      require('./routes/ventas'^)^);
echo app.use('/api/garantias',   require('./routes/garantias'^)^);
echo.
echo const { reportes, proveedores, clientes, movimientos, cajas } = require('./routes/misc'^);
echo app.use('/api/reportes',    reportes^);
echo app.use('/api/proveedores', proveedores^);
echo app.use('/api/clientes',    clientes^);
echo app.use('/api/movimientos', movimientos^);
echo app.use('/api/caja',        cajas^);
echo.
echo app.get('/health', (_req,res^) =^> res.json({status:'ok',app:'Tio Iphonero CRM',time:new Date(^).toISOString(^)}^)^);
echo app.use((_req,res^) =^> res.status(404^).json({error:'Ruta no encontrada'}^)^);
echo app.use((err,_req,res,_next^) =^> { console.error(err^); res.status(500^).json({error:'Error interno'}^); }^);
echo.
echo const PORT = process.env.PORT ^|^| 3001;
echo app.listen(PORT, (^) =^> console.log(`Tio Iphonero CRM corriendo en puerto ${PORT}`^)^);
) > src\index.js

:: scripts/migrate.js
(
echo require('dotenv'^).config(^);
echo const { pool } = require('../src/db'^);
echo.
echo const migrate = async (^) =^> {
echo   const client = await pool.connect(^);
echo   try {
echo     console.log('Iniciando migracion...'^);
echo     await client.query(`
echo       CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
echo       CREATE TABLE IF NOT EXISTS usuarios (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(^), nombre VARCHAR(100^) NOT NULL, email VARCHAR(150^) UNIQUE NOT NULL, password VARCHAR(255^) NOT NULL, rol VARCHAR(20^) NOT NULL DEFAULT 'vendedor' CHECK (rol IN ('admin','vendedor','tecnico','solo_lectura'^)^), activo BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(^), updated_at TIMESTAMPTZ DEFAULT NOW(^)^);
echo       CREATE TABLE IF NOT EXISTS proveedores (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(^), nombre VARCHAR(150^) NOT NULL, empresa VARCHAR(150^), tel VARCHAR(50^), email VARCHAR(150^), pais VARCHAR(80^), ciudad VARCHAR(80^), direccion TEXT, dias_garantia INTEGER DEFAULT 30, notas TEXT, activo BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(^), updated_at TIMESTAMPTZ DEFAULT NOW(^)^);
echo       CREATE TABLE IF NOT EXISTS clientes (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(^), nombre VARCHAR(150^) NOT NULL, ci_ruc VARCHAR(30^), tel VARCHAR(50^), email VARCHAR(150^), direccion TEXT, notas TEXT, created_at TIMESTAMPTZ DEFAULT NOW(^), updated_at TIMESTAMPTZ DEFAULT NOW(^)^);
echo       CREATE TABLE IF NOT EXISTS equipos (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(^), modelo VARCHAR(200^) NOT NULL, categoria VARCHAR(50^) DEFAULT 'iPhone', storage VARCHAR(20^) DEFAULT '128GB', grade VARCHAR(5^) DEFAULT 'A', origin VARCHAR(50^) DEFAULT 'Americano', color VARCHAR(80^), imei VARCHAR(20^), bateria INTEGER, proveedor_id UUID REFERENCES proveedores(id^) ON DELETE SET NULL, costo_gs BIGINT DEFAULT 0, costo_usd NUMERIC(10,2^) DEFAULT 0, precio_venta_gs BIGINT DEFAULT 0, precio_venta_usd NUMERIC(10,2^) DEFAULT 0, observaciones TEXT, fecha_ingreso DATE DEFAULT CURRENT_DATE, status VARCHAR(30^) NOT NULL DEFAULT 'stock', dias_gar_local INTEGER DEFAULT 180, dias_gar_proveedor INTEGER DEFAULT 30, fecha_gar_local_inicio DATE, fecha_gar_prov_inicio DATE, usuario_id UUID REFERENCES usuarios(id^) ON DELETE SET NULL, created_at TIMESTAMPTZ DEFAULT NOW(^), updated_at TIMESTAMPTZ DEFAULT NOW(^)^);
echo       CREATE INDEX IF NOT EXISTS idx_equipos_imei ON equipos(imei^);
echo       CREATE INDEX IF NOT EXISTS idx_equipos_status ON equipos(status^);
echo       CREATE TABLE IF NOT EXISTS ventas (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(^), equipo_id UUID NOT NULL REFERENCES equipos(id^), cliente_id UUID REFERENCES clientes(id^) ON DELETE SET NULL, precio_lista_gs BIGINT NOT NULL, descuento_pct NUMERIC(5,2^) DEFAULT 0, monto_final_gs BIGINT NOT NULL, costo_gs BIGINT NOT NULL, ganancia_gs BIGINT GENERATED ALWAYS AS (monto_final_gs - costo_gs^) STORED, forma_pago VARCHAR(30^) DEFAULT 'Efectivo', aplico_comision BOOLEAN DEFAULT false, con_garantia BOOLEAN DEFAULT true, dias_garantia INTEGER DEFAULT 180, fecha_gar_vence DATE, fecha_venta DATE DEFAULT CURRENT_DATE, notas TEXT, usuario_id UUID REFERENCES usuarios(id^) ON DELETE SET NULL, created_at TIMESTAMPTZ DEFAULT NOW(^)^);
echo       CREATE TABLE IF NOT EXISTS garantias (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(^), equipo_id UUID NOT NULL REFERENCES equipos(id^), cliente_id UUID REFERENCES clientes(id^) ON DELETE SET NULL, estado VARCHAR(30^) NOT NULL DEFAULT 'ingresado', descripcion_problema TEXT NOT NULL, notas_proveedor TEXT, solucion TEXT, proveedor_id UUID REFERENCES proveedores(id^) ON DELETE SET NULL, fecha_envio_proveedor DATE, equipo_cambio_id UUID REFERENCES equipos(id^) ON DELETE SET NULL, fecha_ingreso DATE DEFAULT CURRENT_DATE, usuario_id UUID REFERENCES usuarios(id^) ON DELETE SET NULL, created_at TIMESTAMPTZ DEFAULT NOW(^), updated_at TIMESTAMPTZ DEFAULT NOW(^)^);
echo       CREATE TABLE IF NOT EXISTS historial_equipos (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(^), equipo_id UUID NOT NULL REFERENCES equipos(id^) ON DELETE CASCADE, tipo VARCHAR(50^) NOT NULL, descripcion TEXT, usuario_id UUID REFERENCES usuarios(id^) ON DELETE SET NULL, created_at TIMESTAMPTZ DEFAULT NOW(^)^);
echo       CREATE TABLE IF NOT EXISTS cajas (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(^), fecha DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE, estado VARCHAR(20^) DEFAULT 'abierta', monto_apertura BIGINT DEFAULT 0, monto_cierre BIGINT, usuario_apertura UUID REFERENCES usuarios(id^), usuario_cierre UUID REFERENCES usuarios(id^), created_at TIMESTAMPTZ DEFAULT NOW(^), updated_at TIMESTAMPTZ DEFAULT NOW(^)^);
echo       CREATE TABLE IF NOT EXISTS movimientos (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(^), caja_id UUID REFERENCES cajas(id^) ON DELETE SET NULL, tipo VARCHAR(20^) NOT NULL, categoria VARCHAR(80^) NOT NULL, descripcion VARCHAR(255^), monto_gs BIGINT NOT NULL, fecha DATE DEFAULT CURRENT_DATE, notas TEXT, usuario_id UUID REFERENCES usuarios(id^) ON DELETE SET NULL, created_at TIMESTAMPTZ DEFAULT NOW(^)^);
echo     `^);
echo     console.log('Migracion completada!'^);
echo   } catch(err^) { console.error('Error:', err.message^); throw err; }
echo   finally { client.release(^); await pool.end(^); }
echo };
echo migrate(^);
) > scripts\migrate.js

:: scripts/seed.js
(
echo require('dotenv'^).config(^);
echo const { pool } = require('../src/db'^);
echo const bcrypt = require('bcryptjs'^);
echo.
echo const seed = async (^) =^> {
echo   const client = await pool.connect(^);
echo   try {
echo     const hash = await bcrypt.hash('admin123', 12^);
echo     await client.query(`INSERT INTO usuarios (nombre,email,password,rol^) VALUES ('Alejandro','tioiphonero@gmail.com',$1,'admin'^),('Vendedor 1','vendedor1@tioiphonero.com',$1,'vendedor'^),('Tecnico','tecnico@tioiphonero.com',$1,'tecnico'^),('Lectura','lectura@tioiphonero.com',$1,'solo_lectura'^) ON CONFLICT (email^) DO NOTHING`, [hash]^);
echo     console.log('Seed completado!'^);
echo     console.log('Admin: tioiphonero@gmail.com / admin123'^);
echo   } catch(err^){console.error(err.message^);}
echo   finally{client.release(^);await pool.end(^);}
echo };
echo seed(^);
) > scripts\seed.js

echo.
echo ===================================
echo Todos los archivos creados!
echo ===================================
