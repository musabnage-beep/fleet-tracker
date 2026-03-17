const express = require('express');
const cors = require('cors');
const { initializeDatabase } = require('./database');
const usersRouter = require('./routes/users');
const vehiclesRouter = require('./routes/vehicles');
const shiftsRouter = require('./routes/shifts');
const reportsRouter = require('./routes/reports');

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

// Admin reset - clears all data except users
const { authMiddleware, adminOnly } = require('./auth');
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
