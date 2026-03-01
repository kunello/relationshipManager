import type { Contact, Interaction, ContactSummary } from './types.js';
import { isContactPrivate, isInteractionPrivate } from './privacy.js';

/** Build a ContactSummary from pre-loaded data (pure, no I/O).
 *  Excludes private interactions from the summary rollup.
 *  Returns null for private contacts or if contact not found. */
export function buildContactSummary(
  contactId: string,
  contacts: Contact[],
  interactions: Interaction[],
): ContactSummary | null {
  const contact = contacts.find(c => c.id === contactId);
  if (!contact) return null;

  // Skip summary for private contacts
  if (isContactPrivate(contact)) return null;

  // Only include public interactions in summary
  const contactInteractions = interactions
    .filter(i => i.contactIds.includes(contactId) && !isInteractionPrivate(i, contacts))
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

  return {
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
  };
}
