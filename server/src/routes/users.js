const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../database');
const { generateToken, authMiddleware, adminOnly } = require('../auth');

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
    }

    const db = await getDb();
    const user = await db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    const token = generateToken(user);
    res.json({
      token,
      user: { id: user.id, username: user.username, name: user.name, role: user.role }
    });
  } catch (e) {
    res.status(500).json({ error: 'حدث خطأ في الخادم' });
  }
});

// Get current user profile
router.get('/me', authMiddleware, async (req, res) => {
  const db = await getDb();
  const user = await db.prepare('SELECT id, username, name, role, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// List all users (admin only)
router.get('/', authMiddleware, adminOnly, async (req, res) => {
  const db = await getDb();
  const users = await db.prepare('SELECT id, username, name, role, created_at FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

// Create user (admin only)
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  const { username, password, name, role } = req.body;
  if (!username || !password || !name || !role) {
    return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
  }
  if (!['admin', 'employee'].includes(role)) {
    return res.status(400).json({ error: 'الدور يجب أن يكون admin أو employee' });
  }

  const db = await getDb();
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = await db.prepare(
      'INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)'
    ).run(username, hash, name, role);
    res.status(201).json({ id: result.lastInsertRowid, username, name, role });
  } catch (e) {
    if (e.message && (e.message.includes('UNIQUE') || e.message.includes('duplicate key') || e.code === '23505')) {
      return res.status(409).json({ error: 'اسم المستخدم مستخدم بالفعل' });
    }
    res.status(500).json({ error: 'حدث خطأ في الخادم' });
  }
});

// Delete user (admin only)
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  const db = await getDb();
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'لا يمكنك حذف حسابك الخاص' });
  }
  await db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
