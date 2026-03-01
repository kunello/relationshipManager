import {
  readContacts, writeContacts, readInteractions, writeInteractions,
  readTags, writeTags, readSummaries, writeSummaries,
  readConfig, writeConfig,
} from './gcs-data.js';
import { generateContactId, generateInteractionId } from './shared/id-generation.js';
import { isContactPrivate, isInteractionPrivate } from './shared/privacy.js';
import { findContactByName } from './shared/search.js';
import { buildContactSummary } from './shared/summary.js';
import { validateContactName } from './shared/validation.js';
import type { Contact, Interaction, InteractionType, ContactSummary } from './types.js';

function contactSummaryView(c: Contact): object {
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

// ── Privacy helpers ─────────────────────────────────────────────────

async function isUnlocked(privateKey?: string): Promise<boolean> {
  if (!privateKey) return false;
  const config = await readConfig();
  return config.privateKey !== '' && privateKey === config.privateKey;
}

function filterPrivateContacts(contacts: Contact[], unlocked: boolean): Contact[] {
  return unlocked ? contacts : contacts.filter(c => !isContactPrivate(c));
}

function filterPrivateInteractions(interactions: Interaction[], contacts: Contact[], unlocked: boolean): Interaction[] {
  return unlocked ? interactions : interactions.filter(i => !isInteractionPrivate(i, contacts));
}

/** Redact private participants from an interaction's contactIds/participantNames. */
function redactInteractionParticipants(
  interaction: Interaction,
  contacts: Contact[],
  contactMap: Map<string, string>,
  unlocked: boolean,
): { contactIds: string[]; participantNames: string[]; participantCount: number } {
  if (unlocked) {
    return {
      contactIds: interaction.contactIds,
      participantNames: interaction.contactIds.map(id => contactMap.get(id) ?? 'Unknown'),
      participantCount: interaction.contactIds.length,
    };
  }
  const visibleIds = interaction.contactIds.filter(id => {
    const c = contacts.find(ct => ct.id === id);
    return !c || !isContactPrivate(c);
  });
  return {
    contactIds: visibleIds,
    participantNames: visibleIds.map(id => contactMap.get(id) ?? 'Unknown'),
    participantCount: visibleIds.length,
  };
}

// ── Contact summary generation ────────────────────────────────────────

/** Rebuild summary for a single contact. Safe for single-contact operations. */
async function rebuildContactSummary(contactId: string): Promise<void> {
  return rebuildContactSummaries([contactId]);
}

/** Rebuild summaries for multiple contacts in a single read-write cycle. */
async function rebuildContactSummaries(contactIds: string[]): Promise<void> {
  if (contactIds.length === 0) return;

  const [contacts, interactions, summaries] = await Promise.all([
    readContacts(), readInteractions(), readSummaries(),
  ]);

  for (const contactId of contactIds) {
    const contact = contacts.find(c => c.id === contactId);

    // Remove summary for private contacts
    if (contact && isContactPrivate(contact)) {
      const idx = summaries.findIndex(s => s.id === contactId);
      if (idx >= 0) summaries.splice(idx, 1);
      continue;
    }

    const summary = buildContactSummary(contactId, contacts, interactions);
    if (!summary) continue;

    const idx = summaries.findIndex(s => s.id === contactId);
    if (idx >= 0) {
      summaries[idx] = summary;
    } else {
      summaries.push(summary);
    }
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
  privateKey?: string;
}) {
  const contacts = await readContacts();
  const unlocked = await isUnlocked(args.privateKey);
  let results = filterPrivateContacts(contacts, unlocked);

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
    contacts: results.map(contactSummaryView),
  };
}

// ── get_contact ──────────────────────────────────────────────────────
export async function getContact(args: { name?: string; contactId?: string; privateKey?: string }) {
  const [contacts, interactions] = await Promise.all([readContacts(), readInteractions()]);
  const unlocked = await isUnlocked(args.privateKey);

  let contact: Contact | undefined;
  if (args.contactId) {
    contact = contacts.find(c => c.id === args.contactId);
  } else if (args.name) {
    contact = findContactByName(args.name, contacts)[0];
  } else {
    return { error: 'Provide either name or contactId' };
  }

  if (!contact) {
    return { error: `Contact not found: ${args.name ?? args.contactId}` };
  }

  // Block access to private contacts without key
  if (isContactPrivate(contact) && !unlocked) {
    return { error: `Contact not found: ${args.name ?? args.contactId}` };
  }

  const contactMap = new Map(contacts.map(c => [c.id, c.name]));

  // Filter private interactions
  const visibleInteractions = filterPrivateInteractions(
    interactions.filter(i => i.contactIds.includes(contact!.id)),
    contacts,
    unlocked,
  );

  const contactInteractions = visibleInteractions
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(i => {
      const redacted = redactInteractionParticipants(i, contacts, contactMap, unlocked);
      return { ...i, ...redacted };
    });

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
  private?: boolean;
  privateKey?: string;
}) {
  // Validate full name (first + last)
  const nameCheck = validateContactName(args.name);
  if (!nameCheck.valid) {
    return {
      error: `${nameCheck.error}. Please ask the user for their full name.`,
    };
  }

  const contacts = await readContacts();

  // Duplicate check — find ALL matches
  const matches = findContactByName(args.name, contacts);

  if (matches.length > 0 && !args.forceDuplicate) {
    return {
      warning: `Found ${matches.length} existing contact(s) matching "${args.name}". If this is a different person, call add_contact again with forceDuplicate: true. Consider adding company or role to distinguish them.`,
      existingContacts: matches.map(contactSummaryView),
    };
  }

  const now = new Date().toISOString();
  const newContact: Contact = {
    id: generateContactId(),
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

  if (args.private) {
    newContact.private = true;
  }

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
  privateKey?: string;
}) {
  const contacts = await readContacts();
  const unlocked = await isUnlocked(args.privateKey);

  let contact: Contact | undefined;
  if (args.contactId) {
    contact = contacts.find(c => c.id === args.contactId);
  } else if (args.name) {
    contact = findContactByName(args.name, contacts)[0];
  } else {
    return { error: 'Provide either name or contactId' };
  }

  if (!contact) {
    return { error: `Contact not found: ${args.name ?? args.contactId}` };
  }

  // Require key to update private contacts
  if (isContactPrivate(contact) && !unlocked) {
    return { error: `Contact not found: ${args.name ?? args.contactId}` };
  }

  const allowedTopLevel = ['name', 'nickname', 'company', 'role', 'howWeMet', 'tags', 'notes', 'expertise', 'private'];
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
  private?: boolean;
  privateKey?: string;
}) {
  const [contacts, interactions] = await Promise.all([readContacts(), readInteractions()]);
  const unlocked = await isUnlocked(args.privateKey);

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
      const found = findContactByName(name, contacts)[0];
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
    const found = findContactByName(args.contactName, contacts)[0];
    if (!found) {
      return { error: `Contact not found: ${args.contactName}` };
    }
    resolvedContactIds = [found.id];
  } else {
    return { error: 'Provide contactNames/contactIds (for groups) or contactName/contactId (for single)' };
  }

  // Deduplicate
  resolvedContactIds = [...new Set(resolvedContactIds)];

  // Require key if any participant is private
  const hasPrivateParticipant = resolvedContactIds.some(id => {
    const c = contacts.find(ct => ct.id === id);
    return c && isContactPrivate(c);
  });
  if (hasPrivateParticipant && !unlocked) {
    return { error: 'Cannot log interaction with private contact without privateKey' };
  }

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
    id: generateInteractionId(),
    contactIds: resolvedContactIds,
    date: interactionDate,
    type: (args.type as InteractionType) ?? 'catch-up',
    summary: args.summary,
    topics: args.topics ?? [],
    mentionedNextSteps: args.mentionedNextSteps ?? null,
    location: args.location ?? null,
    createdAt: now,
  };

  if (args.private) {
    newInteraction.private = true;
  }

  interactions.push(newInteraction);
  await writeInteractions(interactions);

  // Rebuild summaries for all participants in a single read-write cycle
  await rebuildContactSummaries(resolvedContactIds);

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
  privateKey?: string;
}) {
  const [contacts, interactions] = await Promise.all([readContacts(), readInteractions()]);
  const unlocked = await isUnlocked(args.privateKey);

  const interaction = interactions.find(i => i.id === args.interactionId);
  if (!interaction) {
    return { error: `Interaction not found: ${args.interactionId}` };
  }

  // Require key to edit private interactions
  if (isInteractionPrivate(interaction, contacts) && !unlocked) {
    return { error: `Interaction not found: ${args.interactionId}` };
  }

  // Track old contactIds for summary rebuild
  const oldContactIds = [...interaction.contactIds];

  const allowedFields = ['summary', 'date', 'type', 'topics', 'mentionedNextSteps', 'location', 'contactIds', 'private'];

  for (const [key, value] of Object.entries(args.updates)) {
    if (allowedFields.includes(key)) {
      (interaction as any)[key] = value;
    }
  }

  interaction.updatedAt = new Date().toISOString();
  await writeInteractions(interactions);

  // Rebuild summaries for union of old + new contactIds
  const allContactIds = [...new Set([...oldContactIds, ...interaction.contactIds])];
  await rebuildContactSummaries(allContactIds);

  return { updated: interaction };
}

// ── get_recent_interactions ──────────────────────────────────────────
export async function getRecentInteractions(args: {
  contactName?: string;
  contactId?: string;
  since?: string;
  type?: string;
  limit?: number;
  privateKey?: string;
}) {
  const [contacts, interactions] = await Promise.all([readContacts(), readInteractions()]);
  const unlocked = await isUnlocked(args.privateKey);

  let results = filterPrivateInteractions(interactions, contacts, unlocked);

  // Filter by contact (find interactions where this person participated)
  if (args.contactId) {
    // Require key to filter by private contact
    const contact = contacts.find(c => c.id === args.contactId);
    if (contact && isContactPrivate(contact) && !unlocked) {
      return { error: `Contact not found: ${args.contactId}` };
    }
    results = results.filter(i => i.contactIds.includes(args.contactId!));
  } else if (args.contactName) {
    const contact = findContactByName(args.contactName, contacts)[0];
    if (!contact) return { error: `Contact not found: ${args.contactName}` };
    if (isContactPrivate(contact) && !unlocked) {
      return { error: `Contact not found: ${args.contactName}` };
    }
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

  // Enrich with participant names (redact private participants)
  const contactMap = new Map(contacts.map(c => [c.id, c.name]));
  const enriched = results.map(i => {
    const redacted = redactInteractionParticipants(i, contacts, contactMap, unlocked);
    return { ...i, ...redacted };
  });

  return {
    count: enriched.length,
    interactions: enriched,
  };
}

// ── get_mentioned_next_steps ─────────────────────────────────────────
export async function getMentionedNextSteps(args: { limit?: number; privateKey?: string }) {
  const [contacts, interactions] = await Promise.all([readContacts(), readInteractions()]);
  const unlocked = await isUnlocked(args.privateKey);

  const contactMap = new Map(contacts.map(c => [c.id, c.name]));

  const visibleInteractions = filterPrivateInteractions(interactions, contacts, unlocked);

  const withNextSteps = visibleInteractions
    .filter(i => i.mentionedNextSteps)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, args.limit ?? 50)
    .map(i => {
      const redacted = redactInteractionParticipants(i, contacts, contactMap, unlocked);
      return {
        participantNames: redacted.participantNames,
        contactIds: redacted.contactIds,
        interactionId: i.id,
        date: i.date,
        mentionedNextSteps: i.mentionedNextSteps,
        summary: i.summary,
        participantCount: redacted.participantCount,
      };
    });

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

// ── manage_privacy ──────────────────────────────────────────────────
export async function managePrivacy(args: {
  operation: 'set_key' | 'status';
  currentKey?: string;
  newKey?: string;
}) {
  if (args.operation === 'status') {
    const config = await readConfig();
    const [contacts, interactions] = await Promise.all([readContacts(), readInteractions()]);
    const privateContactCount = contacts.filter(c => isContactPrivate(c)).length;
    const privateInteractionCount = interactions.filter(i => i.private === true).length;

    return {
      keyIsSet: config.privateKey !== '',
      privateContactCount,
      privateInteractionCount,
    };
  }

  if (args.operation === 'set_key') {
    if (!args.newKey) {
      return { error: 'newKey is required for set_key operation' };
    }

    const config = await readConfig();

    // If a key already exists, require currentKey to change it
    if (config.privateKey !== '' && args.currentKey !== config.privateKey) {
      return { error: 'Incorrect currentKey. Provide the existing key to change it.' };
    }

    config.privateKey = args.newKey;
    await writeConfig(config);

    return { success: true, message: 'Privacy key has been set.' };
  }

  return { error: `Unknown operation: ${args.operation}` };
}

// ── delete_interaction ────────────────────────────────────────────────
export async function deleteInteraction(args: { interactionId: string; privateKey?: string }) {
  const [contacts, interactions] = await Promise.all([readContacts(), readInteractions()]);
  const unlocked = await isUnlocked(args.privateKey);

  const idx = interactions.findIndex(i => i.id === args.interactionId);
  if (idx === -1) {
    return { error: `Interaction not found: ${args.interactionId}` };
  }

  const interaction = interactions[idx];

  // Require key to delete private interactions
  if (isInteractionPrivate(interaction, contacts) && !unlocked) {
    return { error: `Interaction not found: ${args.interactionId}` };
  }

  const removed = interactions.splice(idx, 1)[0];
  await writeInteractions(interactions);

  // Rebuild summaries for ALL participants
  await rebuildContactSummaries(removed.contactIds);

  return { deleted: removed };
}

// ── delete_contact ──────────────────────────────────────────────────
export async function deleteContact(args: {
  name?: string;
  contactId?: string;
  deleteInteractions?: boolean;
  privateKey?: string;
}) {
  const [contacts, interactions, summaries] = await Promise.all([
    readContacts(), readInteractions(), readSummaries(),
  ]);
  const unlocked = await isUnlocked(args.privateKey);

  let contact: Contact | undefined;
  if (args.contactId) {
    contact = contacts.find(c => c.id === args.contactId);
  } else if (args.name) {
    contact = findContactByName(args.name, contacts)[0];
  } else {
    return { error: 'Provide either name or contactId' };
  }

  if (!contact) {
    return { error: `Contact not found: ${args.name ?? args.contactId}` };
  }

  // Require key to delete private contacts
  if (isContactPrivate(contact) && !unlocked) {
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
      contact: contactSummaryView(contact),
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
    await rebuildContactSummaries(uniqueAffected);
  }

  // Remove from summaries
  const sIdx = summaries.findIndex(s => s.id === contact!.id);
  if (sIdx >= 0) summaries.splice(sIdx, 1);

  await Promise.all([writeContacts(contacts), writeSummaries(summaries)]);

  return {
    deleted: contactSummaryView(contact),
    deletedInteractionCount,
    updatedGroupInteractionCount,
  };
}
