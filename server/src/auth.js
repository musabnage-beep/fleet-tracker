const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'fleet-tracker-secret-key-change-in-production';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'غير مصرح - يرجى تسجيل الدخول' });
  }

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'جلسة منتهية - يرجى تسجيل الدخول مجدداً' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'هذا الإجراء متاح للمدير فقط' });
  }
  next();
}

module.exports = { generateToken, authMiddleware, adminOnly, JWT_SECRET };
