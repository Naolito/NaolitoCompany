// Just enough of D1 on top of node:sqlite to run the API against the real migration and seed.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const isRead = (sql) => /^\s*select/i.test(sql);

class Statement {
  constructor(db, sql, params = []) { Object.assign(this, { db, sql, params }); }
  bind(...params) { return new Statement(this.db, this.sql, params); }
  exec() {
    const stmt = this.db.prepare(this.sql);
    if (isRead(this.sql)) return { results: stmt.all(...this.params).map((r) => ({ ...r })), meta: { changes: 0 } };
    const info = stmt.run(...this.params);
    return { results: [], meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  }
  async all() { return this.exec(); }
  async run() { return this.exec(); }
  async first() { return this.exec().results[0] ?? null; }
}

export function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../seed/seed.sql', import.meta.url), 'utf8'));
  return {
    exec: (sql) => db.exec(sql),
    prepare: (sql) => new Statement(db, sql),
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const out = statements.map((s) => s.exec());
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}
