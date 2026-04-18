import 'dotenv/config';
import { resolveSqlitePath } from './knex-config.js';
import { runMigrations } from './index.js';

const sqlitePath = resolveSqlitePath();
await runMigrations(sqlitePath);
console.log(`Applied migrations to ${sqlitePath}`);
