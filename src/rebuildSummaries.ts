import {
  readContacts, readInteractions, writeSummaries,
} from './utils.js';
import type { ContactSummary } from './types.js';

const contacts = readContacts();
const interactions = readInteractions();

const summaries: ContactSummary[] = [];

for (const contact of contacts) {
  const contactInteractions = interactions
    .filter(i => i.contactIds.includes(contact.id))
    .sort((a, b) => b.date.localeCompare(a.date));

  // Top topics by frequency
  const topicCounts = new Map<string, number>();
  for (const i of contactInteractions) {
    for (const t of i.topics) {
      topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
    }
  }
  const topTopics = [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic]) => topic);

  // Unique locations
  const locations = [...new Set(
    contactInteractions
      .map(i => i.location)
      .filter((loc): loc is string => !!loc)
  )];

  // Recent summary: last 3 interactions compressed
  const recentSummary = contactInteractions
    .slice(0, 3)
    .map(i => `${i.date}: ${i.summary.slice(0, 100)}`)
    .join('. ');

  // All mentioned next steps
  const mentionedNextSteps = contactInteractions
    .map(i => i.mentionedNextSteps)
    .filter((ns): ns is string => !!ns);

  summaries.push({
    id: contact.id,
    name: contact.name,
    company: contact.company ?? null,
    role: contact.role ?? null,
    tags: contact.tags,
    expertise: contact.expertise,
    interactionCount: contactInteractions.length,
    lastInteraction: contactInteractions[0]?.date ?? null,
    firstInteraction: contactInteractions.length > 0
      ? contactInteractions[contactInteractions.length - 1].date
      : null,
    topTopics,
    locations,
    recentSummary,
    mentionedNextSteps,
    notes: contact.notes,
  });
}

writeSummaries(summaries);
console.log(`✅ Rebuilt summaries for ${summaries.length} contact(s)`);
for (const s of summaries) {
  console.log(`   ${s.name}: ${s.interactionCount} interaction(s), topics: [${s.topTopics.join(', ')}]`);
}
