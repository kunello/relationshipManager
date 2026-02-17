import {
  readContacts, readInteractions, parseArgs,
} from './utils.js';

const args = parseArgs(process.argv.slice(2));
const query = args['_positional'] ?? args['tag'] ?? args['company'] ?? '';

if (!query) {
  console.error('Usage: npx tsx src/searchContacts.ts "search term"');
  console.error('       npx tsx src/searchContacts.ts --tag "golf"');
  console.error('       npx tsx src/searchContacts.ts --company "Acme"');
  process.exit(1);
}

const contacts = readContacts();
const interactions = readInteractions();
const q = query.toLowerCase();

// Search mode: tag-only, company-only, or full-text
const isTagSearch = !!args['tag'];
const isCompanySearch = !!args['company'];

interface SearchResult {
  contactId: string;
  contactName: string;
  matchedIn: string[];
}

const results = new Map<string, SearchResult>();

function addResult(contactId: string, contactName: string, matchedIn: string) {
  const existing = results.get(contactId);
  if (existing) {
    existing.matchedIn.push(matchedIn);
  } else {
    results.set(contactId, { contactId, contactName, matchedIn: [matchedIn] });
  }
}

for (const c of contacts) {
  if (isTagSearch) {
    if (c.tags.some(t => t.toLowerCase().includes(q))) {
      addResult(c.id, c.name, `tag: ${c.tags.filter(t => t.toLowerCase().includes(q)).join(', ')}`);
    }
    continue;
  }

  if (isCompanySearch) {
    if (c.company?.toLowerCase().includes(q)) {
      addResult(c.id, c.name, `company: ${c.company}`);
    }
    continue;
  }

  // Full-text search across all contact fields
  if (c.name.toLowerCase().includes(q)) addResult(c.id, c.name, 'name');
  if (c.nickname?.toLowerCase().includes(q)) addResult(c.id, c.name, 'nickname');
  if (c.company?.toLowerCase().includes(q)) addResult(c.id, c.name, `company: ${c.company}`);
  if (c.role?.toLowerCase().includes(q)) addResult(c.id, c.name, `role: ${c.role}`);
  if (c.howWeMet?.toLowerCase().includes(q)) addResult(c.id, c.name, 'howWeMet');
  if (c.tags.some(t => t.toLowerCase().includes(q))) {
    addResult(c.id, c.name, `tag: ${c.tags.filter(t => t.toLowerCase().includes(q)).join(', ')}`);
  }
}

// Also search interactions (summary, topics, followUp)
if (!isTagSearch && !isCompanySearch) {
  for (const i of interactions) {
    const contact = contacts.find(c => c.id === i.contactId);
    const cName = contact?.name ?? 'Unknown';

    if (i.summary.toLowerCase().includes(q)) {
      addResult(i.contactId, cName, `interaction (${i.date}): "${i.summary.slice(0, 80)}..."`);
    }
    if (i.topics.some(t => t.toLowerCase().includes(q))) {
      addResult(i.contactId, cName, `interaction topic (${i.date}): ${i.topics.filter(t => t.toLowerCase().includes(q)).join(', ')}`);
    }
    if (i.followUp?.toLowerCase().includes(q)) {
      addResult(i.contactId, cName, `follow-up (${i.date}): ${i.followUp}`);
    }
  }
}

if (results.size === 0) {
  console.log(`No results for "${query}"`);
  process.exit(0);
}

console.log(`🔍 ${results.size} contact(s) matching "${query}":\n`);
for (const r of results.values()) {
  console.log(`  ${r.contactName} (${r.contactId})`);
  for (const m of r.matchedIn) {
    console.log(`    ↳ ${m}`);
  }
  console.log();
}
