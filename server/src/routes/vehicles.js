const express = require('express');
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

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  const db = await getDb();
  await db.prepare('UPDATE vehicles SET is_active = 0 WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

module.exports = router;
