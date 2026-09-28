const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const os = require('os');

const app = express();
app.use(express.json());
app.use(cors());

// Connect using environment variable DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://admin:password123@database:5432/crud_db'
});

// Initialize database table (and add new columns to tables created by older versions)
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL
    )
  `);
  await pool.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`);
  await pool.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
}
initDb().catch(err => console.error('Database init error:', err));

function validate(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!name) return { error: 'Name is required' };
  if (name.length > 255) return { error: 'Name must be 255 characters or less' };
  return { name, description };
}

// Reject non-numeric ids before they reach the database
app.param('id', (req, res, next, id) => {
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid id' });
  next();
});

// GET /health - Container + database status for the landing page
app.get('/health', async (req, res) => {
  const started = Date.now();
  let database = 'down';
  let count = null;
  try {
    const result = await pool.query('SELECT COUNT(*)::int AS count FROM items');
    database = 'up';
    count = result.rows[0].count;
  } catch (err) {
    console.error(err);
  }
  res.status(database === 'up' ? 200 : 503).json({
    backend: 'up',
    database,
    items: count,
    container: os.hostname(),
    node: process.version,
    uptime: Math.round(process.uptime()),
    latencyMs: Date.now() - started
  });
});

// GET /items - Retrieve all items
app.get('/items', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM items ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /items/:id - Retrieve one item
app.get('/items/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM items WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /items - Add a new item
app.post('/items', async (req, res) => {
  const data = validate(req.body);
  if (data.error) return res.status(400).json(data);

  try {
    const result = await pool.query(
      'INSERT INTO items (name, description) VALUES ($1, $2) RETURNING *',
      [data.name, data.description]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /items/:id - Update an item
app.put('/items/:id', async (req, res) => {
  const data = validate(req.body);
  if (data.error) return res.status(400).json(data);

  try {
    const result = await pool.query(
      'UPDATE items SET name = $1, description = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      [data.name, data.description, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /items/:id - Delete an item
app.delete('/items/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM items WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found' });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
