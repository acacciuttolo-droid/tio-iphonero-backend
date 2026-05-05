require('dotenv').config();
const { pool } = require('../src/db');
const bcrypt = require('bcryptjs');

const seed = async () => {
  const client = await pool.connect();
  try {
    const hash = await bcrypt.hash('admin123', 12);
    await client.query(`
      INSERT INTO usuarios (nombre, email, password, rol) VALUES
        ('Alejandro', 'tioiphonero@gmail.com', $1, 'admin'),
        ('Vendedor 1', 'vendedor1@tioiphonero.com', $1, 'vendedor'),
        ('Tecnico',   'tecnico@tioiphonero.com',   $1, 'tecnico'),
        ('Lectura',   'lectura@tioiphonero.com',    $1, 'solo_lectura')
      ON CONFLICT (email) DO NOTHING
    `, [hash]);
    console.log('Seed completado!');
    console.log('Usuario admin: tioiphonero@gmail.com');
    console.log('Password inicial: admin123');
    console.log('IMPORTANTE: Cambia la password despues del primer login!');
  } catch (err) {
    console.error('Error en seed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
};

seed();
