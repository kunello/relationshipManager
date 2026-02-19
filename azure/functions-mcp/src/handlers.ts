import { randomBytes } from 'crypto';
import { readContacts, writeContacts, readInteractions, writeInteractions } from './blob-data.js';
import type { Contact, Interaction, InteractionType } from './types.js';

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
  };
}

// ── search_contacts ──────────────────────────────────────────────────
export async function searchContacts(args: {
  query?: string;
  tag?: string;
  company?: string;
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
      c.tags.some(t => t.toLowerCase().includes(q))
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

  const contactInteractions = interactions
    .filter(i => i.contactId === contact!.id)
    .sort((a, b) => b.date.localeCompare(a.date));

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
}) {
  const contacts = await readContacts();

  // Duplicate check
  const existing = findContactByName(args.name, contacts);
  if (existing) {
    return {
      warning: `A contact matching "${args.name}" already exists`,
      existingContact: contactSummary(existing),
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
    createdAt: now,
    updatedAt: now,
  };

  contacts.push(newContact);
  await writeContacts(contacts);

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

  const allowedTopLevel = ['name', 'nickname', 'company', 'role', 'howWeMet', 'tags'];
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

  return { updated: contact };
}

// ── log_interaction ──────────────────────────────────────────────────
export async function logInteraction(args: {
  contactName?: string;
  contactId?: string;
  summary: string;
  date?: string;
  type?: string;
  topics?: string[];
  followUp?: string;
}) {
  const [contacts, interactions] = await Promise.all([readContacts(), readInteractions()]);

  let contact: Contact | undefined;
  if (args.contactId) {
    contact = contacts.find(c => c.id === args.contactId);
  } else if (args.contactName) {
    contact = findContactByName(args.contactName, contacts) ?? undefined;
  } else {
    return { error: 'Provide either contactName or contactId' };
  }

  if (!contact) {
    return { error: `Contact not found: ${args.contactName ?? args.contactId}` };
  }

  const now = new Date().toISOString();
  const newInteraction: Interaction = {
    id: generateId('i'),
    contactId: contact.id,
    date: args.date ?? now.split('T')[0],
    type: (args.type as InteractionType) ?? 'catch-up',
    summary: args.summary,
    topics: args.topics ?? [],
    followUp: args.followUp ?? null,
    createdAt: now,
  };

  interactions.push(newInteraction);
  await writeInteractions(interactions);

  return {
    logged: newInteraction,
    contactName: contact.name,
  };
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

  // Filter by contact
  if (args.contactId) {
    results = results.filter(i => i.contactId === args.contactId);
  } else if (args.contactName) {
    const contact = findContactByName(args.contactName, contacts);
    if (!contact) return { error: `Contact not found: ${args.contactName}` };
    results = results.filter(i => i.contactId === contact.id);
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

  // Enrich with contact names
  const contactMap = new Map(contacts.map(c => [c.id, c.name]));
  const enriched = results.map(i => ({
    ...i,
    contactName: contactMap.get(i.contactId) ?? 'Unknown',
  }));

  return {
    count: enriched.length,
    interactions: enriched,
  };
}

// ── get_followups ────────────────────────────────────────────────────
export async function getFollowups(args: { limit?: number }) {
  const [contacts, interactions] = await Promise.all([readContacts(), readInteractions()]);

  const contactMap = new Map(contacts.map(c => [c.id, c.name]));

  const withFollowups = interactions
    .filter(i => i.followUp)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, args.limit ?? 50)
    .map(i => ({
      contactName: contactMap.get(i.contactId) ?? 'Unknown',
      contactId: i.contactId,
      interactionId: i.id,
      date: i.date,
      followUp: i.followUp,
      summary: i.summary,
    }));

  return {
    count: withFollowups.length,
    followups: withFollowups,
  };
}
