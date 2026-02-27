import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as uuidv4 } from 'uuid';
import type { Contact, Interaction, TagDictionary, ContactSummary, CrmConfig } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

const CONTACTS_PATH = join(DATA_DIR, 'contacts.json');
const INTERACTIONS_PATH = join(DATA_DIR, 'interactions.json');
const TAGS_PATH = join(DATA_DIR, 'tags.json');
const SUMMARIES_PATH = join(DATA_DIR, 'contact-summaries.json');
const CONFIG_PATH = join(DATA_DIR, 'config.json');

// --- Read/Write helpers ---

export function readContacts(): Contact[] {
  const raw = readFileSync(CONTACTS_PATH, 'utf-8');
  return JSON.parse(raw) as Contact[];
}

export function writeContacts(contacts: Contact[]): void {
  writeFileSync(CONTACTS_PATH, JSON.stringify(contacts, null, 2) + '\n', 'utf-8');
}

export function readInteractions(): Interaction[] {
  const raw = readFileSync(INTERACTIONS_PATH, 'utf-8');
  return JSON.parse(raw) as Interaction[];
}

export function writeInteractions(interactions: Interaction[]): void {
  writeFileSync(INTERACTIONS_PATH, JSON.stringify(interactions, null, 2) + '\n', 'utf-8');
}

const EMPTY_TAG_DICTIONARY: TagDictionary = {
  version: 1,
  contactTags: [],
  interactionTopics: [],
  expertiseAreas: [],
};

export function readTags(): TagDictionary {
  if (!existsSync(TAGS_PATH)) return { ...EMPTY_TAG_DICTIONARY };
  const raw = readFileSync(TAGS_PATH, 'utf-8');
  return JSON.parse(raw) as TagDictionary;
}

export function writeTags(tags: TagDictionary): void {
  writeFileSync(TAGS_PATH, JSON.stringify(tags, null, 2) + '\n', 'utf-8');
}

export function readSummaries(): ContactSummary[] {
  if (!existsSync(SUMMARIES_PATH)) return [];
  const raw = readFileSync(SUMMARIES_PATH, 'utf-8');
  return JSON.parse(raw) as ContactSummary[];
}

export function writeSummaries(summaries: ContactSummary[]): void {
  writeFileSync(SUMMARIES_PATH, JSON.stringify(summaries, null, 2) + '\n', 'utf-8');
}

const DEFAULT_CONFIG: CrmConfig = { privateKey: '' };

export function readConfig(): CrmConfig {
  if (!existsSync(CONFIG_PATH)) return { ...DEFAULT_CONFIG };
  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(raw) as CrmConfig;
}

export function writeConfig(config: CrmConfig): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

// --- ID generation ---

export function generateContactId(): string {
  return `c_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
}

export function generateInteractionId(): string {
  return `i_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
}

// --- Contact summary generation ---

export function rebuildContactSummary(contactId: string): void {
  const contacts = readContacts();
  const interactions = readInteractions();
  const summaries = readSummaries();

  const contact = contacts.find(c => c.id === contactId);
  if (!contact) return;

  // Remove summary for private contacts
  if (isContactPrivate(contact)) {
    const idx = summaries.findIndex(s => s.id === contactId);
    if (idx >= 0) summaries.splice(idx, 1);
    writeSummaries(summaries);
    return;
  }

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

  writeSummaries(summaries);
}

// --- Privacy helpers ---

export function isContactPrivate(contact: Contact): boolean {
  return contact.private === true;
}

export function isInteractionPrivate(interaction: Interaction, contacts: Contact[]): boolean {
  if (interaction.private === true) return true;
  return interaction.contactIds.some(id => {
    const c = contacts.find(ct => ct.id === id);
    return c && isContactPrivate(c);
  });
}

// --- Search helpers ---

export function findContactByName(query: string, contacts?: Contact[]): Contact[] {
  const all = contacts ?? readContacts();
  const q = query.toLowerCase();
  return all.filter(c =>
    c.name.toLowerCase().includes(q) ||
    (c.nickname && c.nickname.toLowerCase().includes(q))
  );
}

export function getInteractionsForContact(contactId: string, interactions?: Interaction[]): Interaction[] {
  const all = interactions ?? readInteractions();
  return all
    .filter(i => i.contactIds.includes(contactId))
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first
}

// --- Arg parsing helper ---

export function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = 'true';
      }
    } else {
      positional.push(arg);
    }
  }

  if (positional.length > 0) {
    args['_positional'] = positional.join(' ');
  }
  return args;
}
