import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const INTERACTIONS_PATH = join(DATA_DIR, 'interactions.json');
const BACKUP_PATH = join(DATA_DIR, 'interactions.json.pre-multicontact-backup');

const confirm = process.argv.includes('--confirm');

interface OldInteraction {
  id: string;
  contactId: string;
  date: string;
  type: string;
  summary: string;
  topics: string[];
  mentionedNextSteps?: string | null;
  location?: string | null;
  createdAt: string;
  updatedAt?: string;
}

interface NewInteraction {
  id: string;
  contactIds: string[];
  date: string;
  type: string;
  summary: string;
  topics: string[];
  mentionedNextSteps?: string | null;
  location?: string | null;
  createdAt: string;
  updatedAt?: string;
}

const raw = readFileSync(INTERACTIONS_PATH, 'utf-8');
const interactions = JSON.parse(raw) as OldInteraction[];

console.log(`📋 Found ${interactions.length} interaction(s) to migrate\n`);

let alreadyMigrated = 0;
let toMigrate = 0;

const migrated: NewInteraction[] = interactions.map(i => {
  // Check if already migrated (has contactIds array)
  if ('contactIds' in i && Array.isArray((i as any).contactIds)) {
    alreadyMigrated++;
    const { contactId, ...rest } = i as any;
    return rest as NewInteraction;
  }

  toMigrate++;
  const { contactId, ...rest } = i;
  return {
    ...rest,
    contactIds: [contactId],
  } as NewInteraction;
});

console.log(`  Already migrated: ${alreadyMigrated}`);
console.log(`  To migrate:       ${toMigrate}`);

if (toMigrate === 0) {
  console.log('\n✅ All interactions already use contactIds. Nothing to do.');
  process.exit(0);
}

// Show preview
console.log('\n📝 Preview of changes:\n');
for (const m of migrated.slice(0, 5)) {
  console.log(`  ${m.id}: contactIds: ${JSON.stringify(m.contactIds)}`);
}
if (migrated.length > 5) {
  console.log(`  ... and ${migrated.length - 5} more`);
}

if (!confirm) {
  console.log('\n🔍 Dry run — no changes written.');
  console.log('   Re-run with --confirm to write changes.');
  process.exit(0);
}

// Backup
copyFileSync(INTERACTIONS_PATH, BACKUP_PATH);
console.log(`\n💾 Backup saved to: ${BACKUP_PATH}`);

// Write migrated data
writeFileSync(INTERACTIONS_PATH, JSON.stringify(migrated, null, 2) + '\n', 'utf-8');
console.log(`✅ Migration complete — ${toMigrate} interaction(s) updated to contactIds format.`);
