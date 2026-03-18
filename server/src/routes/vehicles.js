const express = require('express');
const XLSX = require('xlsx');
const { getDb } = require('../database');
const { authMiddleware, adminOnly } = require('../auth');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  const db = await getDb();
  const vehicles = await db.prepare('SELECT * FROM vehicles WHERE is_active = 1 ORDER BY created_at DESC').all();
  res.json(vehicles);
});

router.get('/:id', authMiddleware, async (req, res) => {
  const db = await getDb();
  const vehicle = await db.prepare('SELECT * FROM vehicles WHERE id = ?').get(Number(req.params.id));
  if (!vehicle) return res.status(404).json({ error: 'السيارة غير موجودة' });
  res.json(vehicle);
});

router.post('/', authMiddleware, adminOnly, async (req, res) => {
  const { plate_number, description } = req.body;
  if (!plate_number) return res.status(400).json({ error: 'رقم اللوحة مطلوب' });

  const db = await getDb();
  try {
    const result = await db.prepare(
      'INSERT INTO vehicles (plate_number, description) VALUES (?, ?)'
    ).run(plate_number.trim().toUpperCase(), description || '');
    const vehicle = await db.prepare('SELECT * FROM vehicles WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(vehicle);
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE') || e.message.includes('duplicate key') || e.code === '23505') {
      return res.status(409).json({ error: 'رقم اللوحة مسجل بالفعل' });
    }
    res.status(500).json({ error: 'حدث خطأ في الخادم' });
  }
});

router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  const { plate_number, description } = req.body;
  const db = await getDb();
  const existing = await db.prepare('SELECT * FROM vehicles WHERE id = ?').get(Number(req.params.id));
  if (!existing) return res.status(404).json({ error: 'السيارة غير موجودة' });

  try {
    await db.prepare('UPDATE vehicles SET plate_number = ?, description = ? WHERE id = ?').run(
      plate_number ? plate_number.trim().toUpperCase() : existing.plate_number,
      description !== undefined ? description : existing.description,
      Number(req.params.id)
    );
    const vehicle = await db.prepare('SELECT * FROM vehicles WHERE id = ?').get(Number(req.params.id));
    res.json(vehicle);
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE') || e.message.includes('duplicate key') || e.code === '23505') {
      return res.status(409).json({ error: 'رقم اللوحة مسجل بالفعل' });
    }
    res.status(500).json({ error: 'حدث خطأ في الخادم' });
  }
});

// Bulk import from Excel file (base64)
router.post('/import-file', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { fileData } = req.body;
    if (!fileData) {
      return res.status(400).json({ error: 'لا يوجد ملف' });
    }

    // Parse Excel file from base64 on the server (where Buffer is available)
    const buffer = Buffer.from(fileData, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'الملف فارغ' });
    }

    // Detect columns
    let plateCol = 0;
    let descCol = 1;
    const firstRow = rows[0];
    let hasHeader = false;

    if (Array.isArray(firstRow)) {
      for (let i = 0; i < firstRow.length; i++) {
        const val = String(firstRow[i] || '').toLowerCase();
        if (val.includes('plate') || val.includes('لوحة') || val.includes('رقم')) {
          plateCol = i;
          hasHeader = true;
        }
        if (val.includes('desc') || val.includes('وصف') || val.includes('ملاحظ')) {
          descCol = i;
          hasHeader = true;
        }
      }
    }

    const dataRows = hasHeader ? rows.slice(1) : rows;
    const vehicles = dataRows
      .filter(row => row && row[plateCol])
      .map(row => ({
        plate_number: String(row[plateCol]).trim(),
        description: row[descCol] ? String(row[descCol]).trim() : '',
      }));

    if (vehicles.length === 0) {
      return res.status(400).json({ error: 'لا توجد بيانات صالحة في الملف' });
    }

    // Insert vehicles
    const db = await getDb();
    let added = 0;
    let duplicates = 0;
    let errors = 0;

    for (const v of vehicles) {
      if (!v.plate_number.trim()) {
        errors++;
        continue;
      }
      try {
        await db.prepare(
          'INSERT INTO vehicles (plate_number, description) VALUES (?, ?)'
        ).run(v.plate_number.trim().toUpperCase(), v.description || '');
        added++;
      } catch (e) {
        if (e.message && (e.message.includes('UNIQUE') || e.message.includes('duplicate key') || e.code === '23505')) {
          duplicates++;
        } else {
          errors++;
        }
      }
    }

    res.json({ added, duplicates, errors, total: vehicles.length });
  } catch (e) {
    console.error('Import file error:', e);
    res.status(500).json({ error: 'فشل قراءة الملف: ' + (e.message || 'خطأ غير معروف') });
  }
});

// Bulk import from JSON array (legacy)
router.post('/import', authMiddleware, adminOnly, async (req, res) => {
  const { vehicles } = req.body;
  if (!vehicles || !Array.isArray(vehicles) || vehicles.length === 0) {
    return res.status(400).json({ error: 'لا توجد بيانات للاستيراد' });
  }

  const db = await getDb();
  let added = 0;
  let duplicates = 0;
  let errors = 0;

  for (const v of vehicles) {
    if (!v.plate_number || !v.plate_number.trim()) {
      errors++;
      continue;
    }
    try {
      await db.prepare(
        'INSERT INTO vehicles (plate_number, description) VALUES (?, ?)'
      ).run(v.plate_number.trim().toUpperCase(), v.description || '');
      added++;
    } catch (e) {
      if (e.message && (e.message.includes('UNIQUE') || e.message.includes('duplicate key') || e.code === '23505')) {
        duplicates++;
      } else {
        errors++;
      }
    }
  }

  res.json({ added, duplicates, errors, total: vehicles.length });
});

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  const db = await getDb();
  await db.prepare('UPDATE vehicles SET is_active = 0 WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

module.exports = router;
