// Applies a game's D1 migrations once, in order, and records them in d1_migrations like Wrangler does.
import fs from "node:fs";
import path from "node:path";

/** Splits a migration file into single statements. Handles Drizzle breakpoints, comments, quotes and
    CREATE TRIGGER ... BEGIN ... END bodies. */
export function splitStatements(sql) {
  const text = sql.replace(/-->\s*statement-breakpoint/g, "\n");
  const statements = [];
  let current = "";
  let quote = null;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      current += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === "-" && text[i + 1] === "-") {
      while (i < text.length && text[i] !== "\n") i++;
      current += "\n";
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      quote = c;
      current += c;
      continue;
    }
    if (/[A-Za-z]/.test(c) && !/[A-Za-z0-9_]/.test(text[i - 1] || "")) {
      const word = /^[A-Za-z_]+/.exec(text.slice(i))[0].toUpperCase();
      if (word === "BEGIN" && /CREATE\s+(TEMP\s+|TEMPORARY\s+)?TRIGGER/i.test(current)) depth++;
      if (word === "END" && depth > 0) depth--;
    }
    if (c === ";" && depth === 0) {
      if (current.trim()) statements.push(current.trim());
      current = "";
      continue;
    }
    current += c;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

export async function applyMigrations(db, dir, files) {
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)",
    )
    .run();
  const { results } = await db.prepare("SELECT name FROM d1_migrations").all();
  const done = new Set(results.map((r) => r.name));
  for (const file of files) {
    const name = path.basename(file);
    if (done.has(name)) continue;
    const statements = splitStatements(fs.readFileSync(path.join(dir, file), "utf8"));
    await db.batch([
      ...statements.map((s) => db.prepare(s)),
      db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").bind(name),
    ]);
  }
}
