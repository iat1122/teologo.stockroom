# Stockroom

An inventory dashboard with full CRUD. Express backend, SQLite database (via better-sqlite3), plain HTML/CSS/JS front end.

## Run it

```bash
npm install
npm start
```

Open http://localhost:3000. The database file `stockroom.db` is created on first run and seeded with sample items.

Set `PORT` or `DB_FILE` environment variables to change the port or database location.

## API

| Method | Route | What it does |
| --- | --- | --- |
| GET | `/api/items?search=&category=&sort=&order=` | List items (sort: name, sku, category, quantity, price, updated) |
| GET | `/api/items/:id` | Get one item |
| POST | `/api/items` | Create an item |
| PUT | `/api/items/:id` | Update an item |
| DELETE | `/api/items/:id` | Delete an item |
| GET | `/api/stats` | Totals, stock value by category, restock list |

Item fields: `name`, `sku` (unique), `category`, `quantity`, `reorder_level`, `price`.
Validation errors return `400` with a `details` object keyed by field. A duplicate SKU returns `409`.
