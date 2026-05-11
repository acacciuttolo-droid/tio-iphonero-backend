require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors({
  origin: [
    'https://acacciuttolo-droid.github.io',
    'http://localhost',
    /\.netlify\.app$/
  ],
  credentials: true,
}));
app.use(express.json());

app.use('/api/auth',        require('./routes/auth'));
app.use('/api/equipos',     require('./routes/equipos'));
app.use('/api/ventas',      require('./routes/ventas'));
app.use('/api/garantias',   require('./routes/garantias'));

const { reportes, proveedores, clientes, movimientos, cajas } = require('./routes/misc');
app.use('/api/reportes',    reportes);
app.use('/api/proveedores', proveedores);
app.use('/api/clientes',    clientes);
app.use('/api/movimientos', movimientos);
app.use('/api/caja',        cajas);

app.get('/health', (_req, res) => res.json({ status: 'ok', app: 'Tio Iphonero CRM', time: new Date().toISOString() }));
app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Error interno' }); });

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Tio Iphonero CRM corriendo en puerto ${PORT}`));

// Catalogo
const catalogo = require('./routes/catalogo');
app.use('/api/catalogo', catalogo);
