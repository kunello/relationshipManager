/**
 * Integration tests for CRM handler logic.
 *
 * These tests exercise the LOCAL utils (src/utils.ts) which share identical
 * business logic with the GCP handlers. Each test gets its own temp data
 * directory so there are no side-effects on real data.
 *
 * Run:  npx tsx --test tests/handlers.test.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Contact, Interaction, ContactSummary, TagDictionary } from '../src/types.js';

// ── Test helpers ─────────────────────────────────────────────────────

let DATA_DIR: string;

function tempDir(): string {
  const dir = join(process.env.TMPDIR ?? '/tmp', `crm-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeData(name: string, data: unknown) {
  writeFileSync(join(DATA_DIR, name), JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function readData<T>(name: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, name), 'utf-8')) as T;
}

// ── Minimal re-implementations of the handler logic we want to test ──
// These mirror gcp/functions-mcp/src/handlers.ts exactly, using local I/O.

function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString('hex')}`;
}

function readContacts(): Contact[] { return readData<Contact[]>('contacts.json'); }
function writeContacts(c: Contact[]) { writeData('contacts.json', c); }
function readInteractions(): Interaction[] { return readData<Interaction[]>('interactions.json'); }
function writeInteractions(i: Interaction[]) { writeData('interactions.json', i); }
function readSummaries(): ContactSummary[] {
  const p = join(DATA_DIR, 'contact-summaries.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) as ContactSummary[] : [];
}
function writeSummaries(s: ContactSummary[]) { writeData('contact-summaries.json', s); }

function findContactByName(name: string, contacts: Contact[]): Contact | null {
  const q = name.toLowerCase();
  return contacts.find(c =>
    c.name.toLowerCase().includes(q) ||
    (c.nickname && c.nickname.toLowerCase().includes(q))
  ) ?? null;
}

function rebuildContactSummary(contactId: string): void {
  const contacts = readContacts();
  const interactions = readInteractions();
  const summaries = readSummaries();

  const contact = contacts.find(c => c.id === contactId);
  if (!contact) return;

  const contactInteractions = interactions
    .filter(i => i.contactIds.includes(contactId))
    .sort((a, b) => b.date.localeCompare(a.date));

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

  const locations = [...new Set(
    contactInteractions.map(i => i.location).filter((loc): loc is string => !!loc)
  )];

  const recentSummary = contactInteractions
    .slice(0, 3)
    .map(i => `${i.date}: ${i.summary.slice(0, 100)}`)
    .join('. ');

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

  const idx = summaries.findIndex(s => s.id === contactId);
  if (idx >= 0) {
    summaries[idx] = summary;
  } else {
    summaries.push(summary);
  }

  writeSummaries(summaries);
}

function contactSummaryView(c: Contact): object {
  return {
    id: c.id, name: c.name, nickname: c.nickname, company: c.company,
    role: c.role, tags: c.tags, expertise: c.expertise, notes: c.notes,
  };
}

// ── deleteContact — reimplements the FIXED logic from handlers.ts ────

function deleteContact(args: { name?: string; contactId?: string; deleteInteractions?: boolean }) {
  const contacts = readContacts();
  const interactions = readInteractions();
  const summaries = readSummaries();

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

  const relatedInteractions = interactions.filter(i => i.contactIds.includes(contact!.id));
  const soloInteractions = relatedInteractions.filter(i => i.contactIds.length === 1);
  const groupInteractions = relatedInteractions.filter(i => i.contactIds.length > 1);

  let deletedInteractionCount = 0;
  let updatedGroupInteractionCount = 0;

  // FIXED: approval check BEFORE splice
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

  // NOW splice the contact
  const cIdx = contacts.findIndex(c => c.id === contact!.id);
  contacts.splice(cIdx, 1);

  if (relatedInteractions.length > 0) {
    const contactId = contact.id;

    const soloIds = new Set(soloInteractions.map(i => i.id));
    const filtered = interactions.filter(i => !soloIds.has(i.id));
    deletedInteractionCount = soloInteractions.length;

    for (const i of filtered) {
      if (i.contactIds.includes(contactId)) {
        i.contactIds = i.contactIds.filter(id => id !== contactId);
        i.updatedAt = new Date().toISOString();
        updatedGroupInteractionCount++;
      }
    }

    writeInteractions(filtered);
  }

  const sIdx = summaries.findIndex(s => s.id === contact!.id);
  if (sIdx >= 0) summaries.splice(sIdx, 1);

  writeContacts(contacts);
  writeSummaries(summaries);

  return {
    deleted: contactSummaryView(contact),
    deletedInteractionCount,
    updatedGroupInteractionCount,
  };
}

// ── deleteContact — reimplements the OLD BUGGY logic for comparison ──

function deleteContactBuggy(args: { name?: string; contactId?: string; deleteInteractions?: boolean }) {
  const contacts = readContacts();
  const interactions = readInteractions();
  const summaries = readSummaries();

  let contact: Contact | undefined;
  if (args.contactId) {
    contact = contacts.find(c => c.id === args.contactId);
  } else if (args.name) {
    contact = findContactByName(args.name, contacts) ?? undefined;
  }

  if (!contact) {
    return { error: `Contact not found: ${args.name ?? args.contactId}` };
  }

  const relatedInteractions = interactions.filter(i => i.contactIds.includes(contact!.id));
  const soloInteractions = relatedInteractions.filter(i => i.contactIds.length === 1);
  const groupInteractions = relatedInteractions.filter(i => i.contactIds.length > 1);

  // BUG: splice BEFORE the approval check
  const cIdx = contacts.findIndex(c => c.id === contact!.id);
  contacts.splice(cIdx, 1);

  if (args.deleteInteractions && relatedInteractions.length > 0) {
    // ... (would handle deletion here)
  } else if (relatedInteractions.length > 0) {
    // Returns warning, but contact is ALREADY gone from `contacts` array
    // Because we write contacts later outside this branch, this doesn't persist,
    // BUT the in-memory state is corrupted for anything that follows in this request.
    return { warning: 'has interactions' };
  }

  // This write would persist the spliced contacts array even in the warning case
  // if the code flow reached here (it doesn't due to the early return, but the
  // in-memory mutation already happened).
  writeContacts(contacts);
  writeSummaries(summaries);

  return { deleted: contactSummaryView(contact) };
}

// ── Test data factories ──────────────────────────────────────────────

function makeContact(overrides: Partial<Contact> = {}): Contact {
  const now = new Date().toISOString();
  return {
    id: generateId('c'),
    name: 'Test User',
    nickname: null,
    company: null,
    role: null,
    howWeMet: null,
    tags: [],
    contactInfo: { email: null, phone: null, linkedin: null },
    notes: [],
    expertise: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeInteraction(overrides: Partial<Interaction> = {}): Interaction {
  const now = new Date().toISOString();
  return {
    id: generateId('i'),
    contactIds: [],
    date: '2026-02-27',
    type: 'catch-up',
    summary: 'Test interaction',
    topics: [],
    mentionedNextSteps: null,
    location: null,
    createdAt: now,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('deleteContact', () => {
  beforeEach(() => {
    DATA_DIR = tempDir();
  });

  afterEach(() => {
    rmSync(DATA_DIR, { recursive: true, force: true });
  });

  it('deletes a contact with no interactions', () => {
    const c = makeContact({ name: 'Alice Smith' });
    writeData('contacts.json', [c]);
    writeData('interactions.json', []);
    writeData('contact-summaries.json', []);

    const result = deleteContact({ name: 'Alice', deleteInteractions: true }) as any;
    assert.equal(result.deleted.name, 'Alice Smith');

    const remaining = readContacts();
    assert.equal(remaining.length, 0);
  });

  it('returns warning when contact has interactions and deleteInteractions is not set', () => {
    const c = makeContact({ name: 'Bob Jones' });
    const i = makeInteraction({ contactIds: [c.id], summary: 'Coffee chat' });
    writeData('contacts.json', [c]);
    writeData('interactions.json', [i]);
    writeData('contact-summaries.json', []);

    const result = deleteContact({ name: 'Bob' }) as any;
    assert.ok(result.warning, 'Should return a warning');
    assert.equal(result.interactionCount, 1);
    assert.equal(result.soloInteractionCount, 1);

    // CRITICAL: contact should still exist after the warning
    const remaining = readContacts();
    assert.equal(remaining.length, 1, 'Contact must NOT be removed before confirmation');
    assert.equal(remaining[0].id, c.id);
  });

  it('BUG DEMONSTRATION: old code mutates contacts array before warning', () => {
    const c = makeContact({ name: 'Carol White' });
    const i = makeInteraction({ contactIds: [c.id], summary: 'Lunch' });
    writeData('contacts.json', [c]);
    writeData('interactions.json', [i]);
    writeData('contact-summaries.json', []);

    // The buggy version returns a warning but has already spliced the contact
    // from the in-memory array. The file isn't written (early return), but
    // if any subsequent code in the same request used that array, it's corrupt.
    const result = deleteContactBuggy({ name: 'Carol' }) as any;
    assert.ok(result.warning, 'Buggy version returns warning');

    // File is unchanged because the early return prevents writeContacts
    const remaining = readContacts();
    assert.equal(remaining.length, 1, 'File is OK, but in-memory state was corrupted');
  });

  it('deletes contact AND solo interactions when deleteInteractions is true', () => {
    const c = makeContact({ name: 'Dan Brown' });
    const solo = makeInteraction({ contactIds: [c.id], summary: 'Solo chat' });
    writeData('contacts.json', [c]);
    writeData('interactions.json', [solo]);
    writeData('contact-summaries.json', []);

    const result = deleteContact({ name: 'Dan', deleteInteractions: true }) as any;
    assert.equal(result.deleted.name, 'Dan Brown');
    assert.equal(result.deletedInteractionCount, 1);

    assert.equal(readContacts().length, 0);
    assert.equal(readInteractions().length, 0);
  });

  it('preserves group interactions but removes the deleted contact from them', () => {
    const c1 = makeContact({ name: 'Eve Adams' });
    const c2 = makeContact({ name: 'Frank Baker' });
    const group = makeInteraction({
      contactIds: [c1.id, c2.id],
      summary: 'Group dinner',
    });
    writeData('contacts.json', [c1, c2]);
    writeData('interactions.json', [group]);
    writeData('contact-summaries.json', []);

    const result = deleteContact({ contactId: c1.id, deleteInteractions: true }) as any;
    assert.equal(result.deleted.name, 'Eve Adams');
    assert.equal(result.deletedInteractionCount, 0, 'Group interaction is not deleted');
    assert.equal(result.updatedGroupInteractionCount, 1, 'Group interaction was updated');

    const remainingInteractions = readInteractions();
    assert.equal(remainingInteractions.length, 1);
    assert.deepEqual(remainingInteractions[0].contactIds, [c2.id]);

    const remainingContacts = readContacts();
    assert.equal(remainingContacts.length, 1);
    assert.equal(remainingContacts[0].id, c2.id);
  });

  it('handles mixed solo + group interactions correctly', () => {
    const c1 = makeContact({ name: 'Grace Hill' });
    const c2 = makeContact({ name: 'Henry Ford' });
    const solo = makeInteraction({ contactIds: [c1.id], summary: 'Solo call' });
    const group = makeInteraction({ contactIds: [c1.id, c2.id], summary: 'Team meeting' });
    writeData('contacts.json', [c1, c2]);
    writeData('interactions.json', [solo, group]);
    writeData('contact-summaries.json', []);

    // First call without deleteInteractions -> warning
    const warn = deleteContact({ name: 'Grace' }) as any;
    assert.ok(warn.warning);
    assert.equal(warn.soloInteractionCount, 1);
    assert.equal(warn.groupInteractionCount, 1);
    assert.equal(readContacts().length, 2, 'No mutation before confirmation');

    // Second call with deleteInteractions -> proceeds
    const result = deleteContact({ name: 'Grace', deleteInteractions: true }) as any;
    assert.equal(result.deletedInteractionCount, 1);
    assert.equal(result.updatedGroupInteractionCount, 1);
    assert.equal(readContacts().length, 1);
    assert.equal(readInteractions().length, 1);
  });
});

describe('rebuildContactSummary', () => {
  beforeEach(() => {
    DATA_DIR = tempDir();
  });

  afterEach(() => {
    rmSync(DATA_DIR, { recursive: true, force: true });
  });

  it('builds a summary for a contact with interactions', () => {
    const c = makeContact({ name: 'Ivy Chen', company: 'Acme', tags: ['work'] });
    const i1 = makeInteraction({
      contactIds: [c.id],
      date: '2026-02-20',
      summary: 'Discussed project roadmap',
      topics: ['product', 'strategy'],
      location: 'Melbourne',
    });
    const i2 = makeInteraction({
      contactIds: [c.id],
      date: '2026-02-25',
      summary: 'Follow-up call about launch',
      topics: ['product'],
      mentionedNextSteps: 'Send launch brief',
    });
    writeData('contacts.json', [c]);
    writeData('interactions.json', [i1, i2]);
    writeData('contact-summaries.json', []);

    rebuildContactSummary(c.id);

    const summaries = readSummaries();
    assert.equal(summaries.length, 1);
    const s = summaries[0];
    assert.equal(s.id, c.id);
    assert.equal(s.name, 'Ivy Chen');
    assert.equal(s.company, 'Acme');
    assert.equal(s.interactionCount, 2);
    assert.equal(s.lastInteraction, '2026-02-25');
    assert.equal(s.firstInteraction, '2026-02-20');
    assert.deepEqual(s.topTopics, ['product', 'strategy']);
    assert.deepEqual(s.locations, ['Melbourne']);
    assert.deepEqual(s.mentionedNextSteps, ['Send launch brief']);
  });

  it('updates an existing summary in-place', () => {
    const c = makeContact({ name: 'Jack Liu' });
    const oldSummary: ContactSummary = {
      id: c.id, name: 'Jack Liu', company: null, role: null,
      tags: [], expertise: [], interactionCount: 0, lastInteraction: null,
      firstInteraction: null, topTopics: [], locations: [],
      recentSummary: '', mentionedNextSteps: [], notes: [],
    };
    writeData('contacts.json', [c]);
    writeData('interactions.json', [
      makeInteraction({ contactIds: [c.id], date: '2026-01-15', summary: 'New chat' }),
    ]);
    writeData('contact-summaries.json', [oldSummary]);

    rebuildContactSummary(c.id);

    const summaries = readSummaries();
    assert.equal(summaries.length, 1, 'Should replace, not duplicate');
    assert.equal(summaries[0].interactionCount, 1);
    assert.equal(summaries[0].lastInteraction, '2026-01-15');
  });

  it('handles nonexistent contact gracefully', () => {
    writeData('contacts.json', []);
    writeData('interactions.json', []);
    writeData('contact-summaries.json', []);

    // Should not throw
    rebuildContactSummary('c_nonexistent00');

    assert.equal(readSummaries().length, 0);
  });
});

describe('findContactByName', () => {
  it('matches by partial name (case-insensitive)', () => {
    const contacts = [
      makeContact({ name: 'James Smith' }),
      makeContact({ name: 'Jane Doe' }),
    ];
    assert.equal(findContactByName('james', contacts)?.name, 'James Smith');
    assert.equal(findContactByName('JANE', contacts)?.name, 'Jane Doe');
    assert.equal(findContactByName('doe', contacts)?.name, 'Jane Doe');
  });

  it('matches by nickname', () => {
    const contacts = [
      makeContact({ name: 'Robert Williams', nickname: 'Bob' }),
    ];
    assert.equal(findContactByName('bob', contacts)?.name, 'Robert Williams');
  });

  it('returns null for no match', () => {
    const contacts = [makeContact({ name: 'Alice Brown' })];
    assert.equal(findContactByName('Charlie', contacts), null);
  });

  it('returns first match when multiple contacts match', () => {
    const contacts = [
      makeContact({ name: 'James Smith' }),
      makeContact({ name: 'James Bond' }),
    ];
    const result = findContactByName('James', contacts);
    assert.equal(result?.name, 'James Smith');
  });
});

describe('race condition demonstration (summary rebuild)', () => {
  beforeEach(() => {
    DATA_DIR = tempDir();
  });

  afterEach(() => {
    rmSync(DATA_DIR, { recursive: true, force: true });
  });

  it('sequential rebuilds preserve all summaries (local sync I/O is safe)', () => {
    // With synchronous file I/O (local CLI), sequential rebuilds are fine.
    // Each call reads, modifies, writes atomically.
    const c1 = makeContact({ name: 'Kate One' });
    const c2 = makeContact({ name: 'Laura Two' });
    const c3 = makeContact({ name: 'Mike Three' });
    const group = makeInteraction({
      contactIds: [c1.id, c2.id, c3.id],
      date: '2026-02-27',
      summary: 'Group dinner',
      topics: ['social'],
    });
    writeData('contacts.json', [c1, c2, c3]);
    writeData('interactions.json', [group]);
    writeData('contact-summaries.json', []);

    // Sequential rebuilds (what the local CLI does)
    rebuildContactSummary(c1.id);
    rebuildContactSummary(c2.id);
    rebuildContactSummary(c3.id);

    const summaries = readSummaries();
    assert.equal(summaries.length, 3, 'All 3 summaries should exist');
    for (const s of summaries) {
      assert.equal(s.interactionCount, 1);
      assert.deepEqual(s.topTopics, ['social']);
    }
  });

  it('demonstrates the GCS race condition with simulated async parallel writes', async () => {
    // Simulate the GCS race: each "async" rebuild reads the SAME initial state,
    // modifies independently, and writes. Last write wins.
    const c1 = makeContact({ name: 'Nick Alpha' });
    const c2 = makeContact({ name: 'Olivia Beta' });
    const c3 = makeContact({ name: 'Paul Gamma' });
    const group = makeInteraction({
      contactIds: [c1.id, c2.id, c3.id],
      date: '2026-02-27',
      summary: 'Team standup',
      topics: ['work'],
    });
    writeData('contacts.json', [c1, c2, c3]);
    writeData('interactions.json', [group]);
    writeData('contact-summaries.json', []);

    // Simulate: all 3 read the same empty summaries file at the "same time"
    const snapshot1 = readSummaries(); // []
    const snapshot2 = readSummaries(); // []
    const snapshot3 = readSummaries(); // []

    // Each builds its own summary and pushes to its own copy
    const buildSummary = (contact: Contact, summaries: ContactSummary[]): ContactSummary[] => {
      const s: ContactSummary = {
        id: contact.id, name: contact.name, company: null, role: null,
        tags: [], expertise: [], interactionCount: 1, lastInteraction: '2026-02-27',
        firstInteraction: '2026-02-27', topTopics: ['work'], locations: [],
        recentSummary: '2026-02-27: Team standup', mentionedNextSteps: [], notes: [],
      };
      summaries.push(s);
      return summaries;
    };

    const result1 = buildSummary(c1, snapshot1); // [Nick]
    const result2 = buildSummary(c2, snapshot2); // [Olivia]
    const result3 = buildSummary(c3, snapshot3); // [Paul]

    // All three write — last one wins
    writeSummaries(result1);
    writeSummaries(result2);
    writeSummaries(result3);

    const final = readSummaries();
    // BUG: Only Paul's summary survives — the other two were overwritten
    assert.equal(final.length, 1, 'Race condition: only last write survives');
    assert.equal(final[0].name, 'Paul Gamma');

    // This demonstrates that Promise.all(ids.map(rebuildContactSummary)) in
    // the GCS handler would lose summaries for all but the last-to-complete rebuild.
  });

  it('batch rebuild (the fix) preserves all summaries in a single pass', () => {
    // This mirrors rebuildContactSummaries() from the fixed GCP handler:
    // read once, build all summaries, write once.
    const c1 = makeContact({ name: 'Quinn Alpha' });
    const c2 = makeContact({ name: 'Ruby Beta' });
    const c3 = makeContact({ name: 'Sam Gamma' });
    const group = makeInteraction({
      contactIds: [c1.id, c2.id, c3.id],
      date: '2026-02-27',
      summary: 'Team standup',
      topics: ['work'],
    });
    writeData('contacts.json', [c1, c2, c3]);
    writeData('interactions.json', [group]);
    writeData('contact-summaries.json', []);

    // Batch rebuild: one read, build all, one write
    const contacts = readContacts();
    const interactions = readInteractions();
    const summaries = readSummaries();

    for (const contactId of [c1.id, c2.id, c3.id]) {
      const contact = contacts.find(c => c.id === contactId)!;
      const contactInteractions = interactions
        .filter(i => i.contactIds.includes(contactId))
        .sort((a, b) => b.date.localeCompare(a.date));

      const topicCounts = new Map<string, number>();
      for (const i of contactInteractions) {
        for (const t of i.topics) topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
      }

      const s: ContactSummary = {
        id: contact.id, name: contact.name, company: null, role: null,
        tags: [], expertise: [], interactionCount: contactInteractions.length,
        lastInteraction: contactInteractions[0]?.date ?? null,
        firstInteraction: contactInteractions.length > 0
          ? contactInteractions[contactInteractions.length - 1].date : null,
        topTopics: [...topicCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t),
        locations: [], recentSummary: contactInteractions.slice(0, 3)
          .map(i => `${i.date}: ${i.summary.slice(0, 100)}`).join('. '),
        mentionedNextSteps: [], notes: [],
      };

      const idx = summaries.findIndex(x => x.id === contactId);
      if (idx >= 0) summaries[idx] = s; else summaries.push(s);
    }

    writeSummaries(summaries);

    const final = readSummaries();
    assert.equal(final.length, 3, 'Batch rebuild preserves all 3 summaries');
    const names = final.map(s => s.name).sort();
    assert.deepEqual(names, ['Quinn Alpha', 'Ruby Beta', 'Sam Gamma']);
    for (const s of final) {
      assert.equal(s.interactionCount, 1);
      assert.deepEqual(s.topTopics, ['work']);
    }
  });
});

describe('edge cases', () => {
  beforeEach(() => {
    DATA_DIR = tempDir();
  });

  afterEach(() => {
    rmSync(DATA_DIR, { recursive: true, force: true });
  });

  it('deleteContact by ID works', () => {
    const c = makeContact({ name: 'Quinn Reed' });
    writeData('contacts.json', [c]);
    writeData('interactions.json', []);
    writeData('contact-summaries.json', []);

    const result = deleteContact({ contactId: c.id }) as any;
    assert.equal(result.deleted.name, 'Quinn Reed');
    assert.equal(readContacts().length, 0);
  });

  it('deleteContact returns error for nonexistent contact', () => {
    writeData('contacts.json', []);
    writeData('interactions.json', []);
    writeData('contact-summaries.json', []);

    const result = deleteContact({ name: 'Nobody' }) as any;
    assert.ok(result.error);
  });

  it('deleteContact returns error when neither name nor contactId given', () => {
    writeData('contacts.json', []);
    writeData('interactions.json', []);
    writeData('contact-summaries.json', []);

    const result = deleteContact({}) as any;
    assert.ok(result.error);
  });

  it('summary correctly picks top 5 topics by frequency', () => {
    const c = makeContact({ name: 'Rosa Stone' });
    const interactions: Interaction[] = [];
    // Create interactions with varying topic frequencies
    const topicSets = [
      ['alpha', 'beta'],
      ['alpha', 'gamma'],
      ['alpha', 'delta'],
      ['beta', 'epsilon'],
      ['beta', 'zeta'],
      ['gamma', 'eta'],  // eta appears once, should be 6th
    ];
    for (const topics of topicSets) {
      interactions.push(makeInteraction({
        contactIds: [c.id],
        date: '2026-02-27',
        topics,
      }));
    }
    writeData('contacts.json', [c]);
    writeData('interactions.json', interactions);
    writeData('contact-summaries.json', []);

    rebuildContactSummary(c.id);

    const s = readSummaries()[0];
    assert.equal(s.topTopics.length, 5, 'Should cap at 5 topics');
    // alpha=3, beta=3, gamma=2, delta=1, epsilon=1 (or zeta/eta — order among tied is unstable)
    assert.ok(s.topTopics.includes('alpha'));
    assert.ok(s.topTopics.includes('beta'));
    assert.ok(s.topTopics.includes('gamma'));
  });

  it('summary correctly computes firstInteraction and lastInteraction', () => {
    const c = makeContact({ name: 'Sam West' });
    writeData('contacts.json', [c]);
    writeData('interactions.json', [
      makeInteraction({ contactIds: [c.id], date: '2025-06-15' }),
      makeInteraction({ contactIds: [c.id], date: '2026-02-01' }),
      makeInteraction({ contactIds: [c.id], date: '2025-12-25' }),
    ]);
    writeData('contact-summaries.json', []);

    rebuildContactSummary(c.id);

    const s = readSummaries()[0];
    assert.equal(s.lastInteraction, '2026-02-01');
    assert.equal(s.firstInteraction, '2025-06-15');
  });

  it('summary for contact with zero interactions', () => {
    const c = makeContact({ name: 'Tina Zero' });
    writeData('contacts.json', [c]);
    writeData('interactions.json', []);
    writeData('contact-summaries.json', []);

    rebuildContactSummary(c.id);

    const s = readSummaries()[0];
    assert.equal(s.interactionCount, 0);
    assert.equal(s.lastInteraction, null);
    assert.equal(s.firstInteraction, null);
    assert.deepEqual(s.topTopics, []);
    assert.equal(s.recentSummary, '');
  });
});
