# CLAUDE.md

This file provides guidance to Claude when working with this repository.

## Project Overview

A lightweight personal CRM for remembering people and interactions. **No frontend UI — Claude IS the interface.** Data is stored as JSON files in this repo. You read and write them directly — every edit creates a git commit, giving you full version history.

**Primary interface:** Claude.ai (via the Claude Code GitHub app) or Claude Code CLI — both work by reading/writing the JSON data files directly.

## Data Files

| File | Purpose |
|---|---|
| `data/contacts.json` | All contacts (profile info) |
| `data/interactions.json` | All interactions (linked by `contactIds`) |
| `data/tags.json` | Centralized tag/topic/expertise dictionary |
| `data/contact-summaries.json` | Per-contact summary index (auto-generated) |

## How to Act as the CRM Interface

You are the primary way the user interacts with their contact data. When the user mentions a person, asks about someone, or wants to log an interaction, you should:

### Answering Questions About People

1. **Start with `data/contact-summaries.json`** — this compact index always fits in context and gives you an overview of every contact: recent interactions, top topics, expertise, notes, and locations.
2. **Drill into `data/interactions.json`** only when you need full detail for specific contacts identified from the summaries.
3. **Cross-reference** to answer questions like:
   - "Who was that guy from Google?"
   - "What did Campbell and I last talk about?"
   - "Who have I not caught up with in a while?"
   - "Who do I know in Melbourne?"
   - "Who knows about agtech?"
4. **Suggest next steps** when relevant — check `mentionedNextSteps` fields on recent interactions.

### Adding People from Freeform Text

When the user describes someone (e.g., "I met a guy called James at the conference, he works at Stripe as an engineer"):

1. **Always capture first and last name.** If the user only provides a first name, ask for the surname before proceeding. The `name` field must contain at least two words.
2. Read `data/contacts.json`
3. Check for existing matches (see **Deduplication** below)
4. Construct the proposed contact object following the schema below
5. **Present the proposed record to the user for confirmation** — show name, company, role, tags, expertise, and notes so they can catch typos or missing data
6. Wait for confirmation or corrections, then write

```json
{
  "id": "c_<12 random hex chars>",
  "name": "James",
  "nickname": null,
  "company": "Stripe",
  "role": "Engineer",
  "howWeMet": "Met at conference",
  "tags": ["conference", "engineering"],
  "contactInfo": { "email": null, "phone": null, "linkedin": null },
  "notes": [],
  "expertise": [],
  "createdAt": "<ISO 8601 timestamp>",
  "updatedAt": "<ISO 8601 timestamp>"
}
```

7. Append the new contact to the array in `data/contacts.json`
8. Write the updated file back (this creates a commit)

### Logging Interactions

When the user describes a catch-up or meeting:

1. Read `data/contacts.json` to find the contact by name
2. Read `data/interactions.json`
3. Read `data/tags.json` to load the tag dictionary
4. Construct the proposed interaction object, selecting topics from the dictionary
5. **Present the proposed record to the user**, highlighting:
   - Assigned topics (with brief justification if not obvious)
   - Any fields left empty (location, mentionedNextSteps) in case the user wants to add them
6. Wait for user confirmation or adjustments
7. Write to `data/interactions.json`
8. If any new tags were created, also write to `data/tags.json`
9. Update `data/contact-summaries.json` for all affected contacts

### Multi-Contact Interactions

When the user describes a group interaction (dinner, meeting, event with multiple people):

1. Identify all participants from the description
2. Resolve each to an existing contact (ask for clarification if names are ambiguous)
3. Create a **single** interaction with `contactIds: ["c_xxx", "c_yyy", "c_zzz"]`
4. Do NOT create duplicate interactions — one record per event, multiple participants
5. Present the proposed record showing all participants for confirmation
6. After writing, rebuild summaries for ALL participants

### Editing Interactions

Interactions may be amended after creation. When the user asks to edit an interaction:

1. Identify which interaction they mean — by recency ("my last interaction with Campbell"), by date ("the one from February 17th"), or by content ("the catch-up where we talked about vibe coding")
2. If ambiguous, present matching interactions and ask the user to confirm
3. Show the current record and proposed changes
4. Wait for confirmation, then write the update
5. The `updatedAt` field is set automatically on edit

### Tag Management

The tag dictionary (`data/tags.json`) is the single source of truth for all tags, topics, and expertise areas. When working with tags:

- **Always read `data/tags.json` before assigning tags or topics**
- Only use tags that exist in the dictionary (exact `tag` value, not aliases)
- Aliases are for matching/recognition only — the canonical `tag` value is what gets stored
- When content doesn't match any existing tag, proactively suggest creating one — don't silently skip tagging
- Tag and topic management (create, rename, merge, delete, alias) is done through natural language conversation — read and write `data/tags.json` directly
- When renaming or merging tags, always update all affected records in `contacts.json` and `interactions.json`

### Processing Raw Material (Emails, Notes, Texts)

When the user pastes raw text (emails, meeting notes, chat logs):
1. Read existing contacts first to check for matches
2. Extract people, dates, topics, and key details
3. Create new contacts for unknown people
4. Create interaction records for any conversations/meetings described
5. Always confirm with the user before creating records

### Deduplication

Before creating a new contact, **always check** existing contacts for name matches. Use case-insensitive partial matching — "James" should match "James Smith". Also check `nickname` fields. If unsure, ask the user.

## Data Schema

The canonical schema is defined in `src/types.ts`. Here's a summary:

### Contact

| Field | Type | Notes |
|---|---|---|
| `id` | string | `c_` + 12 random hex chars |
| `name` | string | Full name |
| `nickname` | string \| null | Optional |
| `company` | string \| null | Optional |
| `role` | string \| null | Optional |
| `howWeMet` | string \| null | Optional |
| `tags` | string[] | e.g. `["golf", "work"]` |
| `contactInfo` | object | `{ email, phone, linkedin }` — all optional |
| `notes` | string[] | Persistent personal facts (e.g., kids' names, preferences) |
| `expertise` | string[] | Domain knowledge areas (e.g., `["agtech", "M&A"]`) |
| `private` | boolean \| undefined | If `true`, contact is hidden without `privateKey` |
| `createdAt` | string | ISO 8601 timestamp |
| `updatedAt` | string | ISO 8601 timestamp |

### Interaction

| Field | Type | Notes |
|---|---|---|
| `id` | string | `i_` + 12 random hex chars |
| `contactIds` | string[] | Array of participant contact IDs (supports multi-person interactions) |
| `date` | string | `YYYY-MM-DD` format |
| `type` | string | One of: `catch-up`, `meeting`, `call`, `message`, `event`, `other` |
| `summary` | string | What happened |
| `topics` | string[] | e.g. `["career", "travel"]` |
| `mentionedNextSteps` | string \| null | Context for future reference, not task assignments |
| `location` | string \| null | Where the interaction took place |
| `private` | boolean \| undefined | If `true`, interaction is hidden without `privateKey` |
| `createdAt` | string | ISO 8601 timestamp |
| `updatedAt` | string | Set on edit, ISO 8601 timestamp |

## ID Generation

Generate IDs as: prefix + 12 random lowercase hexadecimal characters.
- Contacts: `c_` prefix (e.g., `c_a1b2c3d4e5f6`)
- Interactions: `i_` prefix (e.g., `i_f6e5d4c3b2a1`)

## Key Conventions

- Dates use `YYYY-MM-DD` format for interaction dates, ISO 8601 for `createdAt`/`updatedAt` timestamps
- Tags are stored as arrays of strings in JSON
- IDs are prefixed: `c_` for contacts, `i_` for interactions
- When writing JSON, keep the array format with 2-space indentation
- Always preserve existing data — append to arrays, never overwrite the file with partial data
- Interactions may be amended; always confirm edits with the user before writing

## CLI Scripts (Optional — for local Claude Code use)

If running locally with Claude Code CLI, these TypeScript scripts are available:

```bash
# Add a contact
npx tsx src/addContact.ts --name "Name" [--company "Co"] [--role "Role"] [--how-met "Story"] [--tags tag1,tag2] [--email e] [--phone p] [--linkedin url] [--nickname nick] [--notes "note1,note2"] [--expertise "area1,area2"]

# Log an interaction (single contact)
npx tsx src/addInteraction.ts --contact "Name" --summary "What happened" [--date YYYY-MM-DD] [--type catch-up|meeting|call|message|event|other] [--topics t1,t2] [--mentioned-next-steps "Do X"] [--location "Place"]

# Log an interaction (multiple contacts — group dinner, meeting, etc.)
npx tsx src/addInteraction.ts --contacts "Name1,Name2,Name3" --summary "What happened" [--date YYYY-MM-DD] [--type meeting] [--topics t1,t2] [--location "Place"]

# Edit an interaction
npx tsx src/editInteraction.ts --id "i_xxxx" [--summary "New summary"] [--date YYYY-MM-DD] [--type catch-up] [--topics t1,t2] [--mentioned-next-steps "Do X"] [--location "Place"] [--contacts "Name1,Name2"]

# Search contacts and interactions
npx tsx src/searchContacts.ts "search term"
npx tsx src/searchContacts.ts --tag "golf"
npx tsx src/searchContacts.ts --company "Acme"
npx tsx src/searchContacts.ts --expertise "agtech"

# View a contact with all interactions
npx tsx src/viewContact.ts "Name"

# Manage tags
npx tsx src/manageTags.ts --list [--counts]
npx tsx src/manageTags.ts --add "tag" --type contact|topic|expertise --description "Desc"
npx tsx src/manageTags.ts --remove "tag" --type contact|topic|expertise
npx tsx src/manageTags.ts --alias "tag" --add-alias "alias"
npx tsx src/manageTags.ts --audit

# Rebuild contact summaries from scratch
npx tsx src/rebuildSummaries.ts

# Bulk import from files in import/ directory
npx tsx scripts/bulkImport.ts              # Dry run
npx tsx scripts/bulkImport.ts --confirm    # Write to data files
npx tsx scripts/bulkImport.ts --file x.md  # Single file
```

These scripts require Node.js and are run from the project root. They are **not needed** when using Claude.ai — just read/write the JSON files directly.

## Privacy Mode

Contacts and interactions can be marked as **private** to hide them from normal MCP tool responses. This protects sensitive relationships and conversations from being surfaced in casual Claude.ai usage.

### Rules

1. **Contact-level privacy**: If a contact has `private: true`, they and ALL their interactions are hidden from search/browse
2. **Interaction-level privacy**: If a contact is public but an interaction has `private: true`, that interaction alone is hidden
3. **Group interaction redaction**: If a private contact is in a group interaction, the interaction is still visible to other participants but the private contact is redacted from `participantNames`/`contactIds`
4. **Summary exclusion**: Private contacts have no summary record. Private interactions are excluded from all summary rollups (interactionCount, topTopics, recentSummary, locations, mentionedNextSteps)
5. **Unlock mechanism**: Pass `privateKey` in any tool call to unlock private data for that request

### Setting Up

Use the `manage_privacy` MCP tool to set a passphrase:
- `manage_privacy({ operation: 'set_key', newKey: 'your-passphrase' })` — first-time setup
- `manage_privacy({ operation: 'set_key', currentKey: 'old', newKey: 'new' })` — change passphrase
- `manage_privacy({ operation: 'status' })` — check if a key is set and count private records

The passphrase is stored in `config.json` alongside the data (GCS bucket or local `data/` directory). No env vars or redeployment needed.

### Marking Data as Private

- **Adding**: `add_contact({ ..., private: true })` or `log_interaction({ ..., private: true })`
- **Toggling**: `update_contact({ name: 'X', updates: { private: true } })` or `edit_interaction({ id: 'i_xxx', updates: { private: false } })`
- **CLI**: `--private` flag on `addContact.ts` and `addInteraction.ts`

### Reading Private Data

Pass `privateKey` to any read tool: `search_contacts({ query: 'X', privateKey: 'your-passphrase' })`. Without the key, private data is invisible (returns "not found" rather than "access denied" to avoid leaking existence).

## Getting Started

1. **Clone this repo** (it's private — your data stays private)
2. **Open in Claude.ai** using the Claude Code GitHub app, or use Claude Code CLI locally
3. **Start talking** — "Add a contact: Jane from Acme, met at the trade show" or "Who have I not spoken to recently?"

Claude will read your data files, make changes, and commit them back to the repo. Every change is versioned in git.
