import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readContacts, writeContacts, readInteractions, writeInteractions,
  generateContactId, generateInteractionId, findContactByName,
} from '../src/utils.js';
import type { Contact, Interaction, InteractionType } from '../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMPORT_DIR = join(__dirname, '..', 'import');

// --- Arg parsing ---
const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
const fileFlag = args.indexOf('--file');
const singleFile = fileFlag !== -1 ? args[fileFlag + 1] : null;

// --- Types for import pipeline ---
interface ImportedContact {
  name: string;
  company?: string;
  role?: string;
  howWeMet?: string;
  tags?: string[];
  email?: string;
  phone?: string;
  linkedin?: string;
  nickname?: string;
}

interface ImportedInteraction {
  contactName: string;
  date: string;
  type: InteractionType;
  summary: string;
  topics?: string[];
  followUp?: string;
}

interface ImportResult {
  contacts: ImportedContact[];
  interactions: ImportedInteraction[];
  sourceFile: string;
}

// --- File parsers ---

function parseCSV(content: string, sourceFile: string): ImportResult {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return { contacts: [], interactions: [], sourceFile };

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const contacts: ImportedContact[] = [];

  for (let i = 1; i < lines.length; i++) {
    // Simple CSV parsing (handles quoted fields with commas)
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });

    const name = row['name'] || row['full name'] || row['first name']
      ? `${row['first name'] ?? ''} ${row['last name'] ?? ''}`.trim()
      : '';

    if (!name) continue;

    contacts.push({
      name,
      company: row['company'] || row['organization'] || undefined,
      role: row['role'] || row['title'] || row['job title'] || undefined,
      email: row['email'] || row['e-mail'] || row['email address'] || undefined,
      phone: row['phone'] || row['phone number'] || row['mobile'] || undefined,
      tags: row['tags'] ? row['tags'].split(';').map(t => t.trim()) : undefined,
    });
  }

  return { contacts, interactions: [], sourceFile };
}

function parseJSON(content: string, sourceFile: string): ImportResult {
  const data = JSON.parse(content);
  const items = Array.isArray(data) ? data : [data];
  const contacts: ImportedContact[] = [];
  const interactions: ImportedInteraction[] = [];

  for (const item of items) {
    if (item.name) {
      contacts.push({
        name: item.name,
        company: item.company,
        role: item.role,
        howWeMet: item.howWeMet,
        tags: item.tags,
        email: item.email || item.contactInfo?.email,
        phone: item.phone || item.contactInfo?.phone,
        linkedin: item.linkedin || item.contactInfo?.linkedin,
        nickname: item.nickname,
      });
    }
    if (item.summary && item.contactName) {
      interactions.push({
        contactName: item.contactName,
        date: item.date || new Date().toISOString().slice(0, 10),
        type: item.type || 'other',
        summary: item.summary,
        topics: item.topics,
        followUp: item.followUp,
      });
    }
  }

  return { contacts, interactions, sourceFile };
}

function parseMarkdown(content: string, sourceFile: string): ImportResult {
  const contacts: ImportedContact[] = [];
  const interactions: ImportedInteraction[] = [];

  // Split by headings (## or #) — each heading assumed to be a person or section
  const sections = content.split(/^#{1,3}\s+/m).filter(s => s.trim());

  for (const section of sections) {
    const lines = section.trim().split('\n');
    const heading = lines[0]?.trim();
    if (!heading) continue;

    const body = lines.slice(1).join('\n').trim();

    // Heuristic: if heading looks like a person name (2-4 words, title case)
    const namePattern = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}$/;
    if (namePattern.test(heading)) {
      const contact: ImportedContact = { name: heading };

      // Extract metadata from body
      const companyMatch = body.match(/(?:company|works?\s+at|@)\s*[:\-]?\s*(.+)/i);
      if (companyMatch) contact.company = companyMatch[1].trim();

      const roleMatch = body.match(/(?:role|title|position)\s*[:\-]?\s*(.+)/i);
      if (roleMatch) contact.role = roleMatch[1].trim();

      const emailMatch = body.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
      if (emailMatch) contact.email = emailMatch[0];

      const metMatch = body.match(/(?:met|how\s+we\s+met|intro)\s*[:\-]?\s*(.+)/i);
      if (metMatch) contact.howWeMet = metMatch[1].trim();

      contacts.push(contact);

      // If there's substantial content beyond metadata, treat it as an interaction
      const cleanBody = body
        .replace(/(?:company|works?\s+at|@|role|title|position|email|met|how\s+we\s+met|intro)\s*[:\-]?\s*.+/gi, '')
        .trim();
      if (cleanBody.length > 30) {
        interactions.push({
          contactName: heading,
          date: new Date().toISOString().slice(0, 10),
          type: 'other',
          summary: cleanBody.slice(0, 500),
          topics: [],
        });
      }
    }
  }

  return { contacts, interactions, sourceFile };
}

// --- Main import pipeline ---

function getFilesToProcess(): string[] {
  if (singleFile) {
    return [join(IMPORT_DIR, singleFile)];
  }

  return readdirSync(IMPORT_DIR)
    .filter(f => f !== '.gitkeep' && !f.startsWith('.'))
    .map(f => join(IMPORT_DIR, f))
    .filter(f => statSync(f).isFile());
}

function processFile(filePath: string): ImportResult {
  const ext = extname(filePath).toLowerCase();
  const content = readFileSync(filePath, 'utf-8');
  const sourceFile = basename(filePath);

  switch (ext) {
    case '.csv':
      return parseCSV(content, sourceFile);
    case '.json':
      return parseJSON(content, sourceFile);
    case '.md':
    case '.txt':
      return parseMarkdown(content, sourceFile);
    default:
      console.warn(`⚠  Skipping unsupported file type: ${sourceFile} (${ext})`);
      return { contacts: [], interactions: [], sourceFile };
  }
}

// --- Execute ---

const files = getFilesToProcess();

if (files.length === 0) {
  console.log('No files found in import/ directory.');
  console.log('Drop .csv, .json, .md, or .txt files there and re-run.');
  process.exit(0);
}

console.log(`📂 Processing ${files.length} file(s)...\n`);

const existingContacts = readContacts();
const existingInteractions = readInteractions();

const newContacts: Contact[] = [];
const newInteractions: Interaction[] = [];
const now = new Date().toISOString();

for (const file of files) {
  const result = processFile(file);
  console.log(`  ${result.sourceFile}: ${result.contacts.length} contact(s), ${result.interactions.length} interaction(s)`);

  for (const imported of result.contacts) {
    // Deduplicate: check existing + already-queued new contacts
    const allKnown = [...existingContacts, ...newContacts];
    const dupes = findContactByName(imported.name, allKnown);

    if (dupes.length > 0) {
      console.log(`    ↳ Skipping "${imported.name}" — matches existing: ${dupes[0].name} (${dupes[0].id})`);
      continue;
    }

    const contact: Contact = {
      id: generateContactId(),
      name: imported.name,
      nickname: imported.nickname ?? null,
      company: imported.company ?? null,
      role: imported.role ?? null,
      howWeMet: imported.howWeMet ?? null,
      tags: imported.tags ?? [],
      contactInfo: {
        email: imported.email ?? null,
        phone: imported.phone ?? null,
        linkedin: imported.linkedin ?? null,
      },
      createdAt: now,
      updatedAt: now,
    };
    newContacts.push(contact);
  }

  for (const imported of result.interactions) {
    // Find matching contact (existing or newly created)
    const allKnown = [...existingContacts, ...newContacts];
    const matches = findContactByName(imported.contactName, allKnown);

    if (matches.length === 0) {
      console.log(`    ↳ Skipping interaction for "${imported.contactName}" — no matching contact found`);
      continue;
    }

    const interaction: Interaction = {
      id: generateInteractionId(),
      contactId: matches[0].id,
      date: imported.date,
      type: imported.type,
      summary: imported.summary,
      topics: imported.topics ?? [],
      followUp: imported.followUp ?? null,
      createdAt: now,
    };
    newInteractions.push(interaction);
  }
}

// --- Preview / Commit ---

console.log('\n' + '─'.repeat(50));
console.log(`📊 Import summary:`);
console.log(`   New contacts:     ${newContacts.length}`);
console.log(`   New interactions: ${newInteractions.length}`);

if (newContacts.length === 0 && newInteractions.length === 0) {
  console.log('\nNothing new to import.');
  process.exit(0);
}

if (newContacts.length > 0) {
  console.log('\n   New contacts:');
  for (const c of newContacts) {
    console.log(`     + ${c.name}${c.company ? ` (${c.company})` : ''}`);
  }
}

if (newInteractions.length > 0) {
  console.log('\n   New interactions:');
  for (const i of newInteractions) {
    const contactName = [...existingContacts, ...newContacts].find(c => c.id === i.contactId)?.name ?? 'Unknown';
    console.log(`     + [${i.date}] ${i.type} with ${contactName}: ${i.summary.slice(0, 60)}...`);
  }
}

if (!confirm) {
  console.log('\n🔍 Dry run — no changes written.');
  console.log('   Re-run with --confirm to write to data files.');
} else {
  writeContacts([...existingContacts, ...newContacts]);
  writeInteractions([...existingInteractions, ...newInteractions]);
  console.log('\n✅ Data written successfully.');
}
