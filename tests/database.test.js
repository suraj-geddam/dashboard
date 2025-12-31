const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

describe('Store Metadata Database', () => {
  let db;
  const testDbPath = path.join(__dirname, 'test.db');

  beforeEach(() => {
    // Create fresh test database
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    db = new Database(testDbPath);

    // Create schema
    db.exec(`
      CREATE TABLE store_metadata (
        store_name TEXT PRIMARY KEY,
        cuisine_type TEXT,
        store_category TEXT,
        price_range TEXT,
        enriched_at TEXT,
        enrichment_source TEXT,
        raw_llm_response TEXT
      );
      CREATE INDEX idx_store_metadata_category ON store_metadata(store_category);
      CREATE INDEX idx_store_metadata_cuisine ON store_metadata(cuisine_type);
    `);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  test('insert store metadata', () => {
    const stmt = db.prepare(`
      INSERT INTO store_metadata (store_name, cuisine_type, store_category, price_range, enriched_at, enrichment_source)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run('Mitr Thai', 'Thai', 'Restaurant', '$$', new Date().toISOString(), 'llm_batch_v1');

    const result = db.prepare('SELECT * FROM store_metadata WHERE store_name = ?').get('Mitr Thai');

    expect(result.cuisine_type).toBe('Thai');
    expect(result.store_category).toBe('Restaurant');
    expect(result.price_range).toBe('$$');
  });

  test('upsert replaces existing metadata', () => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO store_metadata (store_name, cuisine_type, store_category, price_range, enriched_at, enrichment_source)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run('Test Store', 'Thai', 'Restaurant', '$$', new Date().toISOString(), 'llm_batch_v1');
    stmt.run('Test Store', 'Italian', 'Restaurant', '$$$', new Date().toISOString(), 'llm_batch_v2');

    const result = db.prepare('SELECT * FROM store_metadata WHERE store_name = ?').get('Test Store');

    expect(result.cuisine_type).toBe('Italian'); // Updated
    expect(result.price_range).toBe('$$$'); // Updated
  });

  test('indexes exist for performance', () => {
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='store_metadata'").all();

    const indexNames = indexes.map(i => i.name);
    expect(indexNames).toContain('idx_store_metadata_category');
    expect(indexNames).toContain('idx_store_metadata_cuisine');
  });

  test('null cuisine_type allowed for non-restaurants', () => {
    const stmt = db.prepare(`
      INSERT INTO store_metadata (store_name, cuisine_type, store_category, price_range, enriched_at, enrichment_source)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run('CVS', null, 'Pharmacy', '$', new Date().toISOString(), 'llm_batch_v1');

    const result = db.prepare('SELECT * FROM store_metadata WHERE store_name = ?').get('CVS');

    expect(result.cuisine_type).toBeNull();
    expect(result.store_category).toBe('Pharmacy');
  });
});
