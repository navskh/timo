import fs from 'fs';
import path from 'path';
import { getDbPath } from '../utils/paths';
import { initSchema } from './schema';

// Compatibility wrapper: mimics better-sqlite3 API on top of sql.js
class DatabaseWrapper {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any;
  private dbPath: string;
  private dirty = false;
  private inTransaction = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: any, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  private save() {
    if (!this.dirty) return;
    const data = this.db.export();
    const tmpPath = `${this.dbPath}.tmp-${process.pid}`;
    try {
      fs.writeFileSync(tmpPath, Buffer.from(data));
      fs.renameSync(tmpPath, this.dbPath);
    } catch (err) {
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      throw err;
    }
    this.dirty = false;
  }

  private immediatelySave() {
    this.dirty = true;
    if (!this.inTransaction) this.save();
  }

  private rowsToObjects(columns: string[], values: unknown[][]): Record<string, unknown>[] {
    return values.map(row => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col: string, i: number) => { obj[col] = row[i]; });
      return obj;
    });
  }

  prepare(sql: string) {
    const self = this;
    const isWrite = /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)/i.test(sql);

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      all(...params: unknown[]): any[] {
        const stmt = self.db.prepare(sql);
        if (params.length > 0) stmt.bind(params);
        const columns: string[] = stmt.getColumnNames();
        const rows: unknown[][] = [];
        while (stmt.step()) {
          rows.push(stmt.get());
        }
        stmt.free();
        return self.rowsToObjects(columns, rows);
      },

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      get(...params: unknown[]): any {
        const stmt = self.db.prepare(sql);
        if (params.length > 0) stmt.bind(params);
        let result: Record<string, unknown> | undefined;
        if (stmt.step()) {
          const columns = stmt.getColumnNames();
          const row = stmt.get();
          const obj: Record<string, unknown> = {};
          columns.forEach((col: string, i: number) => { obj[col] = row[i]; });
          result = obj;
        }
        stmt.free();
        return result;
      },

      run(...params: unknown[]) {
        self.db.run(sql, params);
        if (isWrite) self.immediatelySave();
        const changes = self.db.getRowsModified();
        return { changes };
      },
    };
  }

  exec(sql: string) {
    this.db.exec(sql);
    if (/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)/im.test(sql)) {
      this.immediatelySave();
    }
  }

  transaction<T>(fn: () => T): () => T {
    const self = this;
    return () => {
      self.inTransaction = true;
      self.db.run('BEGIN');
      try {
        const result = fn();
        self.db.run('COMMIT');
        self.inTransaction = false;
        self.immediatelySave();
        return result;
      } catch (err) {
        self.inTransaction = false;
        try { self.db.run('ROLLBACK'); } catch { /* already rolled back */ }
        throw err;
      }
    };
  }

  close() {
    this.immediatelySave();
    this.db.close();
  }
}

// Stash on globalThis so Next's HMR (which re-imports this module) doesn't
// spawn multiple DB wrappers — that caused writes routed to different
// in-memory copies, so DELETEs appeared no-op and disk state fluttered.
interface TimoGlobal {
  __timoDbWrapper?: DatabaseWrapper | null;
  __timoDbInitPromise?: Promise<DatabaseWrapper> | null;
}
const timoGlobal = globalThis as TimoGlobal;
let wrapper: DatabaseWrapper | null = timoGlobal.__timoDbWrapper ?? null;
let initPromise: Promise<DatabaseWrapper> | null = timoGlobal.__timoDbInitPromise ?? null;

function findSqlJsDistDir(): string {
  // Walk up from process.cwd() looking for node_modules/sql.js/dist/sql-wasm.wasm.
  let dir = process.cwd();
  while (true) {
    const candidate = path.join(dir, 'node_modules', 'sql.js', 'dist');
    if (fs.existsSync(path.join(candidate, 'sql-wasm.wasm'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return '';
    dir = parent;
  }
}

async function initAsync(): Promise<DatabaseWrapper> {
  if (wrapper) return wrapper;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const initSqlJs = require('sql.js/dist/sql-wasm.js');
  // Resolve the sql.js dist directory via the filesystem (NOT require.resolve,
  // which under Turbopack can return a virtual path like "[externals]/...").
  const wasmDir = findSqlJsDistDir();
  const SQL = await initSqlJs(wasmDir ? {
    locateFile: (file: string) => path.join(wasmDir, file),
  } : undefined);

  const dbPath = getDbPath();
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  let db;
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  wrapper = new DatabaseWrapper(db, dbPath);
  initSchema(wrapper as unknown as Parameters<typeof initSchema>[0]);
  timoGlobal.__timoDbWrapper = wrapper;

  process.on('exit', () => wrapper?.close());

  return wrapper;
}

export async function ensureDb(): Promise<DatabaseWrapper> {
  if (wrapper) return wrapper;
  if (!initPromise) {
    initPromise = initAsync();
    timoGlobal.__timoDbInitPromise = initPromise;
  }
  return initPromise;
}

export function getDb(): DatabaseWrapper {
  if (!wrapper) {
    throw new Error('Database not initialized. Call await ensureDb() first.');
  }
  return wrapper;
}
