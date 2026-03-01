import {
  readContacts, readInteractions, writeSummaries,
} from './utils.js';
import { buildContactSummary } from '../shared/summary.js';
import type { ContactSummary } from './types.js';

const contacts = readContacts();
const interactions = readInteractions();

const summaries: ContactSummary[] = [];

for (const contact of contacts) {
  const summary = buildContactSummary(contact.id, contacts, interactions);
  if (summary) summaries.push(summary);
}

writeSummaries(summaries);
console.log(`✅ Rebuilt summaries for ${summaries.length} contact(s)`);
for (const s of summaries) {
  console.log(`   ${s.name}: ${s.interactionCount} interaction(s), topics: [${s.topTopics.join(', ')}]`);
}
