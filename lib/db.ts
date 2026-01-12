import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'dashboard.db');

// Singleton pattern for Next.js hot reloading
let db: any;

try {
  if (process.env.NODE_ENV === 'production') {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
  } else {
    if (!(global as any).db) {
      (global as any).db = new Database(dbPath);
      (global as any).db.pragma('journal_mode = WAL');
    }
    db = (global as any).db;
  }
} catch (error: any) {
  const errorMessage = `Failed to initialize database at ${dbPath}. ` +
    `Ensure the 'data' directory exists and you have write permissions. ` +
    `Error: ${error.message}`;
  console.error(errorMessage);
  throw new Error(errorMessage);
}

export default db;

