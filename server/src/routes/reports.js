const express = require('express');
const XLSX = require('xlsx');
const { getDb, IS_POSTGRES } = require('../database');
const { authMiddleware, adminOnly } = require('../auth');
const { normalizePlate, findVehicleByPlate } = require('../plateUtils');

const router = express.Router();

// Start scan - no shift required
router.post('/scan/start', authMiddleware, async (req, res) => {
  const { latitude, longitude } = req.body;
  const db = await getDb();

  // Ensure a default shift exists for shiftless scans (shift_id NOT NULL in legacy schema)
  let defaultShift = await db.prepare("SELECT id FROM shifts WHERE name = '__default__'").get();
  if (!defaultShift) {
    const today = new Date().toISOString().split('T')[0];
    const r = await db.prepare("INSERT INTO shifts (date, name, created_by) VALUES (?, ?, ?)").run(today, '__default__', req.user.id);
    defaultShift = { id: r.lastInsertRowid };
  }

  const result = await db.prepare(
    'INSERT INTO scan_sessions (shift_id, employee_id, latitude, longitude) VALUES (?, ?, ?, ?)'
  ).run(defaultShift.id, req.user.id, latitude || null, longitude || null);
  res.status(201).json({ session_id: result.lastInsertRowid });
});

// Plate Recognizer ANPR API proxy
router.post('/scan/plate-recognize', authMiddleware, async (req, res) => {
  const { session_id, image } = req.body;
  if (!session_id || !image) return res.status(400).json({ error: 'session_id and image are required' });

  const db = await getDb();
  const session = await db.prepare('SELECT * FROM scan_sessions WHERE id = ?').get(session_id);
  if (!session) return res.status(404).json({ error: 'Scan session not found' });

  // Get API token from settings
  const tokenRow = await db.prepare('SELECT value FROM app_settings WHERE key = ?').get('plateRecognizerToken');
  if (!tokenRow || !tokenRow.value) {
    return res.status(400).json({ error: 'Plate Recognizer API token not configured. Set it in admin settings.' });
  }

  try {
    const FormData = require('form-data');
    const formData = new FormData();
    // Fix #1c: send raw base64 buffer (no data-URI prefix)
    formData.append('upload', Buffer.from(image, 'base64'), { filename: 'plate.jpg', contentType: 'image/jpeg' });
    formData.append('regions', 'sa');

    const fetch = require('node-fetch');
    const apiResponse = await fetch('https://api.platerecognizer.com/v1/plate-reader/', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${tokenRow.value}`,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      console.error('Plate Recognizer API error:', apiResponse.status, errText);
      // Fix #1c: surface the actual API error back to the client
      return res.status(apiResponse.status).json({
        error: `ANPR API error ${apiResponse.status}: ${errText}`,
      });
    }

    const apiData = await apiResponse.json();
    const results = [];

    for (const result of (apiData.results || [])) {
      const plateText = normalizePlate(result.plate.toUpperCase());
      const confidence = result.score;

      if (!plateText || plateText.length < 2) continue;

      // Check if already submitted in this session
      const existing = await db.prepare('SELECT * FROM scan_results WHERE session_id = ? AND plate_number = ?').get(session_id, plateText);
      if (existing) {
        results.push({ ...existing, duplicate: true, confidence });
        continue;
      }

      // Fix #3: status is simply 'found' if vehicle exists in DB, else 'unknown'.
      // No shift-based 'not_in_shift' logic in employee scan flow.
      const vehicle = await findVehicleByPlate(db, plateText);
      const status = vehicle ? 'found' : 'unknown';

      const insertResult = await db.prepare(
        'INSERT INTO scan_results (session_id, plate_number, vehicle_id, status) VALUES (?, ?, ?, ?)'
      ).run(session_id, plateText, vehicle ? vehicle.id : null, status);
      const scanResult = await db.prepare('SELECT * FROM scan_results WHERE id = ?').get(insertResult.lastInsertRowid);
      results.push({ ...scanResult, duplicate: false, confidence });
    }

    res.json({
      results,
      processing_time: apiData.processing_time,
      total_detected: (apiData.results || []).length,
    });
  } catch (e) {
    console.error('Plate recognition error:', e);
    res.status(500).json({ error: 'Failed to process plate recognition: ' + (e.message || 'Unknown error') });
  }
});

// Submit a scanned plate manually - simplified: found or unknown
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

  // Fix #3: smart vehicle matching — found or unknown only
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
  // Fix #5: use a JS Date ISO string as a parameter instead of inline SQL functions.
  // This works identically on both SQLite and PostgreSQL.
  const completedAt = new Date().toISOString();
  await db.prepare('UPDATE scan_sessions SET completed_at = ? WHERE id = ?').run(completedAt, session_id);
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

  // Fix #4: PostgreSQL returns started_at as a JS Date object, not a string.
  // Handle both cases safely.
  session.date = session.started_at
    ? (session.started_at instanceof Date
        ? session.started_at.toISOString().split('T')[0]
        : String(session.started_at).split('T')[0])
    : new Date().toISOString().split('T')[0];

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
