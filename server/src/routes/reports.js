const express = require('express');
const XLSX = require('xlsx');
const { getDb } = require('../database');
const { authMiddleware, adminOnly } = require('../auth');
const { normalizePlate, findVehicleByPlate } = require('../plateUtils');

const router = express.Router();

// Start scan - no shift required
router.post('/scan/start', authMiddleware, async (req, res) => {
  const { latitude, longitude } = req.body;
  const db = await getDb();
  const result = await db.prepare(
    'INSERT INTO scan_sessions (shift_id, employee_id, latitude, longitude) VALUES (?, ?, ?, ?)'
  ).run(null, req.user.id, latitude || null, longitude || null);
  res.status(201).json({ session_id: result.lastInsertRowid });
});

// Submit a scanned plate - simplified: found or unknown
router.post('/scan/plate', authMiddleware, async (req, res) => {
  const { session_id, plate_number, latitude, longitude } = req.body;
  if (!session_id || !plate_number) return res.status(400).json({ error: 'معرف الجلسة ورقم اللوحة مطلوبان' });

  const db = await getDb();
  const session = await db.prepare('SELECT * FROM scan_sessions WHERE id = ?').get(session_id);
  if (!session) return res.status(404).json({ error: 'جلسة المسح غير موجودة' });

  const normalizedInput = normalizePlate(plate_number);
  const displayPlate = plate_number.trim().toUpperCase();

  // Check duplicates
  const existingResults = await db.prepare('SELECT * FROM scan_results WHERE session_id = ?').all(session_id);
  const duplicate = existingResults.find(r => normalizePlate(r.plate_number) === normalizedInput);
  if (duplicate) return res.json({ ...duplicate, duplicate: true });

  // Smart vehicle matching
  const vehicle = await findVehicleByPlate(db, plate_number);
  const status = vehicle ? 'found' : 'unknown';

  const result = await db.prepare(
    'INSERT INTO scan_results (session_id, plate_number, vehicle_id, status, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(session_id, displayPlate, vehicle ? vehicle.id : null, status, latitude || null, longitude || null);
  const scanResult = await db.prepare('SELECT * FROM scan_results WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ...scanResult, duplicate: false });
});

// Complete scan
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

// List reports
router.get('/', authMiddleware, async (req, res) => {
  const db = await getDb();
  const { date } = req.query;

  let query = `
    SELECT ss.*, u.name as employee_name,
      (SELECT COUNT(*) FROM scan_results WHERE session_id = ss.id) as total_scanned,
      (SELECT COUNT(*) FROM scan_results WHERE session_id = ss.id AND status = 'found') as found_count,
      (SELECT COUNT(*) FROM scan_results WHERE session_id = ss.id AND status = 'unknown') as unknown_count
    FROM scan_sessions ss
    JOIN users u ON ss.employee_id = u.id
  `;

  const params = [];
  const conditions = [];

  if (req.user.role === 'employee') {
    conditions.push('ss.employee_id = ?');
    params.push(req.user.id);
  }
  if (date) {
    conditions.push("DATE(ss.started_at) = ?");
    params.push(date);
  }
  if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY ss.started_at DESC LIMIT 100';

  const reports = await db.prepare(query).all(...params);
  res.json(reports);
});

// PDF report data
router.get('/pdf/:sessionId', authMiddleware, adminOnly, async (req, res) => {
  const report = await generateReport(Number(req.params.sessionId));
  if (!report) return res.status(404).json({ error: 'التقرير غير موجود' });

  const db = await getDb();
  // Get all active vehicles for "not scanned" comparison
  const allVehicles = await db.prepare('SELECT plate_number, description FROM vehicles WHERE is_active = 1').all();
  const scannedNormalized = new Set(report.results.map(r => normalizePlate(r.plate_number)));
  const notScanned = allVehicles.filter(v => !scannedNormalized.has(normalizePlate(v.plate_number)));

  res.json({ ...report, all_vehicles: allVehicles, not_scanned: notScanned });
});

// Excel export
router.get('/excel/:sessionId', authMiddleware, adminOnly, async (req, res) => {
  try {
    const report = await generateReport(Number(req.params.sessionId));
    if (!report) return res.status(404).json({ error: 'التقرير غير موجود' });

    const db = await getDb();
    const allVehicles = await db.prepare('SELECT plate_number, description FROM vehicles WHERE is_active = 1').all();
    const scannedNormalized = new Set(report.results.map(r => normalizePlate(r.plate_number)));
    const notScanned = allVehicles.filter(v => !scannedNormalized.has(normalizePlate(v.plate_number)));

    // Summary sheet
    const summaryData = [
      ['ملخص التقرير / Report Summary'],
      ['التاريخ / Date', report.session.date],
      ['الموظف / Employee', report.session.employee_name],
      ['وقت البداية / Start Time', report.session.started_at],
      ['وقت النهاية / End Time', report.session.completed_at || '-'],
      ['المدة / Duration', report.session.duration || '-'],
      ['الموقع / Location', report.session.latitude ? `${report.session.latitude}, ${report.session.longitude}` : 'غير متوفر'],
      [''],
      ['موجودة / Found', report.summary.found],
      ['غير معروفة / Unknown', report.summary.unknown],
      ['غير ممسوحة / Not Scanned', notScanned.length],
      ['إجمالي الممسوحة / Total Scanned', report.summary.total_scanned],
      ['إجمالي في القاعدة / Total in Database', report.summary.total_in_database],
    ];

    // Details sheet
    const detailsHeader = ['رقم اللوحة / Plate', 'الوصف / Description', 'الحالة / Status', 'الوقت / Time', 'الموقع / Location'];
    const detailsData = [detailsHeader];
    for (const r of report.results) {
      const statusAr = r.status === 'found' ? 'موجودة' : 'غير معروفة';
      const loc = r.latitude ? `${r.latitude}, ${r.longitude}` : '-';
      detailsData.push([r.plate_number, r.vehicle_description || '-', statusAr, r.scanned_at || '-', loc]);
    }

    // Not scanned sheet
    const notScannedHeader = ['رقم اللوحة / Plate', 'الوصف / Description'];
    const notScannedData = [notScannedHeader];
    for (const v of notScanned) {
      notScannedData.push([v.plate_number, v.description || '-']);
    }

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
    const ws2 = XLSX.utils.aoa_to_sheet(detailsData);
    const ws3 = XLSX.utils.aoa_to_sheet(notScannedData);
    XLSX.utils.book_append_sheet(wb, ws1, 'ملخص');
    XLSX.utils.book_append_sheet(wb, ws2, 'التفاصيل');
    XLSX.utils.book_append_sheet(wb, ws3, 'غير ممسوحة');

    const buffer = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const dateStr = report.session.date || new Date().toISOString().split('T')[0];
    res.json({ data: buffer, filename: `report_${dateStr}.xlsx` });
  } catch (e) {
    console.error('Excel export error:', e);
    res.status(500).json({ error: 'فشل إنشاء ملف Excel: ' + (e.message || 'خطأ غير معروف') });
  }
});

async function generateReport(sessionId) {
  const db = await getDb();
  const session = await db.prepare(`
    SELECT ss.*, u.name as employee_name
    FROM scan_sessions ss
    JOIN users u ON ss.employee_id = u.id
    WHERE ss.id = ?
  `).get(sessionId);

  if (!session) return null;

  // Add date from started_at
  session.date = session.started_at ? session.started_at.split('T')[0] : new Date().toISOString().split('T')[0];

  // Calculate duration
  if (session.started_at && session.completed_at) {
    const start = new Date(session.started_at);
    const end = new Date(session.completed_at);
    const diffSec = Math.floor((end - start) / 1000);
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    session.duration = mins > 0 ? `${mins} دقيقة ${secs} ثانية` : `${secs} ثانية`;
    session.duration_seconds = diffSec;
  }

  const results = await db.prepare(`
    SELECT sr.*, v.description as vehicle_description
    FROM scan_results sr LEFT JOIN vehicles v ON sr.vehicle_id = v.id
    WHERE sr.session_id = ? ORDER BY sr.scanned_at ASC
  `).all(sessionId);

  const totalInDb = await db.prepare('SELECT COUNT(*) as count FROM vehicles WHERE is_active = 1').get();

  const summary = {
    total_in_database: Number(totalInDb.count),
    total_scanned: results.length,
    found: results.filter(r => r.status === 'found').length,
    unknown: results.filter(r => r.status === 'unknown').length,
  };

  return { session, results, summary };
}

module.exports = router;
