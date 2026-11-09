const path = require('path');
const express = require('express');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'stockroom.db');


const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    sku           TEXT    NOT NULL UNIQUE,
    category      TEXT    NOT NULL,
    quantity      INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    reorder_level INTEGER NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
    price         REAL    NOT NULL DEFAULT 0 CHECK (price >= 0),
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);


if (db.prepare('SELECT COUNT(*) AS n FROM items').get().n === 0) {
  const seed = db.prepare(`
    INSERT INTO items (name, sku, category, quantity, reorder_level, price)
    VALUES (@name, @sku, @category, @quantity, @reorder_level, @price)
  `);
  const rows = [
    { name: 'Hex key set, 9 piece', sku: 'TLS-1001', category: 'Tools', quantity: 42, reorder_level: 15, price: 8.5 },
    { name: 'Cordless drill 18V', sku: 'TLS-1002', category: 'Tools', quantity: 6, reorder_level: 8, price: 89.0 },
    { name: 'Measuring tape 5 m', sku: 'TLS-1003', category: 'Tools', quantity: 58, reorder_level: 20, price: 6.25 },
    { name: 'Wood screws 4x40 mm, box of 200', sku: 'FST-2001', category: 'Fasteners', quantity: 120, reorder_level: 40, price: 4.9 },
    { name: 'Hex bolts M8, box of 50', sku: 'FST-2002', category: 'Fasteners', quantity: 0, reorder_level: 25, price: 7.8 },
    { name: 'Wall anchors, pack of 100', sku: 'FST-2003', category: 'Fasteners', quantity: 33, reorder_level: 30, price: 3.2 },
    { name: 'Safety glasses', sku: 'SAF-3001', category: 'Safety', quantity: 75, reorder_level: 30, price: 3.75 },
    { name: 'Work gloves, large', sku: 'SAF-3002', category: 'Safety', quantity: 14, reorder_level: 20, price: 5.5 },
    { name: 'Dust masks, box of 20', sku: 'SAF-3003', category: 'Safety', quantity: 48, reorder_level: 15, price: 9.9 },
    { name: 'Interior paint white 4 L', sku: 'PNT-4001', category: 'Paint', quantity: 22, reorder_level: 10, price: 24.0 },
    { name: 'Paint roller kit', sku: 'PNT-4002', category: 'Paint', quantity: 9, reorder_level: 12, price: 11.4 },
    { name: 'Masking tape 48 mm', sku: 'PNT-4003', category: 'Paint', quantity: 64, reorder_level: 25, price: 2.6 },
  ];
  db.transaction(() => rows.forEach((r) => seed.run(r)))();
}


const toNumber = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

function validate(body = {}) {
  const errors = {};
  const name = String(body.name ?? '').trim();
  const sku = String(body.sku ?? '').trim().toUpperCase();
  const category = String(body.category ?? '').trim();
  const quantity = toNumber(body.quantity);
  const reorder = toNumber(body.reorder_level);
  const price = toNumber(body.price);

  if (!name) errors.name = 'Enter an item name.';
  else if (name.length > 120) errors.name = 'Keep the name under 120 characters.';

  if (!sku) errors.sku = 'Enter a SKU.';
  else if (sku.length > 40) errors.sku = 'Keep the SKU under 40 characters.';

  if (!category) errors.category = 'Enter a category.';
  else if (category.length > 60) errors.category = 'Keep the category under 60 characters.';

  if (!Number.isInteger(quantity) || quantity < 0) errors.quantity = 'Quantity must be a whole number, 0 or more.';
  if (!Number.isInteger(reorder) || reorder < 0) errors.reorder_level = 'Reorder level must be a whole number, 0 or more.';
  if (!Number.isFinite(price) || price < 0) errors.price = 'Price must be 0 or more.';

  return {
    errors,
    value: {
      name,
      sku,
      category,
      quantity,
      reorder_level: reorder,
      price: Math.round(price * 100) / 100,
    },
  };
}


const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SORT_COLUMNS = {
  name: 'name',
  sku: 'sku',
  category: 'category',
  quantity: 'quantity',
  price: 'price',
  updated: 'updated_at',
};

app.get('/api/items', (req, res) => {
  const { search = '', category = '', sort = 'name', order = 'asc' } = req.query;
  const column = SORT_COLUMNS[sort] || 'name';
  const direction = order === 'desc' ? 'DESC' : 'ASC';

  const where = [];
  const params = {};
  if (search) {
    where.push('(name LIKE @q OR sku LIKE @q)');
    params.q = `%${search}%`;
  }
  if (category) {
    where.push('category = @category');
    params.category = category;
  }

  const sql = `
    SELECT * FROM items
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${column} COLLATE NOCASE ${direction}, id ASC
  `;
  res.json(db.prepare(sql).all(params));
});


app.get('/api/items/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  res.json(item);
});


app.post('/api/items', (req, res) => {
  const { errors, value } = validate(req.body);
  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Fix the highlighted fields.', details: errors });
  }
  try {
    const info = db
      .prepare(`
        INSERT INTO items (name, sku, category, quantity, reorder_level, price)
        VALUES (@name, @sku, @category, @quantity, @reorder_level, @price)
      `)
      .run(value);
    const created = db.prepare('SELECT * FROM items WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    handleDbError(err, res);
  }
});


app.put('/api/items/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found.' });

  const { errors, value } = validate(req.body);
  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Fix the highlighted fields.', details: errors });
  }
  try {
    db.prepare(`
      UPDATE items
      SET name = @name, sku = @sku, category = @category,
          quantity = @quantity, reorder_level = @reorder_level, price = @price,
          updated_at = datetime('now')
      WHERE id = @id
    `).run({ ...value, id: req.params.id });
    res.json(db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id));
  } catch (err) {
    handleDbError(err, res);
  }
});


app.delete('/api/items/:id', (req, res) => {
  const info = db.prepare('DELETE FROM items WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Item not found.' });
  res.status(204).end();
});

app.get('/api/stats', (req, res) => {
  const totals = db
    .prepare(`
      SELECT COUNT(*) AS items,
             COALESCE(SUM(quantity), 0) AS units,
             COALESCE(SUM(quantity * price), 0) AS value,
             COALESCE(SUM(CASE WHEN quantity <= reorder_level THEN 1 ELSE 0 END), 0) AS low
      FROM items
    `)
    .get();

  const byCategory = db
    .prepare(`
      SELECT category, COUNT(*) AS items,
             SUM(quantity) AS units,
             SUM(quantity * price) AS value
      FROM items
      GROUP BY category
      ORDER BY value DESC
    `)
    .all();

  const restock = db
    .prepare(`
      SELECT id, name, sku, quantity, reorder_level
      FROM items
      WHERE quantity <= reorder_level
      ORDER BY (quantity - reorder_level) ASC, name ASC
      LIMIT 6
    `)
    .all();

  res.json({ totals, byCategory, restock });
});

function handleDbError(err, res) {
  if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({
      error: 'Fix the highlighted fields.',
      details: { sku: 'This SKU is already in use.' },
    });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
}


app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.listen(PORT, () => {
  console.log(`Stockroom is running at http://localhost:${PORT}`);
});
