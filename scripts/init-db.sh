#!/bin/sh
# Create tables directly via SQL, skip Prisma migrate entirely
# This is idempotent — safe to run on every startup

node -e "
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();

  await client.query(\`
    CREATE TABLE IF NOT EXISTS \"forms\" (
      \"id\" TEXT NOT NULL,
      \"title\" TEXT NOT NULL,
      \"description\" TEXT,
      \"fields\" JSONB NOT NULL,
      \"published\" BOOLEAN NOT NULL DEFAULT true,
      \"created_at\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \"updated_at\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT \"forms_pkey\" PRIMARY KEY (\"id\")
    );

    CREATE TABLE IF NOT EXISTS \"responses\" (
      \"id\" TEXT NOT NULL,
      \"form_id\" TEXT NOT NULL,
      \"data\" JSONB NOT NULL,
      \"created_at\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT \"responses_pkey\" PRIMARY KEY (\"id\")
    );

    DO \\\$\\\$ BEGIN
      ALTER TABLE \"responses\"
        ADD CONSTRAINT \"responses_form_id_fkey\"
        FOREIGN KEY (\"form_id\") REFERENCES \"forms\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END \\\$\\\$;

    -- Twenty CRM integration columns (idempotent)
    ALTER TABLE \"forms\" ADD COLUMN IF NOT EXISTS \"crm_target\" TEXT;
    ALTER TABLE \"forms\" ADD COLUMN IF NOT EXISTS \"crm_field_map\" JSONB;
  \`);

  console.log('Database tables ready.');
  await client.end();
}

main().catch(e => { console.error('DB init failed:', e.message); process.exit(1); });
"
