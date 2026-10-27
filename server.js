
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";
import rateLimit from "express-rate-limit";

const app = express();
const { Pool } = pg;

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;

if (!JWT_SECRET || JWT_SECRET.length < 32 || !DATABASE_URL) {
  throw new Error("Missing DATABASE_URL or secure JWT_SECRET");
}

const allowedOrigins = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map(x => x.trim())
  .filter(Boolean);

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSL === "true"
    ? { rejectUnauthorized: false }
    : undefined
});

app.set("trust proxy", 1);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error("Origin not allowed"));
  },
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "10kb" }));

app.use("/api/auth", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false
}));

app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 180,
  standardHeaders: true,
  legacyHeaders: false
}));

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id BIGSERIAL PRIMARY KEY,
      uid VARCHAR(30) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wishlist_items (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL
        REFERENCES app_users(id) ON DELETE CASCADE,
      item_id VARCHAR(20) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, item_id)
    );

    CREATE INDEX IF NOT EXISTS wishlist_user_idx
      ON wishlist_items(user_id);
  `);
}

const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const validUid = value =>
  typeof value === "string" && /^[0-9]{1,30}$/.test(value);

const validItem = value =>
  typeof value === "string" && /^[0-9]{1,20}$/.test(value);

function createToken(user) {
  return jwt.sign(
    { uid: user.uid },
    JWT_SECRET,
    {
      subject: String(user.id),
      expiresIn: "7d",
      issuer: "ff-wishlist"
    }
  );
}

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer (.+)$/i);

  if (!match) {
    return res.status(401).json({
      error: "Vui lòng đăng nhập."
    });
  }

  try {
    req.user = jwt.verify(match[1], JWT_SECRET, {
      issuer: "ff-wishlist"
    });
    next();
  } catch {
    res.status(401).json({
      error: "Phiên đăng nhập hết hạn."
    });
  }
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "FF Wishlist API" });
});

// Đăng ký tài khoản Wishlist riêng.
// password KHÔNG phải mật khẩu Free Fire.
app.post("/api/auth/register", asyncHandler(async (req, res) => {
  const { uid, password } = req.body || {};

  if (!validUid(uid)) {
    return res.status(400).json({
      error: "UID phải gồm 1–30 chữ số."
    });
  }

  if (
    typeof password !== "string" ||
    password.length < 10 ||
    password.length > 72
  ) {
    return res.status(400).json({
      error: "Mật khẩu Wishlist phải dài 10–72 ký tự."
    });
  }

  const hash = await bcrypt.hash(password, 12);

  try {
    const result = await pool.query(
      `INSERT INTO app_users(uid, password_hash)
       VALUES($1, $2)
       RETURNING id, uid`,
      [uid, hash]
    );

    const user = result.rows[0];

    res.status(201).json({
      token: createToken(user),
      uid: user.uid
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: "UID đã đăng ký Wishlist."
      });
    }
    throw error;
  }
}));

app.post("/api/auth/login", asyncHandler(async (req, res) => {
  const { uid, password } = req.body || {};

  if (!validUid(uid) || typeof password !== "string") {
    return res.status(400).json({
      error: "Thông tin đăng nhập không hợp lệ."
    });
  }

  const result = await pool.query(
    "SELECT id, uid, password_hash FROM app_users WHERE uid = $1",
    [uid]
  );

  const user = result.rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({
      error: "UID hoặc mật khẩu Wishlist không đúng."
    });
  }

  res.json({
    token: createToken(user),
    uid: user.uid
  });
}));

app.get("/api/me", authenticate, (req, res) => {
  res.json({ uid: req.user.uid });
});

app.get("/api/wishlist", authenticate, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT item_id AS "itemId",
            created_at AS "createdAt"
     FROM wishlist_items
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [req.user.sub]
  );

  res.json({
    items: result.rows,
    limit: 100
  });
}));

app.post("/api/wishlist", authenticate, asyncHandler(async (req, res) => {
  const { itemId } = req.body || {};

  if (!validItem(itemId)) {
    return res.status(400).json({
      error: "ID item phải gồm 1–20 chữ số."
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Khóa theo user để tránh vượt giới hạn khi có yêu cầu đồng thời.
    await client.query(
      "SELECT id FROM app_users WHERE id = $1 FOR UPDATE",
      [req.user.sub]
    );

    const count = await client.query(
      "SELECT COUNT(*)::int AS total FROM wishlist_items WHERE user_id = $1",
      [req.user.sub]
    );

    if (count.rows[0].total >= 100) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "Wishlist đã đủ 100 item."
      });
    }

    const result = await client.query(
      `INSERT INTO wishlist_items(user_id, item_id)
       VALUES($1, $2)
       ON CONFLICT(user_id, item_id) DO NOTHING
       RETURNING item_id AS "itemId", created_at AS "createdAt"`,
      [req.user.sub, itemId]
    );

    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "Item đã có trong Wishlist."
      });
    }

    await client.query("COMMIT");
    res.status(201).json({ item: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.delete(
  "/api/wishlist/:itemId",
  authenticate,
  asyncHandler(async (req, res) => {
    const { itemId } = req.params;

    if (!validItem(itemId)) {
      return res.status(400).json({
        error: "ID item không hợp lệ."
      });
    }

    const result = await pool.query(
      `DELETE FROM wishlist_items
       WHERE user_id = $1 AND item_id = $2`,
      [req.user.sub, itemId]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        error: "Không tìm thấy item."
      });
    }

    res.json({ ok: true });
  })
);

app.delete("/api/wishlist", authenticate, asyncHandler(async (req, res) => {
  await pool.query(
    "DELETE FROM wishlist_items WHERE user_id = $1",
    [req.user.sub]
  );

  res.json({ ok: true });
}));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err.message === "Origin not allowed") {
    return res.status(403).json({
      error: "Origin không được phép."
    });
  }

  console.error(err);
  res.status(500).json({
    error: "Lỗi máy chủ."
  });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`FF Wishlist API listening on ${PORT}`);
    });
  })
  .catch(error => {
    console.error("Database initialization failed:", error);
    process.exit(1);
  });
