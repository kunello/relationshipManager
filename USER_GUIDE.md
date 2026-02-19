# Personal CRM — User Guide

Your personal CRM is powered by an MCP (Model Context Protocol) server. This means you talk to Claude naturally, and Claude uses your CRM tools behind the scenes to look up, add, and manage your contacts and interactions.

**No special commands or syntax required — just talk to Claude like you'd talk to a personal assistant.**

---

## Getting Started

### First-Time Setup

1. Open **Claude.ai** (web or mobile app)
2. Go to **Settings → Integrations → Add MCP Integration**
3. Enter the server URL you were given (ends in `/mcp`)
4. You'll be prompted to **sign in with Google** — use the authorised email
5. Once connected, you'll see confirmation that 7 CRM tools are available

That's it. Your CRM is now ready to use in any Claude conversation.

---

## How It Works

When you mention people, meetings, or contacts in conversation, Claude automatically recognises that it should use your CRM. You don't need to say anything special — Claude reads the context and decides which tool to use.

For example, if you say *"Who do I know at Stripe?"*, Claude will search your contacts filtered by company. If you say *"I caught up with James yesterday"*, Claude will log an interaction.

---

## What You Can Do

### 🔍 Search for People

Just ask about someone. Claude searches by name, company, tag, role, or how you met.

| You say... | What happens |
|---|---|
| "Who do I know at Google?" | Searches contacts by company |
| "Find everyone tagged golf" | Searches contacts by tag |
| "Who's that engineer I met at the conference?" | Freeform search across all fields |
| "Do I have Sarah's details?" | Searches by name |

### 👤 Look Up a Contact

Ask for details about a specific person to see their full profile and interaction history.

| You say... | What happens |
|---|---|
| "Tell me about James" | Shows full contact + all past interactions |
| "What's Campbell's email?" | Shows contact info |
| "When did I last talk to Sarah?" | Shows contact with interactions sorted by date |

### ➕ Add a New Contact

Describe someone you met and Claude creates a contact record. Claude will check for duplicates first.

| You say... | What happens |
|---|---|
| "I met a guy called Tom at the Stripe meetup — he's a product manager" | Creates contact with name, company context, role, and how-you-met |
| "Add a contact: Lisa Chen, engineer at Notion, email lisa@notion.so" | Creates contact with specific details |
| "I just got introduced to Priya from our Melbourne office" | Creates contact with location/context |

### ✏️ Update a Contact

Tell Claude what's changed and it updates the record.

| You say... | What happens |
|---|---|
| "James moved to Atlassian" | Updates company field |
| "Sarah's new email is sarah@newco.com" | Updates contact info |
| "Tag James as 'investor'" | Adds a tag |

### 📝 Log an Interaction

Describe a meeting, call, or catch-up and Claude records it.

| You say... | What happens |
|---|---|
| "I had coffee with James today — we talked about his new role and the startup scene in Melbourne" | Logs a catch-up with summary, topics, and today's date |
| "Had a call with Sarah on Monday about the partnership deal. Need to send her the proposal by Friday." | Logs a call with date, summary, and follow-up |
| "Met Tom at the conference yesterday. Discussed AI tooling and he offered to intro me to his CTO." | Logs meeting with topics and follow-up |

### 📋 View Recent Interactions

Ask what's been happening and Claude shows recent activity.

| You say... | What happens |
|---|---|
| "What have I been up to lately?" | Shows recent interactions across all contacts |
| "When did I last catch up with James?" | Shows interactions filtered to one person |
| "Show me all my meetings this month" | Filters by type and date range |

### ✅ Check Follow-Ups

Ask about outstanding action items from past interactions.

| You say... | What happens |
|---|---|
| "What follow-ups do I have?" | Shows all pending follow-up items |
| "Do I owe anyone a response?" | Same — shows follow-ups |
| "What did I say I'd do after meeting Sarah?" | Shows follow-ups for a specific person |

---

## Tips

- **Be natural.** You don't need to say "use the CRM" or "call the search tool." Just talk about people and Claude figures it out.
- **Add context when logging interactions.** The more detail you give ("we discussed X, Y, Z — I need to follow up on A"), the more useful your records become when you search later.
- **Use tags.** When adding contacts, mention categories like "golf buddy", "investor", "work" — these become searchable tags.
- **Paste raw text.** You can paste meeting notes, email threads, or chat logs and ask Claude to extract contacts and interactions from them.
- **Ask complex questions.** "Who have I not spoken to in the last 3 months?" or "Which investors have I met this year?" — Claude can cross-reference contacts and interactions to answer these.

---

## Privacy & Security

- Your data is stored in a private Google Cloud Storage bucket
- Only the authorised Google account can access the MCP server
- All requests require a valid Google OAuth token with email verification
- Claude doesn't store your CRM data — it reads it fresh from your bucket each time
- No third-party APIs are involved (no Anthropic API key, no Firebase Auth)

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Claude doesn't seem to use CRM tools | Check Settings → Integrations — make sure the MCP server shows as connected |
| "Unauthorized" errors | Re-authenticate: disconnect and reconnect the integration |
| Tools appear but return errors | The Cloud Run service may have cold-started — try again in a few seconds |
| Data seems stale | Claude reads fresh from storage on every request — there's no cache |
