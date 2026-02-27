import {
  readContacts, writeContacts, generateContactId, findContactByName, parseArgs,
  rebuildContactSummary,
} from './utils.js';
import type { Contact } from './types.js';

const args = parseArgs(process.argv.slice(2));

const name = args['name'];
if (!name) {
  console.error('Usage: npx tsx src/addContact.ts --name "Name" [--company "Co"] [--role "Role"] [--how-met "Story"] [--tags tag1,tag2] [--email e] [--phone p] [--linkedin url] [--nickname nick] [--notes "note1,note2"] [--expertise "area1,area2"]');
  process.exit(1);
}

// Validate full name (first + last)
const nameParts = name.trim().split(/\s+/);
if (nameParts.length < 2) {
  console.error(`❌ Contact name must include both first and last name. Got: "${name}"`);
  process.exit(1);
}

const contacts = readContacts();

// Warn on potential duplicates
const existing = findContactByName(name, contacts);
if (existing.length > 0) {
  console.warn(`⚠  Possible duplicate(s): ${existing.map(c => `${c.name} (${c.id})`).join(', ')}`);
  console.warn('   Proceeding with creation anyway. Remove manually if duplicate.\n');
}

const now = new Date().toISOString();

const contact: Contact = {
  id: generateContactId(),
  name,
  nickname: args['nickname'] ?? null,
  company: args['company'] ?? null,
  role: args['role'] ?? null,
  howWeMet: args['how-met'] ?? null,
  tags: args['tags'] ? args['tags'].split(',').map(t => t.trim()) : [],
  contactInfo: {
    email: args['email'] ?? null,
    phone: args['phone'] ?? null,
    linkedin: args['linkedin'] ?? null,
  },
  notes: args['notes'] ? args['notes'].split(',').map(n => n.trim()) : [],
  expertise: args['expertise'] ? args['expertise'].split(',').map(e => e.trim()) : [],
  createdAt: now,
  updatedAt: now,
};

contacts.push(contact);
writeContacts(contacts);
rebuildContactSummary(contact.id);

console.log(`✅ Added contact: ${contact.name} (${contact.id})`);
if (contact.company) console.log(`   Company: ${contact.company}`);
if (contact.role) console.log(`   Role: ${contact.role}`);
if (contact.tags.length) console.log(`   Tags: ${contact.tags.join(', ')}`);
if (contact.notes.length) console.log(`   Notes: ${contact.notes.join(', ')}`);
if (contact.expertise.length) console.log(`   Expertise: ${contact.expertise.join(', ')}`);
