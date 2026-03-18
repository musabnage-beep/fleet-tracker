const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// Detect mode: PostgreSQL (cloud) or SQLite (local)
const DATABASE_URL = process.env.DATABASE_URL;
const IS_POSTGRES = !!DATABASE_URL;

const DB_PATH = path.join(__dirname, '..', 'data', 'fleet.db');

let db = null;
let rawDb = null;
let pgPool = null;
let saveTimeout = null;

// ==========================================
// SQLite Implementation (Local Mode)
// ==========================================
function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    if (rawDb) {
      const data = rawDb.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    }
  }, 500);
}

function createSqliteWrapper(database) {
  return {
    async exec(sql) {
      database.run(sql);
      scheduleSave();
    },
    prepare(sql) {
      return {
        async run(...params) {
          database.run(sql, params);
          scheduleSave();
          const result = database.exec('SELECT last_insert_rowid() as id');
          return { lastInsertRowid: result.length > 0 ? result[0].values[0][0] : 0 };
        },
        async get(...params) {
          const stmt = database.prepare(sql);
          stmt.bind(params);
          if (stmt.step()) {
            const cols = stmt.getColumnNames();
            const vals = stmt.get();
            stmt.free();
            const row = {};
            cols.forEach((c, i) => { row[c] = vals[i]; });
            return row;
          }
          stmt.free();
          return undefined;
        },
        async all(...params) {
          const rows = [];
          const stmt = database.prepare(sql);
          stmt.bind(params);
          while (stmt.step()) {
            const cols = stmt.getColumnNames();
            const vals = stmt.get();
            const row = {};
            cols.forEach((c, i) => { row[c] = vals[i]; });
            rows.push(row);
          }
          stmt.free();
          return rows;
        },
      };
    },
    transaction(fn) {
      return async (...args) => {
        database.run('BEGIN TRANSACTION');
        try {
          const result = await fn(...args);
          database.run('COMMIT');
          scheduleSave();
          return result;
        } catch (e) {
          database.run('ROLLBACK');
          throw e;
        }
      };
    },
  };
}

async function initSqlite() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  if (fs.existsSync(DB_PATH)) {
    rawDb = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    rawDb = new SQL.Database();
  }
  return createSqliteWrapper(rawDb);
}

// ==========================================
// PostgreSQL Implementation (Cloud Mode)
// ==========================================
function createPgWrapper(pool) {
  function convertPlaceholders(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  }

  // Convert datetime('now') to NOW() for PostgreSQL
  function convertSqlSyntax(sql) {
    return sql.replace(/datetime\('now'\)/gi, 'NOW()');
  }

  return {
    async exec(sql) {
      const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
      for (const stmt of statements) {
        await pool.query(stmt);
      }
    },
    prepare(sql) {
      const pgSql = convertSqlSyntax(convertPlaceholders(sql));
      return {
        async run(...params) {
          // Try with RETURNING id first, fall back without
          try {
            const r = await pool.query(pgSql + ' RETURNING id', params);
            return { lastInsertRowid: r.rows[0] ? r.rows[0].id : 0 };
          } catch {
            await pool.query(pgSql, params);
            return { lastInsertRowid: 0 };
          }
        },
        async get(...params) {
          const r = await pool.query(pgSql, params);
          return r.rows[0] || undefined;
        },
        async all(...params) {
          const r = await pool.query(pgSql, params);
          return r.rows;
        },
      };
    },
    transaction(fn) {
      return async (...args) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await fn(...args);
          await client.query('COMMIT');
          return result;
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }
      };
    },
  };
}

async function initPostgres() {
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  return createPgWrapper(pgPool);
}

// ==========================================
// Unified Interface
// ==========================================
async function getDb() {
  if (db) return db;
  if (IS_POSTGRES) {
    db = await initPostgres();
  } else {
    db = await initSqlite();
  }
  return db;
}

async function initializeDatabase() {
  const db = await getDb();

  if (IS_POSTGRES) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'employee')),
        device_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)`);
    await db.exec(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id SERIAL PRIMARY KEY,
        plate_number TEXT UNIQUE NOT NULL,
        description TEXT DEFAULT '',
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.exec(`
      CREATE TABLE IF NOT EXISTS shifts (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        name TEXT NOT NULL,
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.exec(`
      CREATE TABLE IF NOT EXISTS shift_vehicles (
        id SERIAL PRIMARY KEY,
        shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
        vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
        route_info TEXT DEFAULT '',
        UNIQUE(shift_id, vehicle_id)
      )
    `);
    await db.exec(`
      CREATE TABLE IF NOT EXISTS scan_sessions (
        id SERIAL PRIMARY KEY,
        shift_id INTEGER NOT NULL REFERENCES shifts(id),
        employee_id INTEGER NOT NULL REFERENCES users(id),
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);
    await db.exec(`
      CREATE TABLE IF NOT EXISTS scan_results (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES scan_sessions(id) ON DELETE CASCADE,
        plate_number TEXT NOT NULL,
        vehicle_id INTEGER REFERENCES vehicles(id),
        status TEXT NOT NULL CHECK(status IN ('found', 'not_in_shift', 'unknown')),
        scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } else {
    await db.exec(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'employee')),
      device_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)`);
    await db.exec(`CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plate_number TEXT UNIQUE NOT NULL,
      description TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.exec(`CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      name TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`);
    await db.exec(`CREATE TABLE IF NOT EXISTS shift_vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL,
      vehicle_id INTEGER NOT NULL,
      route_info TEXT DEFAULT '',
      FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
      UNIQUE(shift_id, vehicle_id)
    )`);
    await db.exec(`CREATE TABLE IF NOT EXISTS scan_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (shift_id) REFERENCES shifts(id),
      FOREIGN KEY (employee_id) REFERENCES users(id)
    )`);
    await db.exec(`CREATE TABLE IF NOT EXISTS scan_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      plate_number TEXT NOT NULL,
      vehicle_id INTEGER,
      status TEXT NOT NULL CHECK(status IN ('found', 'not_in_shift', 'unknown')),
      scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES scan_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
    )`);
  }

  // Add device_id column if not exists (for existing databases)
  try { await db.exec(`ALTER TABLE users ADD COLUMN device_id TEXT`); } catch(e) {}

  // Create default users if none exist
  const userCount = await db.prepare('SELECT COUNT(*) as count FROM users').get();
  const count = Number(userCount.count);
  if (count === 0) {
    const adminHash = bcrypt.hashSync('admin123', 10);
    const empHash = bcrypt.hashSync('employee123', 10);

    if (IS_POSTGRES) {
      await db.prepare('INSERT INTO users (username, password_hash, name, role) VALUES ($1, $2, $3, $4)').run('admin', adminHash, 'مدير النظام', 'admin');
      await db.prepare('INSERT INTO users (username, password_hash, name, role) VALUES ($1, $2, $3, $4)').run('employee', empHash, 'موظف 1', 'employee');
    } else {
      await db.prepare('INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)').run('admin', adminHash, 'مدير النظام', 'admin');
      await db.prepare('INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)').run('employee', empHash, 'موظف 1', 'employee');
    }

    console.log('Default users created:');
    console.log('  Admin: admin / admin123');
    console.log('  Employee: employee / employee123');
  }

  return db;
}

module.exports = { getDb, initializeDatabase, IS_POSTGRES };
