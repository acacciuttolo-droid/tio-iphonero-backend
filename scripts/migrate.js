require('dotenv').config();
const { pool } = require('../src/db');

const migrate = async () => {
  const client = await pool.connect();
  try {
    console.log('Iniciando migracion...');
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE TABLE IF NOT EXISTS usuarios (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nombre VARCHAR(100) NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        rol VARCHAR(20) NOT NULL DEFAULT 'vendedor' CHECK (rol IN ('admin','vendedor','tecnico','solo_lectura')),
        activo BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS proveedores (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nombre VARCHAR(150) NOT NULL, empresa VARCHAR(150), tel VARCHAR(50), email VARCHAR(150),
        pais VARCHAR(80), ciudad VARCHAR(80), direccion TEXT, dias_garantia INTEGER DEFAULT 30,
        notas TEXT, activo BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS clientes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nombre VARCHAR(150) NOT NULL, ci_ruc VARCHAR(30), tel VARCHAR(50), email VARCHAR(150),
        direccion TEXT, notas TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS equipos (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        modelo VARCHAR(200) NOT NULL, categoria VARCHAR(50) DEFAULT 'iPhone',
        storage VARCHAR(20) DEFAULT '128GB', grade VARCHAR(5) DEFAULT 'A',
        origin VARCHAR(50) DEFAULT 'Americano', color VARCHAR(80), imei VARCHAR(20),
        bateria INTEGER, proveedor_id UUID REFERENCES proveedores(id) ON DELETE SET NULL,
        costo_gs BIGINT DEFAULT 0, costo_usd NUMERIC(10,2) DEFAULT 0,
        precio_venta_gs BIGINT DEFAULT 0, precio_venta_usd NUMERIC(10,2) DEFAULT 0,
        observaciones TEXT, fecha_ingreso DATE DEFAULT CURRENT_DATE,
        status VARCHAR(30) NOT NULL DEFAULT 'stock',
        dias_gar_local INTEGER DEFAULT 180, dias_gar_proveedor INTEGER DEFAULT 30,
        fecha_gar_local_inicio DATE, fecha_gar_prov_inicio DATE,
        usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_equipos_imei ON equipos(imei);
      CREATE INDEX IF NOT EXISTS idx_equipos_status ON equipos(status);
      CREATE TABLE IF NOT EXISTS ventas (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        equipo_id UUID NOT NULL REFERENCES equipos(id),
        cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
        precio_lista_gs BIGINT NOT NULL, descuento_pct NUMERIC(5,2) DEFAULT 0,
        monto_final_gs BIGINT NOT NULL, costo_gs BIGINT NOT NULL,
        ganancia_gs BIGINT GENERATED ALWAYS AS (monto_final_gs - costo_gs) STORED,
        forma_pago VARCHAR(30) DEFAULT 'Efectivo', aplico_comision BOOLEAN DEFAULT false,
        con_garantia BOOLEAN DEFAULT true, dias_garantia INTEGER DEFAULT 180,
        fecha_gar_vence DATE, fecha_venta DATE DEFAULT CURRENT_DATE,
        notas TEXT, usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS garantias (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        equipo_id UUID NOT NULL REFERENCES equipos(id),
        cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
        estado VARCHAR(30) NOT NULL DEFAULT 'ingresado',
        descripcion_problema TEXT NOT NULL, notas_proveedor TEXT, solucion TEXT,
        proveedor_id UUID REFERENCES proveedores(id) ON DELETE SET NULL,
        fecha_envio_proveedor DATE,
        equipo_cambio_id UUID REFERENCES equipos(id) ON DELETE SET NULL,
        fecha_ingreso DATE DEFAULT CURRENT_DATE,
        usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS historial_equipos (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        equipo_id UUID NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
        tipo VARCHAR(50) NOT NULL, descripcion TEXT,
        usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS cajas (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        fecha DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
        estado VARCHAR(20) DEFAULT 'abierta',
        monto_apertura BIGINT DEFAULT 0, monto_cierre BIGINT,
        usuario_apertura UUID REFERENCES usuarios(id),
        usuario_cierre UUID REFERENCES usuarios(id),
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS movimientos (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        caja_id UUID REFERENCES cajas(id) ON DELETE SET NULL,
        tipo VARCHAR(20) NOT NULL, categoria VARCHAR(80) NOT NULL,
        descripcion VARCHAR(255), monto_gs BIGINT NOT NULL,
        fecha DATE DEFAULT CURRENT_DATE, notas TEXT,
        usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('Migracion completada exitosamente!');
    console.log('Tablas: usuarios, proveedores, clientes, equipos, ventas, garantias, historial_equipos, cajas, movimientos');
  } catch (err) {
    console.error('Error en migracion:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

migrate();
