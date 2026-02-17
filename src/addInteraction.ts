import {
  readContacts, readInteractions, writeInteractions,
  generateInteractionId, findContactByName, parseArgs,
} from './utils.js';
import type { Interaction, InteractionType } from './types.js';

const VALID_TYPES: InteractionType[] = ['catch-up', 'meeting', 'call', 'message', 'event', 'other'];

const args = parseArgs(process.argv.slice(2));

const contactQuery = args['contact'];
const summary = args['summary'];

if (!contactQuery || !summary) {
  console.error('Usage: npx tsx src/addInteraction.ts --contact "Name" --summary "What happened" [--date YYYY-MM-DD] [--type catch-up] [--topics t1,t2] [--follow-up "Do X"]');
  process.exit(1);
}

// Find the contact
const contacts = readContacts();
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

const contact = matches[0];
const interactionType = (args['type'] ?? 'other') as InteractionType;
if (!VALID_TYPES.includes(interactionType)) {
  console.error(`❌ Invalid type "${interactionType}". Must be one of: ${VALID_TYPES.join(', ')}`);
  process.exit(1);
}

const date = args['date'] ?? new Date().toISOString().slice(0, 10);
const now = new Date().toISOString();

const interaction: Interaction = {
  id: generateInteractionId(),
  contactId: contact.id,
  date,
  type: interactionType,
  summary,
  topics: args['topics'] ? args['topics'].split(',').map(t => t.trim()) : [],
  followUp: args['follow-up'] ?? null,
  createdAt: now,
};

const interactions = readInteractions();
interactions.push(interaction);
writeInteractions(interactions);

console.log(`✅ Logged ${interactionType} with ${contact.name} on ${date}`);
console.log(`   ${summary}`);
if (interaction.topics.length) console.log(`   Topics: ${interaction.topics.join(', ')}`);
if (interaction.followUp) console.log(`   Follow-up: ${interaction.followUp}`);
