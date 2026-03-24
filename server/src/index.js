const express = require('express');
const cors = require('cors');
const { initializeDatabase, IS_POSTGRES } = require('./database');
const usersRouter = require('./routes/users');
const vehiclesRouter = require('./routes/vehicles');
const shiftsRouter = require('./routes/shifts');
const reportsRouter = require('./routes/reports');

const { authMiddleware, adminOnly } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Fix #8: CORS — open for development; in production restrict to your app origins.
// Currently left open for Expo Go / EAS build compatibility.
// TODO: replace '*' with your Expo-hosted / custom domain in production.
app.use(cors({
  origin: IS_POSTGRES ? true : '*', // 'true' mirrors the request origin (permissive but logged)
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));

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
  rows.forEach(r => {
    // Don't expose sensitive tokens in public endpoint
    if (r.key === 'plateRecognizerToken') return;
    settings[r.key] = r.value;
  });
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

// ANPR Settings (Plate Recognizer API Token)
app.put('/api/settings/anpr', authMiddleware, adminOnly, async (req, res) => {
  const { getDb } = require('./database');
  const db = await getDb();
  const { plateRecognizerToken } = req.body;
  if (plateRecognizerToken === undefined) return res.status(400).json({ error: 'plateRecognizerToken is required' });
  const existing = await db.prepare('SELECT key FROM app_settings WHERE key = ?').get('plateRecognizerToken');
  if (existing) {
    await db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(String(plateRecognizerToken), 'plateRecognizerToken');
  } else {
    await db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('plateRecognizerToken', String(plateRecognizerToken));
  }
  res.json({ success: true });
});

app.get('/api/settings/anpr', authMiddleware, async (req, res) => {
  const { getDb } = require('./database');
  const db = await getDb();
  const row = await db.prepare('SELECT value FROM app_settings WHERE key = ?').get('plateRecognizerToken');
  res.json({ hasToken: !!(row && row.value) });
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
    console.log(`  Mode: ${IS_POSTGRES ? 'PostgreSQL (production)' : 'SQLite (local)'}`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`========================================\n`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
