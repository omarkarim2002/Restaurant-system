import type { Knex } from 'knex';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from the backend/ root, not from src/db/
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'pg',
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    },
    migrations: {
      directory: path.resolve(__dirname, '../../migrations'),
      extension: 'ts',
      loadExtensions: ['.ts'],
    },
  },
};

export default config;