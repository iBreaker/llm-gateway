import { defineConfig } from 'drizzle-kit'
import { env } from './src/lib/env'

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: env.DATABASE_URL || './data/dev.db'
  },
  verbose: true,
  strict: true
})