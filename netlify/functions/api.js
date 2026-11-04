const express = require('express');
const serverless = require('serverless-http');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Neon.tech ulanish sozlamasi
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'smena_maxfiy_kaliti_2026';

// AUTH MIDDLEWARE
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token topilmadi' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token yaroqsiz' });
    req.user = user;
    next();
  });
};

// 1. LOGIN API
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.status(400).json({ error: 'Foydalanuvchi topilmadi' });
    
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(400).json({ error: 'Noto\'g\'ri parol' });
    
    const token = jwt.sign(
      { id: user.id, role: user.role, smena_raqami: user.smena_raqami }, 
      JWT_SECRET, 
      { expiresIn: '30d' }
    );
    
    res.json({ token, role: user.role, smena_raqami: user.smena_raqami, username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. MA'LUMOTLARNI OLISH (Xodimlar va Yo'nalishlar)
app.get('/api/resurslar', authenticateToken, async (req, res) => {
  try {
    const xodimlar = await pool.query('SELECT * FROM xodimlar ORDER BY ism_familiya ASC');
    const yonalishlar = await pool.query('SELECT * FROM yonalishlar ORDER BY nomi ASC');
    res.json({ xodimlar: xodimlar.rows, yonalishlar: yonalishlar.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. SMENA BOSHLIG'I: Xodimni yo'nalishga biriktirish (09:00 - 09:00)
app.post('/api/smena/taqsimot', authenticateToken, async (req, res) => {
  const { sana, xodim_id, yonalish_id } = req.body;
  const { role, smena_raqami, id: user_id } = req.user;

  if (role !== 'smena_boshligi' && role !== 'superadmin') {
    return res.status(403).json({ error: 'Ruxsat berilmagan' });
  }

  // Agar superadmin bo'lsa, so'rovdan kelgan smenani oladi, bo'lmasa o'z smenasi
  const targetSmena = role === 'superadmin' ? req.body.smena_raqami : smena_raqami;

  try {
    const result = await pool.query(
      `INSERT INTO smena_taqsimoti (sana, smena_raqami, xodim_id, yonalish_id, kiritdi_user_id) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (sana, xodim_id) 
       DO UPDATE SET smena_raqami = $2, yonalish_id = $4, kiritdi_user_id = $5
       RETURNING *`,
      [sana, targetSmena, xodim_id, yonalish_id, user_id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Taqsimotda xatolik yuz berdi.' });
  }
});

// 4. HAFTALIK VA OYLIK HISOBOTLAR
app.get('/api/hisobot', authenticateToken, async (req, res) => {
  const { bosh_sana, tugash_sana, xodim_id, smena_raqami } = req.query;
  try {
    let query = `
      SELECT st.sana, st.smena_raqami, x.ism_familiya, y.nomi as yonalish_nomi, u.username as boshliq_nomi
      FROM smena_taqsimoti st
      JOIN xodimlar x ON st.xodim_id = x.id
      JOIN yonalishlar y ON st.yonalish_id = y.id
      JOIN users u ON st.kiritdi_user_id = u.id
      WHERE st.sana BETWEEN $1 AND $2
    `;
    let params = [bosh_sana, tugash_sana];
    
    if (xodim_id) {
      params.push(xodim_id);
      query += ` AND st.xodim_id = $${params.length}`;
    }
    if (smena_raqami) {
      params.push(smena_raqami);
      query += ` AND st.smena_raqami = $${params.length}`;
    }
    
    query += ' ORDER BY st.sana DESC, st.smena_raqami ASC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports.handler = serverless(app);
