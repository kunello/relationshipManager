# Setting Up Your Personal CRM in Claude Projects

## Step 1: Create a Claude Project

1. Go to [claude.ai](https://claude.ai)
2. In the left sidebar, click **Projects** → **Create Project**
3. Name it something like **"Personal CRM"**

## Step 2: Set Project Instructions

1. Open your new project
2. Click the **⚙️ settings icon** (or "Edit project")
3. Find the **Custom Instructions** field
4. Copy the entire contents of `PROJECT_INSTRUCTIONS.md` and paste it in
5. Save

## Step 3: Upload Your Data Files

1. In the project settings, find **Project Knowledge**
2. Upload these two files:
   - `data/contacts.json`
   - `data/interactions.json`
3. These start as empty arrays `[]` — they'll grow as you add people

## Step 4: Start Using It

Open a new conversation in the project and try:

- **"Add a contact: Sarah Chen, works at Google as a PM, met her at the tech mixer last week"**
- **"Who do I know?"** (lists all contacts)
- **"Log a catch-up with Sarah — we grabbed coffee, talked about her team's new product launch"**

## Daily Workflow

### Reading (instant, no friction)

Just ask questions — Claude reads your uploaded data files automatically:
- "What did I last talk about with James?"
- "Who have I not caught up with in over a month?"
- "Who do I know in engineering at Stripe?"

### Writing (requires re-upload)

When you add a contact or log an interaction, Claude will output the **updated JSON file** in a code block. To save the change:

1. **On desktop:** Click the copy button on the code block → paste into a text editor → save as `contacts.json` (or `interactions.json`) → re-upload to Project Knowledge (replacing the old file)
2. **On mobile:** Long-press the code block to copy → save via a text editor app or Files → re-upload

> **Tip:** You can batch multiple additions in one conversation ("Add these 3 people I met today...") so you only need to re-upload once.

## Keeping a Backup

Your GitHub repo at `github.com/kunello/relationshipManager` serves as a backup. Periodically download your latest JSON files from Project Knowledge and commit them to the repo:

```bash
# From your local clone
cp ~/Downloads/contacts.json data/contacts.json
cp ~/Downloads/interactions.json data/interactions.json
git add data/ && git commit -m "Sync CRM data" && git push
```

## Limitations

- **Claude can't modify Project Knowledge directly** — you need to re-upload updated files after writes
- **Knowledge files have a size limit** — Claude Projects support up to 200,000 tokens per project. For a personal CRM this is generous (thousands of contacts)
- **No real-time sync** — if you use multiple conversations, make sure you re-upload data between them so each conversation has the latest version
