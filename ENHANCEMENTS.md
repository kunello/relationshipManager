# Enhancements

Planned improvements and architectural considerations for the Relationship Manager.

---

## ENH-001: Interaction Editing (Amend / Update / Delete)

**Status:** Implemented
**Priority:** Medium
**Date raised:** 2026-02-19

### Problem

The current architecture is append-only by policy (CLAUDE.md: "append to arrays, never overwrite the file with partial data"). There is no mechanism for editing an existing interaction — to correct details, add context, update a follow-up status, or remove sensitive content. Users must create a new interaction entry rather than amending an existing one, which leads to duplicate or fragmented records.

### Scope

1. **Schema change** — Add `updatedAt` (ISO 8601 timestamp) to the `Interaction` interface in `src/types.ts`. Contacts already have this field; interactions do not.
2. **CLI script** — Create `src/editInteraction.ts` supporting operations:
   - Amend summary (append or replace text)
   - Update follow-up (change, mark done, clear)
   - Correct fields (date, type, topics)
   - Remove content from summary
3. **CLAUDE.md policy update** — Revise the "append-only" instruction to distinguish between:
   - Data safety: "never overwrite the file with partial data" (keep this)
   - Mutation policy: "interactions may be amended; always confirm edits with the user before writing" (new)
4. **Disambiguation UX** — Define how Claude identifies which interaction to edit:
   - By recency: "my last interaction with Campbell"
   - By date: "the one from February 17th"
   - By content: "the catch-up where we talked about vibe coding"
   - If ambiguous, Claude should present matching interactions and ask the user to confirm

### Notes

- Git history already provides a full audit trail of every edit, so no additional change-tracking infrastructure is needed.
- The underlying read-modify-write mechanism already exists in `utils.ts` (`writeInteractions` overwrites the full file). This enhancement is primarily about policy, schema, and interface — not plumbing.

---

## ENH-002: Yearly Interaction File Partitioning

**Status:** Proposed
**Priority:** Low (revisit when interactions exceed ~10,000)
**Date raised:** 2026-02-19

### Problem

All interactions are stored in a single `data/interactions.json` file. At high volumes (~10,000 interactions/year), this file grows to ~1.2 MB/year. The primary concern is not Node.js performance (parsing remains fast) but Claude's context window — reading the raw file consumes significant token budget, limiting conversational capacity.

### Proposed Structure

```
data/
  contacts.json                 # Unchanged (~80 KB at 200 contacts)
  interactions/
    2026.json                   # Current year's interactions
    2027.json                   # Next year's
    ...
```

### Scope

1. Migrate `data/interactions.json` into `data/interactions/YYYY.json` files
2. Update `utils.ts` read/write helpers to glob `data/interactions/*.json`
3. Update CLI scripts to handle multi-file reads
4. Update CLAUDE.md with new file paths and conventions
5. Consider a migration script for existing data

### Notes

- Most CRM queries are recency-biased, so the current year's file covers the majority of use cases.
- Cross-year queries (e.g., "all interactions with Campbell") require reading multiple files but remain fast via Node.js.
- This is not urgent at current scale (1 contact, 1 interaction). Revisit when interaction volume becomes noticeable.

---

## ENH-003: Scalability Analysis Summary

**Status:** Documented (no action required)
**Date raised:** 2026-02-19

### Findings

Analysis of the two-file JSON architecture for a use case of ~200 contacts and ~10,000 interactions/year:

| Concern | Threshold | Risk |
|---|---|---|
| `JSON.parse` performance | 100K+ interactions (~12 MB) | None — parses in ~50ms |
| Linear scan (`.filter()`) | 100K+ interactions | None — completes in ~10ms |
| `contacts.json` file size | 200 contacts = ~80 KB | None — indefinitely manageable |
| `interactions.json` file size | ~1.2 MB/year | Low — see ENH-002 for mitigation |
| Claude context window (raw read) | ~5,000-10,000 interactions | Medium — CLI scripts mitigate this |
| Git diff performance | Years of history | Low — diffs are small per commit |
| Write contention | Concurrent access | None — single-user system |

**Conclusion:** The current two-file architecture is well-suited for this use case for at least 1-2 years. The yearly partitioning enhancement (ENH-002) would extend viability indefinitely. No immediate action required.

---

## ENH-004: Centralized Tag & Topic Dictionary with Auto-Tagging

**Status:** Implemented
**Priority:** High
**Date raised:** 2026-02-19

### Problem

The system has two separate freeform tagging mechanisms — `tags` on contacts and `topics` on interactions — both stored as unvalidated `string[]`. There is no centralized dictionary, no consistency enforcement, and no guidance for Claude when assigning tags. This leads to:

- **Inconsistency:** `"vibe-coding"`, `"vibe coding"`, `"vibecoding"` could all exist for the same concept
- **Ambiguity:** No defined meaning for tags — is `"engineering"` about their profession, or a conversation topic?
- **Poor searchability:** Querying "all coding-related interactions" requires guessing every variant of how coding was tagged
- **No discoverability:** No way to see what tags exist or what they mean

### Current State

| Field | Lives on | Current usage | Purpose |
|---|---|---|---|
| `tags` | `Contact` | Freeform strings | Categorize *who someone is* (interests, groups, affiliations) |
| `topics` | `Interaction` | Freeform strings | Categorize *what was discussed* (conversation subjects) |

Both are defined in `src/types.ts` as `string[]` with no validation at any layer.

### Proposed Solution

#### 1. Tag Dictionary File

Create `data/tags.json` as the single source of truth:

```json
{
  "version": 1,
  "contactTags": [
    {
      "tag": "engineering",
      "description": "Works in software engineering or related technical roles",
      "aliases": ["engineer", "developer", "dev", "software"]
    },
    {
      "tag": "golf",
      "description": "Plays golf or met through golf",
      "aliases": ["golfer"]
    }
  ],
  "interactionTopics": [
    {
      "tag": "coding",
      "description": "Discussed programming, software development, or technical projects",
      "aliases": ["vibe-coding", "programming", "development", "software"]
    },
    {
      "tag": "career",
      "description": "Discussed career moves, job changes, or professional development",
      "aliases": ["job", "work", "role-change", "promotion"]
    }
  ]
}
```

#### 2. Natural Language Tag Management (Primary Interface)

Since Claude is the interface, **all tag and topic management should be possible through conversation**. Users should never need to edit `data/tags.json` by hand or run a CLI script to manage their taxonomy.

**Creating tags and topics:**

- *"Add a new tag called 'investor' for contacts who are potential investors"*
- *"I need a topic for 'AI' — conversations about artificial intelligence and machine learning"*
- *"Create a tag for people I met at re:Invent"*

Claude should: read `data/tags.json`, check for duplicates/overlaps, construct the new entry with a description, suggest sensible aliases, confirm with the user, then write back.

**Adding aliases:**

- *"Add 'ML' and 'machine learning' as aliases for the AI topic"*
- *"'Dev' should also match 'engineering'"*

**Renaming and merging:**

- *"Rename the 'dev' tag to 'engineering'"*
- *"Merge 'programming' and 'coding' into a single topic"*

Claude should: update the dictionary, then find and update all contacts/interactions that used the old tag value.

**Browsing and auditing:**

- *"What tags do I have?"*
- *"Which topics have I never used?"*
- *"Show me all tags with their usage counts"*

**Removing tags:**

- *"Remove the 'misc' tag — it's not useful"*

Claude should: warn if the tag is in use, ask whether to remove it from affected records or reassign, then update both the dictionary and the data files.

#### 3. Auto-Tagging Behaviour (Claude)

When Claude creates an interaction, it should:

1. Read `data/tags.json` to load the known dictionary
2. Analyze the interaction summary text
3. Match against tag descriptions and aliases
4. Assign matching tags from the dictionary
5. If the content suggests a new category not in the dictionary, propose a new tag to the user:
   - *"This conversation seems to touch on a new area — 'real estate'. Would you like me to add that as a topic?"*
   - If the user agrees, Claude creates the dictionary entry and applies the tag in one step
   - If the user declines, Claude proceeds without the tag

Similarly, when adding a new contact:

1. Read `data/tags.json`
2. Infer likely contact tags from the context (company, role, how you met)
3. Assign matching known tags
4. Propose new tags if the contact doesn't fit existing categories

#### 4. CLAUDE.md Policy Addition

Add instructions for Claude:

- Always read `data/tags.json` before assigning tags or topics
- Only use tags that exist in the dictionary (exact `tag` value, not aliases)
- Aliases are for matching/recognition only — the canonical `tag` value is what gets stored
- When content doesn't match any existing tag, proactively suggest creating one — don't silently skip tagging
- Tag and topic management (create, rename, merge, delete, alias) is done through natural language conversation — Claude reads and writes `data/tags.json` directly
- When renaming or merging tags, always update all affected records in `contacts.json` and `interactions.json` in the same commit
- Periodically suggest tag consolidation if similar tags are detected

#### 5. CLI Scripts (Secondary Interface)

For users who prefer the command line, also create `src/manageTags.ts`:

```bash
# List all defined tags
npx tsx src/manageTags.ts --list

# List with usage counts
npx tsx src/manageTags.ts --list --counts

# Add a new tag
npx tsx src/manageTags.ts --add "networking" --type contact --description "Met through networking events"

# Add an alias to existing tag
npx tsx src/manageTags.ts --alias "coding" --add "hacking"

# Find unused or rarely used tags
npx tsx src/manageTags.ts --audit
```

These are a secondary interface — the primary way to manage tags is through conversation with Claude.

#### 6. Validation in CLI Scripts

Update `addContact.ts` and `addInteraction.ts` to:

- Load `data/tags.json` and validate provided tags against the dictionary
- Warn (not error) if an unknown tag is used
- Suggest the closest matching known tag

### Search Improvement

With a centralized dictionary, search becomes significantly more effective:

- **Before:** `searchContacts.ts --tag "coding"` only matches the exact string `"coding"` in tag arrays
- **After:** Searching for `"coding"` also matches interactions tagged with any alias (`"vibe-coding"`, `"programming"`, etc.) by resolving through the dictionary

This enables the key use case: *"Tell me all interactions where I had a coding conversation"* resolves `coding` → looks up aliases → searches both `tags` and `topics` arrays for any match.

### Notes

- The `contactTags` vs `interactionTopics` split reflects the existing schema distinction. They could share a single flat list, but separating them provides clearer semantics (who someone *is* vs what you *discussed*).
- The `aliases` field is the key enabler for auto-tagging — Claude can match freeform text against aliases without requiring the user to remember exact tag names.
- **Natural language is the primary management interface.** The CLI script (`manageTags.ts`) exists for power-user convenience but is not required. All operations — create, rename, merge, delete, alias — should be achievable by simply telling Claude what you want.
- Migration: Existing tags/topics in `contacts.json` and `interactions.json` should be reconciled against the new dictionary. A one-time migration script can normalize existing values.
- This enhancement pairs well with ENH-001 (interaction editing) — once you can edit interactions, you can retroactively fix mis-tagged records.

---

## ENH-005: Schema Additions — Location, Personal Notes, and Expertise

**Status:** Implemented
**Priority:** High
**Date raised:** 2026-02-19

### Problem

Real-world CRM queries frequently reference information that has no structured field in the current schema. Users ask questions like:

- *"Who did I meet in Singapore last time?"* — no `location` field on interactions
- *"What are Kane's kids' names?"* — no persistent personal notes on contacts
- *"This person knows about agtech — can they help with our investment?"* — no expertise/interests field on contacts

Currently this information only exists buried in interaction `summary` text, which requires Claude to scan every summary to find answers — unreliable at scale and impossible to filter efficiently.

### Proposed Schema Changes

#### 1. `location` on Interaction

Where the meeting/interaction took place. Enables geographic queries.

```typescript
export interface Interaction {
  // ... existing fields ...
  location?: string | null;    // NEW — e.g., "Singapore", "Sydney office", "Zoom"
}
```

Example queries this enables:
- *"Who did I meet in Singapore?"* → filter interactions by `location`
- *"When was I last in Melbourne for meetings?"* → filter by location + sort by date
- *"Show me all my in-person meetings vs virtual ones"* → location analysis

#### 2. `notes` on Contact

Persistent personal facts about a person — things you'd want to recall before a meeting. These are not tied to a single interaction but accumulate over time.

```typescript
export interface Contact {
  // ... existing fields ...
  notes: string[];             // NEW — e.g., ["Kids: Lily (8) and Max (5)", "Vegetarian"]
}
```

**How notes accumulate through conversation:**

- *"Kane mentioned his daughter Lily is starting ballet"* → Claude adds to Kane's notes: `"Daughter Lily starting ballet (mentioned Feb 2026)"`
- *"I'm about to meet Kane, brief me"* → Claude includes notes alongside recent interactions
- *"Actually, remove the note about his dietary preference, that's changed"* → Claude updates the notes array

Notes should be proactively extracted: when Claude processes an interaction summary that contains personal facts (kids, hobbies, preferences, life events), it should suggest adding them to the contact's notes.

#### 3. `expertise` on Contact

What someone knows about, is invested in, or specialises in. Enables "who can help me with X?" queries.

```typescript
export interface Contact {
  // ... existing fields ...
  expertise: string[];         // NEW — e.g., ["renewable energy", "agtech", "M&A"]
}
```

**Distinct from `tags`:** Tags categorise *who someone is* in relation to you (e.g., `"golf-buddy"`, `"conference-contact"`). Expertise captures *what they know about* or *are invested in* (e.g., `"agricultural tech"`, `"southeast asia markets"`, `"SaaS valuations"`).

Example queries this enables:
- *"Who do I know that understands agricultural investing?"* → filter contacts by `expertise`
- *"We're looking at renewable energy deals — who in my network could help?"* → expertise match
- *"What areas of expertise does my network cover?"* → aggregate across all contacts

**How expertise is captured:**

- Explicitly: *"Mark James as an expert in fintech and blockchain"*
- Inferred: When logging an interaction, Claude can suggest: *"James talked in depth about blockchain regulation — should I add 'blockchain' and 'crypto regulation' to his expertise?"*
- From context: When adding a contact with a role like "Head of Agtech Investments at UBS", Claude should suggest relevant expertise tags

### Interaction with ENH-004 (Tag Dictionary)

The `expertise` field should be governed by the same tag dictionary (`data/tags.json`) introduced in ENH-004. Add a third category:

```json
{
  "version": 1,
  "contactTags": [ ... ],
  "interactionTopics": [ ... ],
  "expertiseAreas": [
    {
      "tag": "agtech",
      "description": "Agricultural technology and farming innovation",
      "aliases": ["agricultural tech", "agriculture", "farming tech", "agri-tech"]
    },
    {
      "tag": "renewable-energy",
      "description": "Clean energy, solar, wind, and sustainable power",
      "aliases": ["clean energy", "solar", "wind energy", "green energy", "renewables"]
    }
  ]
}
```

This ensures expertise values are consistent and searchable through the same alias resolution as tags and topics.

### CLAUDE.md Policy Additions

- When creating interactions, Claude should ask about or infer `location` if not mentioned
- When interactions mention personal facts (family, hobbies, preferences), Claude should suggest adding them to the contact's `notes`
- When interactions reveal someone's domain knowledge or investment focus, Claude should suggest adding to `expertise`
- Before meetings, when the user asks to be "briefed" on someone, Claude should present: recent interactions, notes, expertise, and any open follow-ups

### Notes

- `location` on interactions could later feed into ENH-002 (partitioning) — partitioning by geography becomes possible in addition to time
- `notes` is intentionally an array of short strings rather than a single text blob — this supports incremental additions and selective removal via natural language
- `expertise` values should resolve through the ENH-004 tag dictionary to maintain consistency with the rest of the taxonomy
- All three fields are nullable/optional and backward-compatible — existing data doesn't break

---

## ENH-006: Search Architecture — From Substring to Semantic

**Status:** Layer 0 Implemented (contact-summaries.json)
**Priority:** Critical
**Date raised:** 2026-02-19

### Problem

There are two compounding problems:

**Problem 1: CLI search is substring-only.** All search in `searchContacts.ts:42-76` uses `string.includes()`. Searching `"agriculture"` will NOT match `"agtech"`, `"farming"`, or `"agricultural investments"`. Typos return nothing.

**Problem 2: Claude can't read the full database.** At 10,000 interactions/year (~100 tokens each), the interactions file reaches ~1M tokens within Year 1 — **5x Claude's 200K context window**. Claude's semantic reasoning is excellent, but it can only reason over data it can *see*. Within months of active use, Claude will be unable to read `interactions.json` in full, falling back to the CLI scripts which only do substring matching.

**The result:** The system degrades from semantic search (Claude reads everything and understands meaning) to keyword search (CLI substring matching) as data grows — exactly when you need search to be *more* capable, not less.

### Revised Token Budget Analysis

At ~100 tokens per interaction record (JSON structure + 2-3 sentence summary):

| Timeframe | Interactions | Token cost | Fits in 200K context? |
|---|---|---|---|
| **Month 1** | ~830 | ~83K | ✅ Yes, with room for conversation |
| **Month 2** | ~1,660 | ~166K | ⚠️ Barely — leaves ~34K for conversation |
| **Month 3** | ~2,500 | ~250K | ❌ No |
| **Year 1** | ~10,000 | ~1M | ❌ 5x over budget |

**Claude's ability to read interactions raw breaks within the first 2-3 months at your projected volume.**

### Solution: Four-Layer Search Architecture

#### Layer 0: Contact Summary Index (Critical — implement first)

A condensed **per-contact summary file** that Claude can always read in full. This is the architectural centrepiece — it decouples search from interaction volume.

**File:** `data/contact-summaries.json`

```json
[
  {
    "id": "c_7a3b8e1f4d2c",
    "name": "Campbell Cooke",
    "company": null,
    "role": null,
    "tags": [],
    "expertise": ["engineering"],
    "interactionCount": 15,
    "lastInteraction": "2026-02-17",
    "firstInteraction": "2025-06-10",
    "topTopics": ["vibe-coding", "career", "startups"],
    "locations": ["Sydney", "Singapore"],
    "recentSummary": "Feb 2026: Vibe coding session at his house. Jan 2026: Discussed his move to a new startup. Dec 2025: Caught up at Christmas drinks, talked about Singapore trip.",
    "openFollowUps": ["Send intro to Sarah"],
    "notes": ["Kids: Lily (8) and Max (5)", "Supports Liverpool FC"]
  }
]
```

**Token economics:**

| Contacts | ~Tokens per entry | Total | Fits in context? |
|---|---|---|---|
| 50 | ~150 | ~7.5K | ✅ Easily |
| 200 | ~150 | ~30K | ✅ Comfortably |
| 500 | ~150 | ~75K | ✅ Yes |
| 1,000 | ~150 | ~150K | ⚠️ Tight but workable |

At 200 contacts, the summary index is **~30K tokens** — Claude can read the entire file and still have ~170K tokens for conversation. This scales with contacts (bounded at ~200), not interactions (growing unbounded).

**How search works with the index:**

1. Claude reads `data/contact-summaries.json` (~30K tokens) — always fits
2. Claude reasons semantically: *"Who knows about farming?"* → identifies contacts where `expertise`, `topTopics`, `recentSummary`, or `company` relate to agriculture
3. For the top 2-5 matching contacts, Claude reads their specific interactions (filtered by contact ID) for detail
4. Claude presents the full answer with context

**How the index stays current:**

- Every time an interaction is added, the affected contact's summary entry is regenerated
- A CLI script (`src/rebuildSummaries.ts`) can regenerate the full index from `contacts.json` + `interactions.json`
- The `recentSummary` field captures the last 3-5 interactions as compressed natural language — not full summaries, just enough for Claude to decide whether to drill deeper

#### Layer 1: Dictionary-Powered Alias Expansion

Leverage the ENH-004 tag dictionary to expand search terms through aliases. This is deterministic and improves both CLI scripts and Claude's search.

**How it works:**

1. User searches for `"farming"`
2. Search reads `data/tags.json`, finds `"farming"` is an alias for `"agtech"`
3. Expands search to: `["farming", "agtech", "agricultural tech", "agriculture", "agri-tech"]`
4. Matches against structured fields (tags, expertise, topics) across the summary index

**Implementation:** Update `searchContacts.ts` to:

```typescript
function expandSearchTerm(query: string, tagDictionary: TagDictionary): string[] {
  const terms = [query];
  for (const category of [tagDictionary.contactTags, tagDictionary.interactionTopics, tagDictionary.expertiseAreas]) {
    for (const entry of category) {
      const allTerms = [entry.tag, ...entry.aliases];
      if (allTerms.some(t => t.toLowerCase().includes(query.toLowerCase()))) {
        terms.push(...allTerms);
      }
    }
  }
  return [...new Set(terms)];
}
```

#### Layer 2: Claude Semantic Reasoning (over summary index)

Claude's native language understanding applied to the contact summary index. This is the primary search interface and requires no additional infrastructure — just well-structured data small enough to fit in context.

When you ask *"Who knows about farming?"*, Claude reads `contact-summaries.json` and understands:
- A contact with `expertise: ["agtech"]` is relevant
- A `recentSummary` mentioning "discussed his family's vineyard operations" is relevant
- A contact at a company called "GreenFields Capital" might be relevant
- A contact tagged `"agriculture"` in `topTopics` is relevant

This is inherently semantic — Claude understands meaning, synonyms, and context.

#### Layer 3: Embedding-Based Retrieval (Future)

For true vector search at scale — only needed if the summary index approach proves insufficient:

1. Generate embeddings for each interaction summary
2. Store in a lightweight vector store (could be a JSON file with pre-computed embeddings, or SQLite with a vector extension)
3. At query time, embed the search query and find nearest neighbours
4. Present top-N results to Claude for final reasoning

**Not recommended for current projected scale.** The summary index (Layer 0) + alias expansion (Layer 1) + Claude reasoning (Layer 2) covers the need for 200 contacts even at 10K+ interactions/year.

### Search Flow Diagram

```
User asks: "Who did I meet in Singapore that knows about agriculture?"
                    │
                    ▼
    ┌─────────────────────────────────┐
    │  Claude reads contact-summaries │  (~30K tokens, always fits)
    │  - Filters: locations contains  │
    │    "Singapore"                  │
    │  - Filters: expertise/topics    │
    │    relate to agriculture        │
    │  → Identifies 3 contacts        │
    └──────────────┬──────────────────┘
                   │
                   ▼
    ┌─────────────────────────────────┐
    │  Claude reads specific          │
    │  interactions for 3 contacts    │  (~300 tokens × ~50 interactions = ~15K)
    │  - Filtered by contactId        │
    │  - Optionally filtered by date  │
    └──────────────┬──────────────────┘
                   │
                   ▼
    ┌─────────────────────────────────┐
    │  Claude presents answer with    │
    │  full context and detail        │
    └─────────────────────────────────┘
```

Total tokens consumed: ~45K out of 200K — leaving plenty of room for conversation.

### Recommended Implementation Order

| Step | What | Why first |
|---|---|---|
| **1** | Build `contact-summaries.json` + rebuild script (Layer 0) | Solves the context window ceiling — everything else depends on this |
| **2** | Update CLAUDE.md to instruct Claude to read summaries first, then drill into details | Changes Claude's search behaviour |
| **3** | Implement ENH-004 tag dictionary | Enables Layer 1 alias expansion |
| **4** | Update `searchContacts.ts` with alias expansion (Layer 1) | Improves CLI search path |
| **5** | Layer 3 (embeddings) — only if Layers 0-2 prove insufficient | Unlikely to be needed |

### Notes

- **Layer 0 is the critical insight:** by summarising at the contact level, the index size scales with contacts (bounded) not interactions (unbounded). This is why you don't need vector search — the problem isn't finding needles in a million haystacks, it's reading 200 well-organised dossiers.
- Layer 1 depends on ENH-004 (tag dictionary) being implemented first
- Layer 2 is already how the system works today — the improvement is ensuring Claude always has a readable summary to reason over, even as raw interaction data exceeds context limits
- The summary index should be regenerated (not manually maintained) to avoid drift from the source data
- Fuzzy matching for typo tolerance (e.g., Levenshtein distance) could be added to Layer 1 as a lightweight enhancement without needing embeddings

---

## ENH-007: Tag Confirmation Step on Interaction Creation

**Status:** Implemented
**Priority:** High
**Date raised:** 2026-02-19

### Problem

When Claude creates an interaction, it currently assigns `topics` (and in future, tags/expertise) silently — the user sees the final result but has no opportunity to review, adjust, or add to the tags before the record is written. This means:

- Claude may assign tags that don't quite fit, and the user doesn't notice
- Claude may miss relevant tags that the user would have added
- The user has no visibility into *why* certain tags were chosen
- Tag quality degrades silently over time, undermining search (ENH-006)

The current CLAUDE.md flow for logging interactions (lines 53-74) is:

1. Read contacts, find the match
2. Read interactions
3. Construct the interaction object (including topics)
4. **Write immediately** ← no confirmation step

### Proposed Change

Insert a **confirmation step** between construction and writing. Claude should present the proposed interaction — specifically highlighting the tags/topics — and ask the user to confirm or adjust before committing.

### Revised Interaction Creation Flow

When the user describes an interaction (e.g., *"Had coffee with James, talked about his agtech startup and the Singapore market"*):

**Step 1:** Claude reads `data/contacts.json`, identifies James.

**Step 2:** Claude reads `data/tags.json` (ENH-004), analyses the user's description, and selects matching tags.

**Step 3:** Claude presents the proposed record for confirmation:

> **Logging interaction with James Morton:**
>
> - **Date:** 2026-02-19
> - **Type:** catch-up
> - **Summary:** Had coffee, discussed his agtech startup and the Singapore market.
> - **Topics:** `agtech`, `singapore-market`
> - **Location:** *(not specified — want to add one?)*
> - **Follow-up:** *(none — anything to add?)*
>
> **Does this look right? Want to add, change, or remove any topics?**

**Step 4:** The user responds:

- ✅ *"Looks good"* → Claude writes the record
- ✏️ *"Also add 'investment' and 'startups'"* → Claude adds those topics, then writes
- ❌ *"Remove 'singapore-market', that wasn't really a topic"* → Claude removes, then writes
- 🆕 *"Add a new topic 'venture-capital' — we don't have that yet"* → Claude creates the tag in `data/tags.json` (per ENH-004), then applies it and writes

**Step 5:** Claude writes the interaction and confirms:

> ✅ Logged catch-up with James Morton on 2026-02-19
> Topics: `agtech`, `investment`, `startups`

### Key Principles

1. **Tags are optional, not mandatory.** If the user says "just log it, no tags needed", Claude writes without topics. The confirmation step should not feel like a gate.
2. **Claude should propose, not demand.** The default is that Claude suggests tags based on its analysis. The user can accept, modify, or skip.
3. **Quick confirmations should be quick.** If the user says "yes" or "looks good", Claude writes immediately — no further prompting.
4. **New tag creation flows naturally.** If the user suggests a topic that doesn't exist in the dictionary, Claude offers to create it as part of the same flow (per ENH-004 natural language management).
5. **Bulk imports can batch the confirmation.** When processing raw material (emails, notes — CLAUDE.md lines 76-83), Claude should present all proposed records with their tags at once, rather than confirming each individually.

### CLAUDE.md Changes Required

Update the "Logging Interactions" section to:

```markdown
### Logging Interactions

When the user describes a catch-up or meeting:

1. Read `data/contacts.json` to find the contact by name
2. Read `data/interactions.json`
3. Read `data/tags.json` to load the tag dictionary
4. Construct the proposed interaction object, selecting topics from the dictionary
5. **Present the proposed record to the user**, highlighting:
   - Assigned topics (with brief justification if not obvious)
   - Any fields left empty (location, follow-up) in case the user wants to add them
6. Wait for user confirmation or adjustments
7. Write to `data/interactions.json`
8. If any new tags were created, also write to `data/tags.json`
9. Update `data/contact-summaries.json` for the affected contact (ENH-006)
```

### Interaction with Other Enhancements

- **ENH-004 (Tag Dictionary):** The confirmation step is where the user sees which dictionary tags were matched. If they suggest a tag that doesn't exist, this flows into ENH-004's natural language tag creation.
- **ENH-005 (Schema Additions):** The confirmation step is also the natural place to capture `location`, `expertise` updates, and `notes` — *"Want to add a location? Anything to note about James?"*
- **ENH-006 (Search):** Tag quality at the point of entry directly determines search quality downstream. This enhancement is a quality gate that protects the entire search pipeline.

### Notes

- This confirmation step adds one conversational round-trip per interaction logged. For a CRM where interactions are logged a few times a day (not hundreds), this is a worthwhile trade-off for data quality.
- The CLI script (`addInteraction.ts`) could add a `--confirm` flag that validates tags against the dictionary and prompts, but this is secondary to the Claude conversational flow.
- For power users who find confirmation tedious, a future enhancement could add a "trust mode" where Claude writes without confirmation for interactions that only use well-established tags. But start with always-confirm to build up tag discipline first.

---

## ENH-008: Contact Creation Data Quality — Name Validation and Confirmation

**Status:** Implemented
**Priority:** High
**Date raised:** 2026-02-19

### Problem

Contact names are the primary lookup key for the entire CRM. Misspelled names, missing surnames, or inconsistent formatting degrade every downstream operation — search, deduplication, and interaction linking all depend on accurate names. The current schema accepts any string as `name`, with no validation or confirmation step.

Common issues:
- Single-word names with no surname (e.g., "James" instead of "James Morton")
- Typos in names that go unnoticed until a later search fails
- Inconsistent capitalisation or formatting
- Missing or inaccurate company/role data entered in a rush

### Solution

1. **First and last name required:** The `add_contact` MCP tool description instructs Claude to always capture both first and last name. The tool validates that `name` contains at least two words.
2. **Confirmation step:** Like ENH-007 for interactions, Claude must present the proposed contact record to the user for review before writing — showing name, company, role, tags, expertise, and notes so the user can catch typos or missing data.
3. **CLAUDE.md policy:** Updated to require full name and confirmation before creating any contact.

### Notes

- The two-word minimum is enforced in the MCP tool handler (`add_contact`) and returns a clear error if violated.
- The CLI script (`addContact.ts`) applies the same validation locally.
- Single-name contacts (e.g., "Madonna") can still be created by passing a descriptive identifier as the second word if needed — but this is intentionally friction to prevent lazy single-name entries.

---

## ENH-009: Multi-Contact Interactions

**Status:** Implemented
**Priority:** High
**Date raised:** 2026-02-19

### Problem

Every interaction had a single `contactId: string`. When the user had a dinner or meeting with multiple people, the system created duplicate interactions — one per person — with identical content. This wasted storage, made data inaccurate, and inflated interaction counts on contact summaries.

### Solution

Migrated from `contactId: string` to `contactIds: string[]` so a single interaction can reference multiple participants.

### Changes

1. **Schema:** `Interaction.contactId` → `Interaction.contactIds: string[]` across all codebases (local, GCP)
2. **Migration script:** `scripts/migrateToMultiContact.ts` transforms existing data (`contactId` → `contactIds: [contactId]`)
3. **MCP tool schema:** `log_interaction` now accepts `contactNames: string[]` and `contactIds: string[]` for group interactions, with singular `contactName`/`contactId` as backward-compatible shortcuts
4. **Handler logic:**
   - `logInteraction()` resolves multiple contacts with precedence: `contactIds` > `contactNames` > `contactId` > `contactName`
   - Duplicate detection uses ≥50% participant overlap AND summary similarity
   - Summary rebuilds run in parallel for all participants via `Promise.all()`
   - `deleteContact()` distinguishes solo vs group interactions — solo are deleted, group have the contact removed but are preserved
   - `editInteraction()` tracks old+new contactIds and rebuilds summaries for the union
   - All query filters use `.contactIds.includes()` instead of `=== contactId`
5. **Response enrichment:** All tools returning interactions now include `participantNames: string[]` and `participantCount: number`
6. **CLI scripts:** `--contacts "Name1,Name2,Name3"` flag on `addInteraction.ts` and `editInteraction.ts`; `viewContact.ts` shows `[GROUP: N people]` indicator and "With: ..." for other participants
7. **Documentation:** Updated schema tables, CLI usage, and added multi-contact interaction guidance in CLAUDE.md and PROJECT_INSTRUCTIONS.md

### Notes

- The migration is backward-compatible: singular `contactName`/`contactId` params still work by wrapping as a single-element array
- Cloud data (GCS) must be migrated before deploying new code, since the new code expects `contactIds` arrays
- The `forceCreate` escape hatch still works for legitimate duplicate interactions with overlapping participants
