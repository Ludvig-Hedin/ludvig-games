/** Minimal D1 stand-in over node:sqlite so the Worker's real SQL runs in tests. */
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

class Statement {
  constructor(db, sql, args = []) { Object.assign(this, { db, sql, args }); }
  bind(...args) { return new Statement(this.db, this.sql, args); }
  async first() { return this.db.prepare(this.sql).get(...this.args) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args) }; }
  async run() { this.db.prepare(this.sql).run(...this.args); return { success: true }; }
  exec() {
    const statement = this.db.prepare(this.sql);
    return /^\s*(SELECT|WITH)|RETURNING/i.test(this.sql) ? { results: statement.all(...this.args) } : (statement.run(...this.args), { results: [] });
  }
}

export function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../migrations/0001_scores.sql', import.meta.url), 'utf8'));
  return {
    raw: db,
    prepare: sql => new Statement(db, sql),
    async batch(statements) {
      db.exec('BEGIN');
      try { const out = statements.map(s => s.exec()); db.exec('COMMIT'); return out; } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
}
