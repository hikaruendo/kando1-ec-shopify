import path from 'node:path';

const DEFAULT_SQLITE_PATH = './data/kando1.db';

export function resolveSqlitePath(input = process.env.SQLITE_PATH || DEFAULT_SQLITE_PATH) {
  const raw = String(input || DEFAULT_SQLITE_PATH).trim() || DEFAULT_SQLITE_PATH;
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

export function buildKnexConfig(sqlitePath = resolveSqlitePath()) {
  return {
    client: 'better-sqlite3',
    connection: {
      filename: sqlitePath
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.resolve(process.cwd(), 'src/db/migrations'),
      extension: 'js',
      tableName: 'knex_migrations'
    }
  };
}
