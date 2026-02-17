import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as uuidv4 } from 'uuid';
import type { Contact, Interaction } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

const CONTACTS_PATH = join(DATA_DIR, 'contacts.json');
const INTERACTIONS_PATH = join(DATA_DIR, 'interactions.json');

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

// --- ID generation ---

export function generateContactId(): string {
  return `c_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
}

export function generateInteractionId(): string {
  return `i_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
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
    .filter(i => i.contactId === contactId)
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
