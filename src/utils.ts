import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Contact, Interaction, TagDictionary, ContactSummary, CrmConfig } from './types.js';
import { EMPTY_TAG_DICTIONARY, DEFAULT_CONFIG } from '../shared/constants.js';
import { isContactPrivate } from '../shared/privacy.js';
import { buildContactSummary } from '../shared/summary.js';

// Re-export shared modules so existing callers don't break
export { generateContactId, generateInteractionId } from '../shared/id-generation.js';
export { isContactPrivate, isInteractionPrivate } from '../shared/privacy.js';
export { findContactByName } from '../shared/search.js';

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

export function readConfig(): CrmConfig {
  if (!existsSync(CONFIG_PATH)) return { ...DEFAULT_CONFIG };
  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(raw) as CrmConfig;
}

export function writeConfig(config: CrmConfig): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
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

  const summary = buildContactSummary(contactId, contacts, interactions);
  if (!summary) return;

  // Replace or insert
  const idx = summaries.findIndex(s => s.id === contactId);
  if (idx >= 0) {
    summaries[idx] = summary;
  } else {
    summaries.push(summary);
  }

  writeSummaries(summaries);
}

// --- Search helpers ---

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
