import { test } from "node:test";
import assert from "node:assert/strict";
import { splitStatements } from "../runtime/migrations.mjs";

test("splits Drizzle files on breakpoints and semicolons", () => {
  const sql = "CREATE TABLE `a` (\n `x` text\n);\n--> statement-breakpoint\nCREATE INDEX `i` ON `a` (`x`);--> statement-breakpoint\n";
  assert.deepEqual(splitStatements(sql), ["CREATE TABLE `a` (\n `x` text\n)", "CREATE INDEX `i` ON `a` (`x`)"]);
});

test("ignores comments and semicolons inside strings", () => {
  const sql = "-- note; here\nINSERT INTO t VALUES ('a;b');\nSELECT 1;";
  assert.deepEqual(splitStatements(sql), ["INSERT INTO t VALUES ('a;b')", "SELECT 1"]);
});

test("keeps trigger bodies whole", () => {
  const sql = "CREATE TRIGGER t AFTER INSERT ON a BEGIN UPDATE b SET n = n + 1; DELETE FROM c; END;\nSELECT 2;";
  const parts = splitStatements(sql);
  assert.equal(parts.length, 2);
  assert.match(parts[0], /DELETE FROM c; END$/);
});
