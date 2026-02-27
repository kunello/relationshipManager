import { randomBytes } from 'crypto';
import {
  readContacts, writeContacts, readInteractions, writeInteractions,
  readTags, writeTags, readSummaries, writeSummaries,
} from './gcs-data.js';
import type { Contact, Interaction, InteractionType, ContactSummary, TagDictionary } from './types.js';

function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString('hex')}`;
}

function findContactByName(name: string, contacts: Contact[]): Contact | null {
  const q = name.toLowerCase();
  return contacts.find(c =>
    c.name.toLowerCase().includes(q) ||
    (c.nickname && c.nickname.toLowerCase().includes(q))
  ) ?? null;
}

function contactSummary(c: Contact): object {
  return {
    id: c.id,
    name: c.name,
    nickname: c.nickname,
    company: c.company,
    role: c.role,
    tags: c.tags,
    expertise: c.expertise,
    notes: c.notes,
  };
}

// ── Contact summary generation ────────────────────────────────────────
async function rebuildContactSummary(contactId: string): Promise<void> {
  const [contacts, interactions, summaries] = await Promise.all([
    readContacts(), readInteractions(), readSummaries(),
  ]);

  const contact = contacts.find(c => c.id === contactId);
  if (!contact) return;

  const contactInteractions = interactions
    .filter(i => i.contactIds.includes(contactId))
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

  const summary: ContactSummary = {
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

  // Replace or insert
  const idx = summaries.findIndex(s => s.id === contactId);
  if (idx >= 0) {
    summaries[idx] = summary;
  } else {
    summaries.push(summary);
  }

  await writeSummaries(summaries);
}

// ── search_contacts ──────────────────────────────────────────────────
export async function searchContacts(args: {
  query?: string;
  tag?: string;
  company?: string;
  expertise?: string;
  limit?: number;
}) {
  const contacts = await readContacts();
  let results = contacts;

  if (args.query) {
    const q = args.query.toLowerCase();
    results = results.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.nickname && c.nickname.toLowerCase().includes(q)) ||
      (c.company && c.company.toLowerCase().includes(q)) ||
      (c.role && c.role.toLowerCase().includes(q)) ||
      (c.howWeMet && c.howWeMet.toLowerCase().includes(q)) ||
      c.tags.some(t => t.toLowerCase().includes(q)) ||
      c.expertise.some(e => e.toLowerCase().includes(q)) ||
      c.notes.some(n => n.toLowerCase().includes(q))
    );
  }

  if (args.tag) {
    const tag = args.tag.toLowerCase();
    results = results.filter(c => c.tags.some(t => t.toLowerCase() === tag));
  }

  if (args.company) {
    const co = args.company.toLowerCase();
    results = results.filter(c => c.company && c.company.toLowerCase().includes(co));
  }

  if (args.expertise) {
    const exp = args.expertise.toLowerCase();
    results = results.filter(c => c.expertise.some(e => e.toLowerCase().includes(exp)));
  }

  const limit = args.limit ?? 20;
  results = results.slice(0, limit);

  return {
    count: results.length,
    contacts: results.map(contactSummary),
  };
}

// ── get_contact ──────────────────────────────────────────────────────
export async function getContact(args: { name?: string; contactId?: string }) {
  const [contacts, interactions] = await Promise.all([readContacts(), readInteractions()]);

  let contact: Contact | undefined;
  if (args.contactId) {
    contact = contacts.find(c => c.id === args.contactId);
  } else if (args.name) {
    contact = findContactByName(args.name, contacts) ?? undefined;
  } else {
    return { error: 'Provide either name or contactId' };
  }

  if (!contact) {
    return { error: `Contact not found: ${args.name ?? args.contactId}` };
  }

  const contactMap = new Map(contacts.map(c => [c.id, c.name]));
  const contactInteractions = interactions
    .filter(i => i.contactIds.includes(contact!.id))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(i => ({
      ...i,
      participantNames: i.contactIds.map(id => contactMap.get(id) ?? 'Unknown'),
      participantCount: i.contactIds.length,
    }));

  return {
    contact,
    interactions: contactInteractions,
    interactionCount: contactInteractions.length,
  };
}

// ── add_contact ──────────────────────────────────────────────────────
export async function addContact(args: {
  name: string;
  nickname?: string;
  company?: string;
  role?: string;
  howWeMet?: string;
  tags?: string[];
  email?: string;
  phone?: string;
  linkedin?: string;
  notes?: string[];
  expertise?: string[];
  forceDuplicate?: boolean;
}) {
  // Validate full name (first + last)
  const nameParts = args.name.trim().split(/\s+/);
  if (nameParts.length < 2) {
    return {
      error: `Contact name must include both first and last name. Got: "${args.name}". Please ask the user for their full name.`,
    };
  }

  const contacts = await readContacts();

  // Duplicate check — find ALL matches
  const q = args.name.toLowerCase();
  const matches = contacts.filter(c =>
    c.name.toLowerCase().includes(q) ||
    (c.nickname && c.nickname.toLowerCase().includes(q))
  );

  if (matches.length > 0 && !args.forceDuplicate) {
    return {
      warning: `Found ${matches.length} existing contact(s) matching "${args.name}". If this is a different person, call add_contact again with forceDuplicate: true. Consider adding company or role to distinguish them.`,
      existingContacts: matches.map(contactSummary),
    };
  }

  const now = new Date().toISOString();
  const newContact: Contact = {
    id: generateId('c'),
    name: args.name,
    nickname: args.nickname ?? null,
    company: args.company ?? null,
    role: args.role ?? null,
    howWeMet: args.howWeMet ?? null,
    tags: args.tags ?? [],
    contactInfo: {
      email: args.email ?? null,
      phone: args.phone ?? null,
      linkedin: args.linkedin ?? null,
    },
    notes: args.notes ?? [],
    expertise: args.expertise ?? [],
    createdAt: now,
    updatedAt: now,
  };

  contacts.push(newContact);
  await writeContacts(contacts);
  await rebuildContactSummary(newContact.id);

  return { created: newContact };
}

// ── update_contact ───────────────────────────────────────────────────
export async function updateContact(args: {
  name?: string;
  contactId?: string;
  updates: Record<string, unknown>;
}) {
  const contacts = await readContacts();

  let contact: Contact | undefined;
  if (args.contactId) {
    contact = contacts.find(c => c.id === args.contactId);
  } else if (args.name) {
    contact = findContactByName(args.name, contacts) ?? undefined;
  } else {
    return { error: 'Provide either name or contactId' };
  }

  if (!contact) {
    return { error: `Contact not found: ${args.name ?? args.contactId}` };
  }

  const allowedTopLevel = ['name', 'nickname', 'company', 'role', 'howWeMet', 'tags', 'notes', 'expertise'];
  const allowedContactInfo = ['email', 'phone', 'linkedin'];

  for (const [key, value] of Object.entries(args.updates)) {
    if (allowedTopLevel.includes(key)) {
      (contact as any)[key] = value;
    } else if (allowedContactInfo.includes(key)) {
      (contact.contactInfo as any)[key] = value;
    }
  }

  contact.updatedAt = new Date().toISOString();
  await writeContacts(contacts);
  await rebuildContactSummary(contact.id);

  return { updated: contact };
}

// ── log_interaction ──────────────────────────────────────────────────
export async function logInteraction(args: {
  contactNames?: string[];
  contactIds?: string[];
  contactName?: string;
  contactId?: string;
  summary: string;
  date?: string;
  type?: string;
  topics?: string[];
  mentionedNextSteps?: string;
  location?: string;
  forceCreate?: boolean;
}) {
  const [contacts, interactions] = await Promise.all([readContacts(), readInteractions()]);

  // Resolve contact IDs — precedence: contactIds > contactNames > contactId > contactName
  let resolvedContactIds: string[] = [];

  if (args.contactIds && args.contactIds.length > 0) {
    // Validate all IDs exist
    for (const id of args.contactIds) {
      const found = contacts.find(c => c.id === id);
      if (!found) {
        return { error: `Contact not found with ID: ${id}` };
      }
    }
    resolvedContactIds = args.contactIds;
  } else if (args.contactNames && args.contactNames.length > 0) {
    // Resolve each name
    for (const name of args.contactNames) {
      const found = findContactByName(name, contacts);
      if (!found) {
        return { error: `Contact not found: ${name}` };
      }
      resolvedContactIds.push(found.id);
    }
  } else if (args.contactId) {
    const found = contacts.find(c => c.id === args.contactId);
    if (!found) {
      return { error: `Contact not found with ID: ${args.contactId}` };
    }
    resolvedContactIds = [args.contactId];
  } else if (args.contactName) {
    const found = findContactByName(args.contactName, contacts);
    if (!found) {
      return { error: `Contact not found: ${args.contactName}` };
    }
    resolvedContactIds = [found.id];
  } else {
    return { error: 'Provide contactNames/contactIds (for groups) or contactName/contactId (for single)' };
  }

  // Deduplicate
  resolvedContactIds = [...new Set(resolvedContactIds)];

  const contactMap = new Map(contacts.map(c => [c.id, c.name]));
  const participantNames = resolvedContactIds.map(id => contactMap.get(id) ?? 'Unknown');

  const interactionDate = args.date ?? new Date().toISOString().split('T')[0];

  // Duplicate detection: check for similar interactions within ±3 days
  if (!args.forceCreate) {
    const dateMs = new Date(interactionDate).getTime();
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    const nearby = interactions.filter(i => {
      // Check if ANY contactIds overlap with the new set
      const hasOverlap = i.contactIds.some(id => resolvedContactIds.includes(id));
      return hasOverlap && Math.abs(new Date(i.date).getTime() - dateMs) <= threeDays;
    });

    if (nearby.length > 0) {
      // Check for participant overlap ≥ 50% AND summary similarity
      const newWords = new Set(args.summary.toLowerCase().split(/\s+/).filter(w => w.length > 3));
      const similar = nearby.filter(i => {
        // Participant overlap check
        const sharedContacts = i.contactIds.filter(id => resolvedContactIds.includes(id)).length;
        const maxGroupSize = Math.max(i.contactIds.length, resolvedContactIds.length);
        const participantOverlap = sharedContacts / maxGroupSize;
        if (participantOverlap < 0.5) return false;

        // Summary word similarity
        const existingWords = i.summary.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const overlap = existingWords.filter(w => newWords.has(w)).length;
        return overlap >= Math.min(3, newWords.size * 0.3);
      });

      if (similar.length > 0) {
        return {
          warning: `Found ${similar.length} similar interaction(s) with overlapping participants within ±3 days. This may be a duplicate. If this is genuinely a different interaction, call log_interaction again with forceCreate: true. If you meant to update an existing interaction, use edit_interaction instead.`,
          similarInteractions: similar.map(i => ({
            id: i.id,
            date: i.date,
            type: i.type,
            summary: i.summary,
            topics: i.topics,
            participantNames: i.contactIds.map(id => contactMap.get(id) ?? 'Unknown'),
          })),
        };
      }
    }
  }

  const now = new Date().toISOString();
  const newInteraction: Interaction = {
    id: generateId('i'),
    contactIds: resolvedContactIds,
    date: interactionDate,
    type: (args.type as InteractionType) ?? 'catch-up',
    summary: args.summary,
    topics: args.topics ?? [],
    mentionedNextSteps: args.mentionedNextSteps ?? null,
    location: args.location ?? null,
    createdAt: now,
  };

  interactions.push(newInteraction);
  await writeInteractions(interactions);

  // Rebuild summaries for all participants in parallel
  await Promise.all(resolvedContactIds.map(id => rebuildContactSummary(id)));

  return {
    logged: newInteraction,
    participantNames,
    participantCount: resolvedContactIds.length,
  };
}

// ── edit_interaction ─────────────────────────────────────────────────
export async function editInteraction(args: {
  interactionId: string;
  updates: Record<string, unknown>;
}) {
  const interactions = await readInteractions();

  const interaction = interactions.find(i => i.id === args.interactionId);
  if (!interaction) {
    return { error: `Interaction not found: ${args.interactionId}` };
  }

  // Track old contactIds for summary rebuild
  const oldContactIds = [...interaction.contactIds];

  const allowedFields = ['summary', 'date', 'type', 'topics', 'mentionedNextSteps', 'location', 'contactIds'];

  for (const [key, value] of Object.entries(args.updates)) {
    if (allowedFields.includes(key)) {
      (interaction as any)[key] = value;
    }
  }

  interaction.updatedAt = new Date().toISOString();
  await writeInteractions(interactions);

  // Rebuild summaries for union of old + new contactIds
  const allContactIds = [...new Set([...oldContactIds, ...interaction.contactIds])];
  await Promise.all(allContactIds.map(id => rebuildContactSummary(id)));

  return { updated: interaction };
}

// ── get_recent_interactions ──────────────────────────────────────────
export async function getRecentInteractions(args: {
  contactName?: string;
  contactId?: string;
  since?: string;
  type?: string;
  limit?: number;
}) {
  const [contacts, interactions] = await Promise.all([readContacts(), readInteractions()]);

  let results = interactions;

  // Filter by contact (find interactions where this person participated)
  if (args.contactId) {
    results = results.filter(i => i.contactIds.includes(args.contactId!));
  } else if (args.contactName) {
    const contact = findContactByName(args.contactName, contacts);
    if (!contact) return { error: `Contact not found: ${args.contactName}` };
    results = results.filter(i => i.contactIds.includes(contact.id));
  }

  if (args.since) {
    results = results.filter(i => i.date >= args.since!);
  }

  if (args.type) {
    results = results.filter(i => i.type === args.type);
  }

  // Sort newest first
  results.sort((a, b) => b.date.localeCompare(a.date));

  const limit = args.limit ?? 20;
  results = results.slice(0, limit);

  // Enrich with participant names
  const contactMap = new Map(contacts.map(c => [c.id, c.name]));
  const enriched = results.map(i => ({
    ...i,
    participantNames: i.contactIds.map(id => contactMap.get(id) ?? 'Unknown'),
    participantCount: i.contactIds.length,
  }));

  return {
    count: enriched.length,
    interactions: enriched,
  };
}

// ── get_mentioned_next_steps ─────────────────────────────────────────
export async function getMentionedNextSteps(args: { limit?: number }) {
  const [contacts, interactions] = await Promise.all([readContacts(), readInteractions()]);

  const contactMap = new Map(contacts.map(c => [c.id, c.name]));

  const withNextSteps = interactions
    .filter(i => i.mentionedNextSteps)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, args.limit ?? 50)
    .map(i => ({
      participantNames: i.contactIds.map(id => contactMap.get(id) ?? 'Unknown'),
      contactIds: i.contactIds,
      interactionId: i.id,
      date: i.date,
      mentionedNextSteps: i.mentionedNextSteps,
      summary: i.summary,
      participantCount: i.contactIds.length,
    }));

  return {
    count: withNextSteps.length,
    mentionedNextSteps: withNextSteps,
  };
}

// ── get_tags ─────────────────────────────────────────────────────────
export async function getTags() {
  return await readTags();
}

// ── manage_tags ──────────────────────────────────────────────────────
export async function manageTags(args: {
  operation: 'add' | 'remove' | 'update' | 'list';
  category: 'contactTags' | 'interactionTopics' | 'expertiseAreas';
  tag?: string;
  description?: string;
  aliases?: string[];
  newTag?: string;
}) {
  const tags = await readTags();

  if (args.operation === 'list') {
    return { tags: tags[args.category] };
  }

  if (!args.tag) {
    return { error: 'Tag name is required for add/remove/update operations' };
  }

  const category = tags[args.category];

  if (args.operation === 'add') {
    const existing = category.find(e => e.tag === args.tag);
    if (existing) {
      return { error: `Tag "${args.tag}" already exists in ${args.category}` };
    }
    category.push({
      tag: args.tag,
      description: args.description ?? '',
      aliases: args.aliases ?? [],
    });
    await writeTags(tags);
    return { added: args.tag, category: args.category };
  }

  if (args.operation === 'remove') {
    const idx = category.findIndex(e => e.tag === args.tag);
    if (idx === -1) {
      return { error: `Tag "${args.tag}" not found in ${args.category}` };
    }
    const removed = category.splice(idx, 1)[0];
    await writeTags(tags);
    return { removed: removed };
  }

  if (args.operation === 'update') {
    const entry = category.find(e => e.tag === args.tag);
    if (!entry) {
      return { error: `Tag "${args.tag}" not found in ${args.category}` };
    }
    if (args.newTag) entry.tag = args.newTag;
    if (args.description) entry.description = args.description;
    if (args.aliases) entry.aliases = args.aliases;
    await writeTags(tags);
    return { updated: entry };
  }

  return { error: `Unknown operation: ${args.operation}` };
}

// ── delete_interaction ────────────────────────────────────────────────
export async function deleteInteraction(args: { interactionId: string }) {
  const interactions = await readInteractions();

  const idx = interactions.findIndex(i => i.id === args.interactionId);
  if (idx === -1) {
    return { error: `Interaction not found: ${args.interactionId}` };
  }

  const removed = interactions.splice(idx, 1)[0];
  await writeInteractions(interactions);

  // Rebuild summaries for ALL participants
  await Promise.all(removed.contactIds.map(id => rebuildContactSummary(id)));

  return { deleted: removed };
}

// ── delete_contact ──────────────────────────────────────────────────
export async function deleteContact(args: {
  name?: string;
  contactId?: string;
  deleteInteractions?: boolean;
}) {
  const [contacts, interactions, summaries] = await Promise.all([
    readContacts(), readInteractions(), readSummaries(),
  ]);

  let contact: Contact | undefined;
  if (args.contactId) {
    contact = contacts.find(c => c.id === args.contactId);
  } else if (args.name) {
    contact = findContactByName(args.name, contacts) ?? undefined;
  } else {
    return { error: 'Provide either name or contactId' };
  }

  if (!contact) {
    return { error: `Contact not found: ${args.name ?? args.contactId}` };
  }

  // Find related interactions — where this contact is a participant
  const relatedInteractions = interactions.filter(i => i.contactIds.includes(contact!.id));

  // Categorize: solo (only participant) vs group (one of many)
  const soloInteractions = relatedInteractions.filter(i => i.contactIds.length === 1);
  const groupInteractions = relatedInteractions.filter(i => i.contactIds.length > 1);

  // Handle related interactions if requested
  let deletedInteractionCount = 0;
  let updatedGroupInteractionCount = 0;

  // If there are related interactions but deleteInteractions wasn't set, return a warning
  // BEFORE mutating any state — the caller must confirm first.
  if (!args.deleteInteractions && relatedInteractions.length > 0) {
    const parts: string[] = [];
    if (soloInteractions.length > 0) parts.push(`${soloInteractions.length} solo`);
    if (groupInteractions.length > 0) parts.push(`${groupInteractions.length} group`);

    return {
      warning: `Contact "${contact.name}" has ${relatedInteractions.length} interaction(s) (${parts.join(', ')}). Solo interactions will be deleted; group interactions will have this contact removed but preserved. Set deleteInteractions: true to proceed.`,
      contact: contactSummary(contact),
      interactionCount: relatedInteractions.length,
      soloInteractionCount: soloInteractions.length,
      groupInteractionCount: groupInteractions.length,
    };
  }

  // Remove the contact
  const cIdx = contacts.findIndex(c => c.id === contact!.id);
  contacts.splice(cIdx, 1);

  if (relatedInteractions.length > 0) {
    const contactId = contact.id;

    // Delete solo interactions entirely
    const soloIds = new Set(soloInteractions.map(i => i.id));
    const filtered = interactions.filter(i => !soloIds.has(i.id));
    deletedInteractionCount = soloInteractions.length;

    // Remove contact from group interactions (preserve the interaction)
    const affectedGroupContactIds: string[] = [];
    for (const i of filtered) {
      if (i.contactIds.includes(contactId)) {
        i.contactIds = i.contactIds.filter(id => id !== contactId);
        i.updatedAt = new Date().toISOString();
        updatedGroupInteractionCount++;
        affectedGroupContactIds.push(...i.contactIds);
      }
    }

    await writeInteractions(filtered);

    // Rebuild summaries for remaining participants of group interactions
    const uniqueAffected = [...new Set(affectedGroupContactIds)];
    await Promise.all(uniqueAffected.map(id => rebuildContactSummary(id)));
  }

  // Remove from summaries
  const sIdx = summaries.findIndex(s => s.id === contact!.id);
  if (sIdx >= 0) summaries.splice(sIdx, 1);

  await Promise.all([writeContacts(contacts), writeSummaries(summaries)]);

  return {
    deleted: contactSummary(contact),
    deletedInteractionCount,
    updatedGroupInteractionCount,
  };
}
