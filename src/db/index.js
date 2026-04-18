import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import knex from 'knex';
import { buildKnexConfig, resolveSqlitePath } from './knex-config.js';

const dbCache = new Map();

function ensureSqliteDirectory(sqlitePath) {
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
}

function configureDb(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
}

export async function runMigrations(sqlitePath = resolveSqlitePath()) {
  const resolvedPath = resolveSqlitePath(sqlitePath);
  ensureSqliteDirectory(resolvedPath);
  const migrator = knex(buildKnexConfig(resolvedPath));
  try {
    await migrator.migrate.latest();
  } finally {
    await migrator.destroy();
  }
}

export function getDb(sqlitePath = resolveSqlitePath()) {
  const resolvedPath = resolveSqlitePath(sqlitePath);
  if (!dbCache.has(resolvedPath)) {
    ensureSqliteDirectory(resolvedPath);
    const db = new Database(resolvedPath);
    configureDb(db);
    dbCache.set(resolvedPath, db);
  }
  return dbCache.get(resolvedPath);
}

export async function initializeDb(sqlitePath = resolveSqlitePath()) {
  const resolvedPath = resolveSqlitePath(sqlitePath);
  await runMigrations(resolvedPath);
  return getDb(resolvedPath);
}

export function closeDb(sqlitePath = resolveSqlitePath()) {
  const resolvedPath = resolveSqlitePath(sqlitePath);
  const db = dbCache.get(resolvedPath);
  if (!db) return;
  db.close();
  dbCache.delete(resolvedPath);
}

export function closeAllDbs() {
  for (const [sqlitePath, db] of dbCache.entries()) {
    db.close();
    dbCache.delete(sqlitePath);
  }
}
