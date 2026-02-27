import {
  readContacts, readInteractions, writeInteractions,
  generateInteractionId, findContactByName, parseArgs,
  rebuildContactSummary,
} from './utils.js';
import type { Interaction, InteractionType } from './types.js';

const VALID_TYPES: InteractionType[] = ['catch-up', 'meeting', 'call', 'message', 'event', 'other'];

const args = parseArgs(process.argv.slice(2));

const contactQuery = args['contact'];
const contactsQuery = args['contacts'];
const summary = args['summary'];

if ((!contactQuery && !contactsQuery) || !summary) {
  console.error('Usage: npx tsx src/addInteraction.ts --contact "Name" --summary "What happened" [options]');
  console.error('       npx tsx src/addInteraction.ts --contacts "Name1,Name2,Name3" --summary "What happened" [options]');
  console.error('Options: [--date YYYY-MM-DD] [--type catch-up] [--topics t1,t2] [--mentioned-next-steps "Do X"] [--follow-up "Do X"] [--location "Place"]');
  process.exit(1);
}

// Resolve contacts
const contacts = readContacts();
const resolvedContacts: typeof contacts = [];

if (contactsQuery) {
  // Multi-contact mode: comma-separated names
  const names = contactsQuery.split(',').map(n => n.trim()).filter(Boolean);
  for (const name of names) {
    const matches = findContactByName(name, contacts);
    if (matches.length === 0) {
      console.error(`❌ No contact found matching "${name}"`);
      console.error('   Add them first with: npx tsx src/addContact.ts --name "Name"');
      process.exit(1);
    }
    if (matches.length > 1) {
      console.error(`❌ Multiple contacts match "${name}":`);
      matches.forEach(c => console.error(`   - ${c.name} (${c.id})`));
      console.error('   Please be more specific.');
      process.exit(1);
    }
    resolvedContacts.push(matches[0]);
  }
} else if (contactQuery) {
  // Single-contact mode (backward compat)
  const matches = findContactByName(contactQuery, contacts);
  if (matches.length === 0) {
    console.error(`❌ No contact found matching "${contactQuery}"`);
    console.error('   Add them first with: npx tsx src/addContact.ts --name "Name"');
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(`❌ Multiple contacts match "${contactQuery}":`);
    matches.forEach(c => console.error(`   - ${c.name} (${c.id})`));
    console.error('   Please be more specific.');
    process.exit(1);
  }
  resolvedContacts.push(matches[0]);
}

// Deduplicate contact IDs
const contactIds = [...new Set(resolvedContacts.map(c => c.id))];
const contactNames = resolvedContacts
  .filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i)
  .map(c => c.name);

const interactionType = (args['type'] ?? 'other') as InteractionType;
if (!VALID_TYPES.includes(interactionType)) {
  console.error(`❌ Invalid type "${interactionType}". Must be one of: ${VALID_TYPES.join(', ')}`);
  process.exit(1);
}

const date = args['date'] ?? new Date().toISOString().slice(0, 10);
const now = new Date().toISOString();

const interaction: Interaction = {
  id: generateInteractionId(),
  contactIds,
  date,
  type: interactionType,
  summary,
  topics: args['topics'] ? args['topics'].split(',').map(t => t.trim()) : [],
  mentionedNextSteps: args['mentioned-next-steps'] ?? args['follow-up'] ?? null,
  location: args['location'] ?? null,
  createdAt: now,
};

const interactions = readInteractions();
interactions.push(interaction);
writeInteractions(interactions);

// Rebuild summaries for all participants
for (const id of contactIds) {
  rebuildContactSummary(id);
}

const nameLabel = contactNames.length > 1
  ? `${contactNames.length} people: ${contactNames.join(', ')}`
  : contactNames[0];

console.log(`✅ Logged ${interactionType} with ${nameLabel} on ${date}`);
console.log(`   ${summary}`);
if (interaction.topics.length) console.log(`   Topics: ${interaction.topics.join(', ')}`);
if (interaction.mentionedNextSteps) console.log(`   Next steps: ${interaction.mentionedNextSteps}`);
if (interaction.location) console.log(`   Location: ${interaction.location}`);
