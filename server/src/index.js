const express = require('express');
const cors = require('cors');
const { initializeDatabase } = require('./database');
const usersRouter = require('./routes/users');
const vehiclesRouter = require('./routes/vehicles');
const shiftsRouter = require('./routes/shifts');
const reportsRouter = require('./routes/reports');

const { authMiddleware, adminOnly } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/users', usersRouter);
app.use('/api/vehicles', vehiclesRouter);
app.use('/api/shifts', shiftsRouter);
app.use('/api/reports', reportsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// App Settings (public GET, admin PUT)
app.get('/api/settings', async (req, res) => {
  const { getDb } = require('./database');
  const db = await getDb();
  const rows = await db.prepare('SELECT key, value FROM app_settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

app.put('/api/settings', authMiddleware, adminOnly, async (req, res) => {
  const { getDb } = require('./database');
  const db = await getDb();
  const { appName, companyName } = req.body;
  for (const [key, value] of Object.entries({ appName, companyName })) {
    if (value !== undefined) {
      const existing = await db.prepare('SELECT key FROM app_settings WHERE key = ?').get(key);
      if (existing) {
        await db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(String(value), key);
      } else {
        await db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(key, String(value));
      }
    }
  }
  res.json({ success: true });
});

app.post('/api/settings/logo', authMiddleware, adminOnly, async (req, res) => {
  const { getDb } = require('./database');
  const db = await getDb();
  const { logo } = req.body;
  const existing = await db.prepare('SELECT key FROM app_settings WHERE key = ?').get('logo');
  if (existing) {
    await db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(logo, 'logo');
  } else {
    await db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('logo', logo);
  }
  res.json({ success: true });
});

// Admin reset - clears all data except users
app.post('/api/admin/reset', authMiddleware, adminOnly, async (req, res) => {
  const { getDb } = require('./database');
  const db = await getDb();
  await db.prepare('DELETE FROM scan_results WHERE 1=1').run();
  await db.prepare('DELETE FROM scan_sessions WHERE 1=1').run();
  await db.prepare('DELETE FROM shift_vehicles WHERE 1=1').run();
  await db.prepare('DELETE FROM shifts WHERE 1=1').run();
  await db.prepare('DELETE FROM vehicles WHERE 1=1').run();
  res.json({ success: true, message: 'All data cleared' });
});

// Initialize database then start server
async function start() {
  await initializeDatabase();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n========================================`);
    console.log(`  Fleet Tracker Server`);
    console.log(`  Running on port ${PORT}`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`========================================\n`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
