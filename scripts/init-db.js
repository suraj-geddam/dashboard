const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

const dbPath = path.join(dataDir, 'dashboard.db');
const db = new Database(dbPath);

console.log('Initializing database at', dbPath);

const createOrdersTable = `
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    created_at TEXT,
    store_name TEXT,
    delivery_time TEXT,
    delivery_address TEXT,
    total_amount REAL
);
`;

const createOrderItemsTable = `
CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT,
    item_name TEXT,
    category TEXT,
    unit_price REAL,
    quantity INTEGER,
    subtotal REAL,
    FOREIGN KEY(order_id) REFERENCES orders(id)
);
`;

const createConfigTable = `
CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
);
`;

const createStoreMetadataTable = `
CREATE TABLE IF NOT EXISTS store_metadata (
    store_name TEXT PRIMARY KEY,
    cuisine_type TEXT,
    store_category TEXT,
    price_range TEXT,
    enriched_at TEXT,
    enrichment_source TEXT,
    raw_llm_response TEXT
);
`;

const createStoreMetadataIndexes = `
CREATE INDEX IF NOT EXISTS idx_store_metadata_category ON store_metadata(store_category);
CREATE INDEX IF NOT EXISTS idx_store_metadata_cuisine ON store_metadata(cuisine_type);
`;

db.exec(createOrdersTable);
db.exec(createOrderItemsTable);
db.exec(createConfigTable);
db.exec(createStoreMetadataTable);
db.exec(createStoreMetadataIndexes);

// Insert default config if not exists
const insertDefault = db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)');
insertDefault.run('llm_provider', 'local');
insertDefault.run('llm_base_url', 'http://localhost:8080/v1');
insertDefault.run('llm_api_key', 'sk-no-key-required');
insertDefault.run('llm_model', 'llama-3.2-3b-instruct');


console.log('Database initialized successfully.');
