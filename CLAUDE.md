# CLAUDE.md

This file provides guidance to Claude when working with this repository.

## Project Overview

A lightweight personal CRM for remembering people and interactions. **No frontend UI — Claude IS the interface.** Data is stored as JSON files in this repo. You read and write them directly — every edit creates a git commit, giving you full version history.

**Primary interface:** Claude.ai (via the Claude Code GitHub app) or Claude Code CLI — both work by reading/writing the JSON data files directly.

## How to Act as the CRM Interface

You are the primary way the user interacts with their contact data. When the user mentions a person, asks about someone, or wants to log an interaction, you should:

### Answering Questions About People

1. **Read both data files** to answer questions:
   - `data/contacts.json` — all contacts (profile info)
   - `data/interactions.json` — all interactions (linked by `contactId`)
2. **Cross-reference** interactions with contacts to answer questions like:
   - "Who was that guy from Google?"
   - "What did Campbell and I last talk about?"
   - "Who have I not caught up with in a while?"
   - "Who do I know in Melbourne?"
3. **Suggest follow-ups** when relevant — check `followUp` fields on recent interactions.

### Adding People from Freeform Text

When the user describes someone (e.g., "I met a guy called James at the conference, he works at Stripe as an engineer"):

1. Read `data/contacts.json`
2. Check for existing matches (see **Deduplication** below)
3. Construct a new contact object following the schema:

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
  "createdAt": "<ISO 8601 timestamp>",
  "updatedAt": "<ISO 8601 timestamp>"
}
```

4. Append the new contact to the array in `data/contacts.json`
5. Write the updated file back (this creates a commit)

### Logging Interactions

When the user describes a catch-up or meeting:

1. Read `data/contacts.json` to find the contact by name
2. Read `data/interactions.json`
3. Construct a new interaction object:

```json
{
  "id": "i_<12 random hex chars>",
  "contactId": "<matching contact's id>",
  "date": "YYYY-MM-DD",
  "type": "catch-up",
  "summary": "Discussed his new role at Stripe...",
  "topics": ["career", "engineering"],
  "followUp": "Send intro to Sarah",
  "createdAt": "<ISO 8601 timestamp>"
}
```

4. Append to `data/interactions.json` and write back

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
| `createdAt` | string | ISO 8601 timestamp |
| `updatedAt` | string | ISO 8601 timestamp |

### Interaction

| Field | Type | Notes |
|---|---|---|
| `id` | string | `i_` + 12 random hex chars |
| `contactId` | string | Must match a contact's `id` |
| `date` | string | `YYYY-MM-DD` format |
| `type` | string | One of: `catch-up`, `meeting`, `call`, `message`, `event`, `other` |
| `summary` | string | What happened |
| `topics` | string[] | e.g. `["career", "travel"]` |
| `followUp` | string \| null | Optional action item |
| `createdAt` | string | ISO 8601 timestamp |

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

## CLI Scripts (Optional — for local Claude Code use)

If running locally with Claude Code CLI, these TypeScript scripts are available:

```bash
# Add a contact
npx tsx src/addContact.ts --name "Name" [--company "Co"] [--role "Role"] [--how-met "Story"] [--tags tag1,tag2] [--email e] [--phone p] [--linkedin url] [--nickname nick]

# Log an interaction
npx tsx src/addInteraction.ts --contact "Name" --summary "What happened" [--date YYYY-MM-DD] [--type catch-up|meeting|call|message|event|other] [--topics t1,t2] [--follow-up "Do X"]

# Search contacts and interactions
npx tsx src/searchContacts.ts "search term"
npx tsx src/searchContacts.ts --tag "golf"
npx tsx src/searchContacts.ts --company "Acme"

# View a contact with all interactions
npx tsx src/viewContact.ts "Name"

# Bulk import from files in import/ directory
npx tsx scripts/bulkImport.ts              # Dry run
npx tsx scripts/bulkImport.ts --confirm    # Write to data files
npx tsx scripts/bulkImport.ts --file x.md  # Single file
```

These scripts require Node.js and are run from the project root. They are **not needed** when using Claude.ai — just read/write the JSON files directly.

## Getting Started

1. **Clone this repo** (it's private — your data stays private)
2. **Open in Claude.ai** using the Claude Code GitHub app, or use Claude Code CLI locally
3. **Start talking** — "Add a contact: Jane from Acme, met at the trade show" or "Who have I not spoken to recently?"

Claude will read your data files, make changes, and commit them back to the repo. Every change is versioned in git.
