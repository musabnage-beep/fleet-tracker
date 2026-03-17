const express = require('express');
const { getDb } = require('../database');
const { authMiddleware, adminOnly } = require('../auth');

const router = express.Router();

router.post('/scan/start', authMiddleware, async (req, res) => {
  const { shift_id } = req.body;
  if (!shift_id) return res.status(400).json({ error: 'معرف الوردية مطلوب' });

  const db = await getDb();
  const shift = await db.prepare('SELECT * FROM shifts WHERE id = ?').get(shift_id);
  if (!shift) return res.status(404).json({ error: 'الوردية غير موجودة' });

  const result = await db.prepare('INSERT INTO scan_sessions (shift_id, employee_id) VALUES (?, ?)').run(shift_id, req.user.id);
  res.status(201).json({ session_id: result.lastInsertRowid });
});

router.post('/scan/plate', authMiddleware, async (req, res) => {
  const { session_id, plate_number } = req.body;
  if (!session_id || !plate_number) return res.status(400).json({ error: 'معرف الجلسة ورقم اللوحة مطلوبان' });

  const db = await getDb();
  const session = await db.prepare('SELECT * FROM scan_sessions WHERE id = ?').get(session_id);
  if (!session) return res.status(404).json({ error: 'جلسة المسح غير موجودة' });

  const normalizedPlate = plate_number.trim().toUpperCase();

  const existing = await db.prepare('SELECT * FROM scan_results WHERE session_id = ? AND plate_number = ?').get(session_id, normalizedPlate);
  if (existing) return res.json({ ...existing, duplicate: true });

  const vehicle = await db.prepare('SELECT * FROM vehicles WHERE plate_number = ? AND is_active = 1').get(normalizedPlate);

  let status;
  if (vehicle) {
    const inShift = await db.prepare('SELECT * FROM shift_vehicles WHERE shift_id = ? AND vehicle_id = ?').get(session.shift_id, vehicle.id);
    status = inShift ? 'found' : 'not_in_shift';
  } else {
    status = 'unknown';
  }

  const result = await db.prepare('INSERT INTO scan_results (session_id, plate_number, vehicle_id, status) VALUES (?, ?, ?, ?)').run(session_id, normalizedPlate, vehicle ? vehicle.id : null, status);
  const scanResult = await db.prepare('SELECT * FROM scan_results WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ...scanResult, duplicate: false });
});

router.post('/scan/complete', authMiddleware, async (req, res) => {
  const { session_id } = req.body;
  const db = await getDb();
  await db.prepare("UPDATE scan_sessions SET completed_at = datetime('now') WHERE id = ?").run(session_id);
  const report = await generateReport(session_id);
  res.json(report);
});

router.get('/scan/:sessionId', authMiddleware, async (req, res) => {
  const report = await generateReport(Number(req.params.sessionId));
  if (!report) return res.status(404).json({ error: 'التقرير غير موجود' });
  res.json(report);
});

router.get('/', authMiddleware, async (req, res) => {
  const db = await getDb();
  const { date, shift_id } = req.query;

  let query = `
    SELECT ss.*, s.date, s.name as shift_name, u.name as employee_name,
      (SELECT COUNT(*) FROM scan_results WHERE session_id = ss.id) as total_scanned,
      (SELECT COUNT(*) FROM scan_results WHERE session_id = ss.id AND status = 'found') as found_count,
      (SELECT COUNT(*) FROM scan_results WHERE session_id = ss.id AND status = 'not_in_shift') as not_in_shift_count,
      (SELECT COUNT(*) FROM scan_results WHERE session_id = ss.id AND status = 'unknown') as unknown_count
    FROM scan_sessions ss
    JOIN shifts s ON ss.shift_id = s.id
    JOIN users u ON ss.employee_id = u.id
  `;

  const params = [];
  const conditions = [];

  if (req.user.role === 'employee') {
    conditions.push('ss.employee_id = ?');
    params.push(req.user.id);
  }
  if (date) {
    conditions.push('s.date = ?');
    params.push(date);
  }
  if (shift_id) {
    conditions.push('ss.shift_id = ?');
    params.push(Number(shift_id));
  }
  if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY ss.started_at DESC LIMIT 100';

  const reports = await db.prepare(query).all(...params);
  res.json(reports);
});

router.get('/pdf/:sessionId', authMiddleware, adminOnly, async (req, res) => {
  const report = await generateReport(Number(req.params.sessionId));
  if (!report) return res.status(404).json({ error: 'التقرير غير موجود' });

  const db = await getDb();
  const shiftVehicles = await db.prepare(`
    SELECT v.plate_number, v.description, sv.route_info
    FROM shift_vehicles sv JOIN vehicles v ON sv.vehicle_id = v.id WHERE sv.shift_id = ?
  `).all(report.session.shift_id);

  const scannedPlates = new Set(report.results.map(r => r.plate_number));
  const notScanned = shiftVehicles.filter(v => !scannedPlates.has(v.plate_number));

  res.json({ ...report, shift_vehicles: shiftVehicles, not_scanned: notScanned });
});

async function generateReport(sessionId) {
  const db = await getDb();
  const session = await db.prepare(`
    SELECT ss.*, s.date, s.name as shift_name, u.name as employee_name
    FROM scan_sessions ss
    JOIN shifts s ON ss.shift_id = s.id
    JOIN users u ON ss.employee_id = u.id
    WHERE ss.id = ?
  `).get(sessionId);

  if (!session) return null;

  const results = await db.prepare(`
    SELECT sr.*, v.description as vehicle_description
    FROM scan_results sr LEFT JOIN vehicles v ON sr.vehicle_id = v.id
    WHERE sr.session_id = ? ORDER BY sr.scanned_at ASC
  `).all(sessionId);

  const shiftVehicleCount = await db.prepare('SELECT COUNT(*) as count FROM shift_vehicles WHERE shift_id = ?').get(session.shift_id);

  const summary = {
    total_in_shift: shiftVehicleCount.count,
    total_scanned: results.length,
    found: results.filter(r => r.status === 'found').length,
    not_in_shift: results.filter(r => r.status === 'not_in_shift').length,
    unknown: results.filter(r => r.status === 'unknown').length,
  };

  return { session, results, summary };
}

module.exports = router;
