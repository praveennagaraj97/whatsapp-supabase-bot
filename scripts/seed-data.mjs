import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import 'dotenv/config';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '..', 'data');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function getDefaultProject() {
  const { data, error } = await supabase
    .from('projects')
    .select('id, slug')
    .eq('slug', 'medibot-default')
    .single();

  if (error || !data) {
    throw new Error(
      'Default project not found. Apply the admin_projects migration before seeding.',
    );
  }

  return data;
}

function readCSV(filename) {
  const content = readFileSync(resolve(DATA_DIR, filename), 'utf-8');
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    cast: (value, context) => {
      if (value === 'true') return true;
      if (value === 'false') return false;
      if (value === 'N/A' || value === '') return null;
      // Cast numeric columns
      const numericColumns = [
        'experience_years',
        'consultation_fee',
        'rating',
        'price',
        'total_amount',
      ];
      if (numericColumns.includes(context.column)) {
        const num = Number(value);
        return isNaN(num) ? value : num;
      }
      return value;
    },
  });
}

async function seedTable(tableName, filename, project, options = {}) {
  console.log(`\nSeeding ${tableName}...`);
  const records = readCSV(filename);

  if (records.length === 0) {
    console.log(`  No records found in ${filename}`);
    return;
  }

  // Transform records if needed
  const transformed = options.transform
    ? records.map((record) => options.transform(record, project))
    : records.map((record) => ({
        ...record,
        project_id: project.id,
        source_id:
          record.source_id ||
          record.id ||
          slugify(record.question || record.name || crypto.randomUUID()),
      }));

  // Clear existing data
  const { error: deleteError } = await supabase
    .from(tableName)
    .delete()
    .eq('project_id', project.id);
  if (deleteError) {
    console.error(`  Error clearing ${tableName}:`, deleteError.message);
  }

  // Insert/update in batches of 50 (upsert to handle existing data)
  const batchSize = 50;
  let inserted = 0;
  for (let i = 0; i < transformed.length; i += batchSize) {
    const batch = transformed.slice(i, i + batchSize);
    const { error } = await supabase.from(tableName).upsert(batch);
    if (error) {
      console.error(
        `  Error inserting batch into ${tableName}:`,
        error.message,
      );
      console.error(
        '  First record in batch:',
        JSON.stringify(batch[0], null, 2),
      );
    } else {
      inserted += batch.length;
    }
  }

  console.log(
    `  Inserted ${inserted}/${transformed.length} records into ${tableName}`,
  );
}

async function main() {
  const project = await getDefaultProject();
  const targetTable =
    process.argv.find((a) => a.startsWith('--table='))?.split('=')[1] ||
    (process.argv.includes('--table')
      ? process.argv[process.argv.indexOf('--table') + 1]
      : null);

  const tables = [
    {
      name: 'clinics',
      file: 'clinics.csv',
    },
    {
      name: 'doctors',
      file: 'doctors.csv',
    },
    {
      name: 'medicines',
      file: 'medicines.csv',
    },
    {
      name: 'faqs',
      file: 'faqs.csv',
    },
  ];

  for (const table of tables) {
    if (targetTable && table.name !== targetTable) continue;
    await seedTable(table.name, table.file, project, table.options || {});
  }

  console.log('\nSeeding complete!');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
