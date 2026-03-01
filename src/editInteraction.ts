import {
  readInteractions, writeInteractions, readContacts, parseArgs,
  rebuildContactSummary, findContactByName,
} from './utils.js';
import { VALID_INTERACTION_TYPES } from '../shared/constants.js';
import type { InteractionType } from './types.js';

const args = parseArgs(process.argv.slice(2));

const interactionId = args['id'];

if (!interactionId) {
  console.error('Usage: npx tsx src/editInteraction.ts --id "i_xxxx" [--summary "New summary"] [--date YYYY-MM-DD] [--type catch-up] [--topics t1,t2] [--mentioned-next-steps "Do X"] [--location "Place"] [--contacts "Name1,Name2"]');
  process.exit(1);
}

const interactions = readInteractions();
const interaction = interactions.find(i => i.id === interactionId);

if (!interaction) {
  console.error(`❌ No interaction found with ID "${interactionId}"`);
  process.exit(1);
}

// Track old contactIds for summary rebuild
const oldContactIds = [...interaction.contactIds];
let changed = false;

if (args['summary']) {
  interaction.summary = args['summary'];
  changed = true;
}

if (args['date']) {
  interaction.date = args['date'];
  changed = true;
}

if (args['type']) {
  const newType = args['type'] as InteractionType;
  if (!VALID_INTERACTION_TYPES.includes(newType)) {
    console.error(`❌ Invalid type "${newType}". Must be one of: ${VALID_INTERACTION_TYPES.join(', ')}`);
    process.exit(1);
  }
  interaction.type = newType;
  changed = true;
}

if (args['topics']) {
  interaction.topics = args['topics'].split(',').map(t => t.trim());
  changed = true;
}

if (args['mentioned-next-steps']) {
  interaction.mentionedNextSteps = args['mentioned-next-steps'];
  changed = true;
}

if (args['location']) {
  interaction.location = args['location'];
  changed = true;
}

// Update participants via --contacts flag
if (args['contacts']) {
  const contacts = readContacts();
  const names = args['contacts'].split(',').map(n => n.trim()).filter(Boolean);
  const newContactIds: string[] = [];

  for (const name of names) {
    const matches = findContactByName(name, contacts);
    if (matches.length === 0) {
      console.error(`❌ No contact found matching "${name}"`);
      process.exit(1);
    }
    if (matches.length > 1) {
      console.error(`❌ Multiple contacts match "${name}":`);
      matches.forEach(c => console.error(`   - ${c.name} (${c.id})`));
      console.error('   Please be more specific.');
      process.exit(1);
    }
    newContactIds.push(matches[0].id);
  }

  interaction.contactIds = [...new Set(newContactIds)];
  changed = true;
}

if (!changed) {
  console.log('No updates provided. Nothing changed.');
  process.exit(0);
}

interaction.updatedAt = new Date().toISOString();
writeInteractions(interactions);

// Rebuild summaries for union of old + new contactIds
const allContactIds = [...new Set([...oldContactIds, ...interaction.contactIds])];
for (const id of allContactIds) {
  rebuildContactSummary(id);
}

const contacts = readContacts();
const participantNames = interaction.contactIds
  .map(id => contacts.find(c => c.id === id)?.name ?? 'Unknown');

console.log(`✅ Updated interaction ${interaction.id}`);
console.log(`   Participants: ${participantNames.join(', ')}`);
console.log(`   Date: ${interaction.date}`);
console.log(`   Type: ${interaction.type}`);
console.log(`   Summary: ${interaction.summary}`);
if (interaction.topics.length) console.log(`   Topics: ${interaction.topics.join(', ')}`);
if (interaction.mentionedNextSteps) console.log(`   Next steps: ${interaction.mentionedNextSteps}`);
if (interaction.location) console.log(`   Location: ${interaction.location}`);
