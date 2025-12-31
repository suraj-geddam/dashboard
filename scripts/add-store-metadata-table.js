const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'dashboard.db');
const db = new Database(dbPath);

console.log('Adding store_metadata table...');

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

const createIndexes = `
CREATE INDEX IF NOT EXISTS idx_store_metadata_category ON store_metadata(store_category);
CREATE INDEX IF NOT EXISTS idx_store_metadata_cuisine ON store_metadata(cuisine_type);
`;

db.exec(createStoreMetadataTable);
db.exec(createIndexes);

console.log('store_metadata table created successfully.');

db.close();
