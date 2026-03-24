const jwt = require('jsonwebtoken');

const IS_POSTGRES = !!process.env.DATABASE_URL;

// Fix #7: In production (PostgreSQL) require JWT_SECRET to be set explicitly.
// Fail fast at startup rather than running with a weak secret.
if (IS_POSTGRES && !process.env.JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET environment variable is not set.');
  console.error('Go to Render → your service → Environment → Add environment variable.');
  console.error('Example: JWT_SECRET=<run: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))")>');
  process.exit(1);
}

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
