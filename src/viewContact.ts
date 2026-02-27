import {
  readContacts, findContactByName, getInteractionsForContact, readInteractions, parseArgs,
} from './utils.js';

const args = parseArgs(process.argv.slice(2));
const query = args['_positional'];

if (!query) {
  console.error('Usage: npx tsx src/viewContact.ts "Name"');
  process.exit(1);
}

const contacts = readContacts();
const matches = findContactByName(query, contacts);

if (matches.length === 0) {
  console.error(`❌ No contact found matching "${query}"`);
  process.exit(1);
}

const allInteractions = readInteractions();
const contactMap = new Map(contacts.map(c => [c.id, c.name]));

for (const contact of matches) {
  console.log('━'.repeat(50));
  console.log(`👤 ${contact.name}${contact.nickname ? ` ("${contact.nickname}")` : ''}`);
  console.log('━'.repeat(50));
  if (contact.company || contact.role) {
    console.log(`   ${[contact.role, contact.company].filter(Boolean).join(' @ ')}`);
  }
  if (contact.howWeMet) console.log(`   How we met: ${contact.howWeMet}`);
  if (contact.tags.length) console.log(`   Tags: ${contact.tags.join(', ')}`);
  if (contact.expertise.length) console.log(`   Expertise: ${contact.expertise.join(', ')}`);
  if (contact.notes.length) {
    console.log(`   Notes:`);
    for (const note of contact.notes) {
      console.log(`     • ${note}`);
    }
  }

  const info = contact.contactInfo;
  if (info.email || info.phone || info.linkedin) {
    console.log(`   Contact: ${[info.email, info.phone, info.linkedin].filter(Boolean).join(' | ')}`);
  }

  console.log(`   ID: ${contact.id}`);
  console.log(`   Created: ${contact.createdAt.slice(0, 10)} | Updated: ${contact.updatedAt.slice(0, 10)}`);

  const interactions = getInteractionsForContact(contact.id, allInteractions);
  if (interactions.length > 0) {
    console.log(`\n   📅 Interactions (${interactions.length}):`);
    for (const i of interactions) {
      const isGroup = i.contactIds.length > 1;
      const groupLabel = isGroup ? ` [GROUP: ${i.contactIds.length} people]` : '';
      console.log(`\n   [${i.date}] ${i.type}${i.location ? ` @ ${i.location}` : ''}${groupLabel}`);
      console.log(`   ${i.summary}`);
      if (isGroup) {
        const otherNames = i.contactIds
          .filter(id => id !== contact.id)
          .map(id => contactMap.get(id) ?? 'Unknown');
        console.log(`   With: ${otherNames.join(', ')}`);
      }
      if (i.topics.length) console.log(`   Topics: ${i.topics.join(', ')}`);
      if (i.mentionedNextSteps) console.log(`   ⏩ Next steps: ${i.mentionedNextSteps}`);
    }
  } else {
    console.log('\n   No interactions recorded yet.');
  }
  console.log();
}
