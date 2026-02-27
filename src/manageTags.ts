import {
  readTags, writeTags, readContacts, readInteractions, parseArgs,
} from './utils.js';
import type { TagDictionary } from './types.js';

const args = parseArgs(process.argv.slice(2));

const CATEGORIES = ['contactTags', 'interactionTopics', 'expertiseAreas'] as const;
type Category = typeof CATEGORIES[number];

function getCategoryFromType(type: string): Category | null {
  const map: Record<string, Category> = {
    contact: 'contactTags',
    topic: 'interactionTopics',
    expertise: 'expertiseAreas',
  };
  return map[type] ?? null;
}

// --list: show all tags
if (args['list'] === 'true') {
  const tags = readTags();
  const showCounts = args['counts'] === 'true';

  let contacts: any[] = [];
  let interactions: any[] = [];
  if (showCounts) {
    contacts = readContacts();
    interactions = readInteractions();
  }

  for (const category of CATEGORIES) {
    const label = category === 'contactTags' ? 'Contact Tags'
      : category === 'interactionTopics' ? 'Interaction Topics'
      : 'Expertise Areas';

    console.log(`\n📋 ${label}:`);
    if (tags[category].length === 0) {
      console.log('   (none)');
      continue;
    }

    for (const entry of tags[category]) {
      let countStr = '';
      if (showCounts) {
        let count = 0;
        if (category === 'contactTags') {
          count = contacts.filter((c: any) => c.tags?.includes(entry.tag)).length;
        } else if (category === 'interactionTopics') {
          count = interactions.filter((i: any) => i.topics?.includes(entry.tag)).length;
        } else {
          count = contacts.filter((c: any) => c.expertise?.includes(entry.tag)).length;
        }
        countStr = ` (${count} uses)`;
      }
      console.log(`   ${entry.tag}${countStr}`);
      console.log(`     ${entry.description}`);
      if (entry.aliases.length) console.log(`     Aliases: ${entry.aliases.join(', ')}`);
    }
  }
  process.exit(0);
}

// --audit: find unused tags
if (args['audit'] === 'true') {
  const tags = readTags();
  const contacts = readContacts();
  const interactions = readInteractions();

  console.log('\n🔍 Tag Audit:\n');

  for (const category of CATEGORIES) {
    const label = category === 'contactTags' ? 'Contact Tags'
      : category === 'interactionTopics' ? 'Interaction Topics'
      : 'Expertise Areas';

    const unused: string[] = [];
    for (const entry of tags[category]) {
      let used = false;
      if (category === 'contactTags') {
        used = contacts.some((c: any) => c.tags?.includes(entry.tag));
      } else if (category === 'interactionTopics') {
        used = interactions.some((i: any) => i.topics?.includes(entry.tag));
      } else {
        used = contacts.some((c: any) => c.expertise?.includes(entry.tag));
      }
      if (!used) unused.push(entry.tag);
    }

    if (unused.length > 0) {
      console.log(`   ${label} — unused: ${unused.join(', ')}`);
    } else {
      console.log(`   ${label} — all tags in use ✅`);
    }
  }
  process.exit(0);
}

// --add: add a new tag
if (args['add']) {
  const type = args['type'];
  if (!type) {
    console.error('Usage: npx tsx src/manageTags.ts --add "tag-name" --type contact|topic|expertise --description "Description"');
    process.exit(1);
  }

  const category = getCategoryFromType(type);
  if (!category) {
    console.error(`❌ Invalid type "${type}". Must be: contact, topic, or expertise`);
    process.exit(1);
  }

  const tags = readTags();
  const existing = tags[category].find(e => e.tag === args['add']);
  if (existing) {
    console.error(`❌ Tag "${args['add']}" already exists in ${category}`);
    process.exit(1);
  }

  tags[category].push({
    tag: args['add'],
    description: args['description'] ?? '',
    aliases: args['aliases'] ? args['aliases'].split(',').map(a => a.trim()) : [],
  });

  writeTags(tags);
  console.log(`✅ Added tag "${args['add']}" to ${category}`);
  process.exit(0);
}

// --remove: remove a tag
if (args['remove']) {
  const type = args['type'];
  if (!type) {
    console.error('Usage: npx tsx src/manageTags.ts --remove "tag-name" --type contact|topic|expertise');
    process.exit(1);
  }

  const category = getCategoryFromType(type);
  if (!category) {
    console.error(`❌ Invalid type "${type}". Must be: contact, topic, or expertise`);
    process.exit(1);
  }

  const tags = readTags();
  const idx = tags[category].findIndex(e => e.tag === args['remove']);
  if (idx === -1) {
    console.error(`❌ Tag "${args['remove']}" not found in ${category}`);
    process.exit(1);
  }

  tags[category].splice(idx, 1);
  writeTags(tags);
  console.log(`✅ Removed tag "${args['remove']}" from ${category}`);
  process.exit(0);
}

// --alias: add alias to existing tag
if (args['alias']) {
  const addAlias = args['add-alias'] ?? args['_positional'];
  if (!addAlias) {
    console.error('Usage: npx tsx src/manageTags.ts --alias "existing-tag" --add-alias "new-alias"');
    process.exit(1);
  }

  const tags = readTags();

  for (const category of CATEGORIES) {
    const entry = tags[category].find(e => e.tag === args['alias']);
    if (entry) {
      entry.aliases.push(addAlias);
      writeTags(tags);
      console.log(`✅ Added alias "${addAlias}" to tag "${args['alias']}"`);
      process.exit(0);
    }
  }

  console.error(`❌ Tag "${args['alias']}" not found in any category`);
  process.exit(1);
}

console.error('Usage:');
console.error('  npx tsx src/manageTags.ts --list [--counts]');
console.error('  npx tsx src/manageTags.ts --add "tag" --type contact|topic|expertise --description "Desc"');
console.error('  npx tsx src/manageTags.ts --remove "tag" --type contact|topic|expertise');
console.error('  npx tsx src/manageTags.ts --alias "tag" --add-alias "alias"');
console.error('  npx tsx src/manageTags.ts --audit');
process.exit(1);
