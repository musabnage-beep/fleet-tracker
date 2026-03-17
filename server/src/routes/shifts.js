const express = require('express');
const { getDb } = require('../database');
const { authMiddleware, adminOnly } = require('../auth');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  const db = await getDb();
  const { date } = req.query;
  let shifts;
  if (date) {
    shifts = await db.prepare(`
      SELECT s.*, u.name as created_by_name,
        (SELECT COUNT(*) FROM shift_vehicles WHERE shift_id = s.id) as vehicle_count
      FROM shifts s JOIN users u ON s.created_by = u.id
      WHERE s.date = ? ORDER BY s.created_at DESC
    `).all(date);
  } else {
    shifts = await db.prepare(`
      SELECT s.*, u.name as created_by_name,
        (SELECT COUNT(*) FROM shift_vehicles WHERE shift_id = s.id) as vehicle_count
      FROM shifts s JOIN users u ON s.created_by = u.id
      ORDER BY s.date DESC, s.created_at DESC LIMIT 50
    `).all();
  }
  res.json(shifts);
});

router.get('/today/active', authMiddleware, async (req, res) => {
  const db = await getDb();
  const today = new Date().toISOString().split('T')[0];
  const shifts = await db.prepare(`
    SELECT s.*, u.name as created_by_name,
      (SELECT COUNT(*) FROM shift_vehicles WHERE shift_id = s.id) as vehicle_count
    FROM shifts s JOIN users u ON s.created_by = u.id
    WHERE s.date = ? ORDER BY s.created_at DESC
  `).all(today);

  if (shifts.length === 0) return res.json({ shift: null, vehicles: [] });

  const shift = shifts[0];
  const vehicles = await db.prepare(`
    SELECT sv.*, v.plate_number, v.description
    FROM shift_vehicles sv JOIN vehicles v ON sv.vehicle_id = v.id
    WHERE sv.shift_id = ?
  `).all(shift.id);
  res.json({ shift, vehicles });
});

router.get('/:id', authMiddleware, async (req, res) => {
  const db = await getDb();
  const shift = await db.prepare(`
    SELECT s.*, u.name as created_by_name
    FROM shifts s JOIN users u ON s.created_by = u.id WHERE s.id = ?
  `).get(Number(req.params.id));
  if (!shift) return res.status(404).json({ error: 'الوردية غير موجودة' });

  const vehicles = await db.prepare(`
    SELECT sv.*, v.plate_number, v.description
    FROM shift_vehicles sv JOIN vehicles v ON sv.vehicle_id = v.id WHERE sv.shift_id = ?
  `).all(Number(req.params.id));
  res.json({ ...shift, vehicles });
});

router.post('/', authMiddleware, adminOnly, async (req, res) => {
  const { date, name, vehicle_ids } = req.body;
  if (!date || !name) return res.status(400).json({ error: 'التاريخ واسم الوردية مطلوبان' });

  const db = await getDb();
  try {
    const run = db.transaction(async () => {
      const result = await db.prepare('INSERT INTO shifts (date, name, created_by) VALUES (?, ?, ?)').run(date, name, req.user.id);
      const shiftId = result.lastInsertRowid;
      if (vehicle_ids && vehicle_ids.length > 0) {
        for (const vid of vehicle_ids) {
          const vehicleId = typeof vid === 'object' ? vid.id : vid;
          const routeInfo = typeof vid === 'object' ? (vid.route_info || '') : '';
          await db.prepare('INSERT INTO shift_vehicles (shift_id, vehicle_id, route_info) VALUES (?, ?, ?)').run(shiftId, vehicleId, routeInfo);
        }
      }
      return shiftId;
    });
    const shiftId = await run();
    const shift = await db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId);
    const vehicles = await db.prepare(`
      SELECT sv.*, v.plate_number, v.description
      FROM shift_vehicles sv JOIN vehicles v ON sv.vehicle_id = v.id WHERE sv.shift_id = ?
    `).all(shiftId);
    res.status(201).json({ ...shift, vehicles });
  } catch (e) {
    res.status(500).json({ error: 'حدث خطأ في إنشاء الوردية' });
  }
});

router.put('/:id/vehicles', authMiddleware, adminOnly, async (req, res) => {
  const { vehicle_ids } = req.body;
  const db = await getDb();
  const shift = await db.prepare('SELECT * FROM shifts WHERE id = ?').get(Number(req.params.id));
  if (!shift) return res.status(404).json({ error: 'الوردية غير موجودة' });

  try {
    const run = db.transaction(async () => {
      await db.prepare('DELETE FROM shift_vehicles WHERE shift_id = ?').run(Number(req.params.id));
      for (const vid of vehicle_ids) {
        const vehicleId = typeof vid === 'object' ? vid.id : vid;
        const routeInfo = typeof vid === 'object' ? (vid.route_info || '') : '';
        await db.prepare('INSERT INTO shift_vehicles (shift_id, vehicle_id, route_info) VALUES (?, ?, ?)').run(Number(req.params.id), vehicleId, routeInfo);
      }
    });
    await run();
    const vehicles = await db.prepare(`
      SELECT sv.*, v.plate_number, v.description
      FROM shift_vehicles sv JOIN vehicles v ON sv.vehicle_id = v.id WHERE sv.shift_id = ?
    `).all(Number(req.params.id));
    res.json({ ...shift, vehicles });
  } catch (e) {
    res.status(500).json({ error: 'حدث خطأ في تحديث الوردية' });
  }
});

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  const db = await getDb();
  await db.prepare('DELETE FROM shifts WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

module.exports = router;
