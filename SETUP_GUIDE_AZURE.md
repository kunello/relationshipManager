# Personal CRM — Azure Setup Guide

A step-by-step guide to deploying your personal CRM on Azure and connecting it to Claude.ai.

---

## Prerequisites

Before you start, make sure you have:

- **An Azure account** — [Sign up here](https://azure.microsoft.com/free/) if you don't have one
- **Azure CLI (`az`)** — [Install instructions](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli)
- **Node.js 22+** — [Download here](https://nodejs.org/)
- **Git** — to clone this repository
- **A Microsoft account** (personal or work/school) that you'll use as the single authorised user

Run `az login` to sign in to the Azure CLI before proceeding.

---

## Step 1: Create an Azure App Registration

This is how your CRM authenticates users via Microsoft sign-in.

1. Go to the [Azure Portal](https://portal.azure.com)
2. Search for **"Entra ID"** (formerly Azure Active Directory) in the top search bar
3. In the left sidebar, click **App registrations** → **New registration**
4. Fill in the form:
   - **Name:** `Personal CRM MCP`
   - **Supported account types:** "Accounts in this organizational directory only" (Single tenant)
   - **Redirect URI:** Select **Web** from the dropdown, then enter:
     ```
     https://claude.ai/api/mcp/auth_callback
     ```
5. Click **Register**

### Copy your Client ID and Tenant ID

On the app's **Overview** page, copy these two values — you'll need them later:
- **Application (client) ID** → this is your `AZURE_CLIENT_ID`
- **Directory (tenant) ID** → this is your `AZURE_TENANT_ID`

### Create a Client Secret

1. In the left sidebar of your app registration, click **Certificates & secrets**
2. Click **New client secret**
3. Description: `CRM MCP Server`
4. Expiry: Choose an appropriate duration (e.g., 24 months)
5. Click **Add**
6. **Copy the secret Value immediately** — you won't be able to see it again after leaving this page. This is your `AZURE_CLIENT_SECRET`.

### Add API Permissions

1. In the left sidebar, click **API permissions**
2. Click **Add a permission** → **Microsoft Graph** → **Delegated permissions**
3. Search for and select **User.Read**
4. Click **Add permissions**
5. If you see a "Grant admin consent" button and you're an admin, click it (otherwise, an admin will need to consent)

---

## Step 2: Create Azure Resources

You can create these via the Azure Portal or CLI. The deployment script (Step 4) will also create them automatically, but if you prefer to set them up first:

### Option A: Let the deploy script handle it (recommended)

Skip to Step 3 — the script creates everything automatically.

### Option B: Create manually via CLI

```bash
# Create a resource group
az group create --name personal-crm-rg --location eastus

# Create a storage account (name must be globally unique, lowercase, alphanumeric)
az storage account create \
  --name yournamecrmdata \
  --resource-group personal-crm-rg \
  --location eastus \
  --sku Standard_LRS

# Create a blob container
az storage container create \
  --name crm-data \
  --account-name yournamecrmdata
```

---

## Step 3: Configure Environment

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and fill in the **Azure section** (you can leave the GCP section empty):

   ```bash
   # ── Required ──
   ALLOWED_EMAIL=you@yourdomain.com

   # ── Azure Subscription ──
   AZURE_SUBSCRIPTION_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   AZURE_RESOURCE_GROUP=personal-crm-rg
   AZURE_LOCATION=eastus

   # ── Azure Storage ──
   AZURE_STORAGE_ACCOUNT_NAME=yournamecrmdata
   AZURE_CONTAINER_NAME=crm-data

   # ── Microsoft Entra ID ──
   AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   AZURE_CLIENT_SECRET=your-client-secret-value
   AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```

   **Important:** `ALLOWED_EMAIL` must match the Microsoft account email you'll sign in with.

---

## Step 4: Deploy

Run the deployment script from the project root:

```bash
./scripts/deploy-azure.sh
```

The script will:
1. Create the Azure resource group (if needed)
2. Create the storage account and blob container
3. Build the container image in Azure Container Registry
4. Deploy to Azure Container Apps
5. Seed empty data files (`contacts.json`, `interactions.json`)
6. Print the service URL

After deployment, the script will display something like:

```
═══════════════════════════════════════════
  MCP Server deployed!

  Service URL: https://crm-mcp-server.blueocean-abc123.eastus.azurecontainerapps.io
  MCP endpoint: https://crm-mcp-server.blueocean-abc123.eastus.azurecontainerapps.io/mcp
  Health check: https://crm-mcp-server.blueocean-abc123.eastus.azurecontainerapps.io/health
═══════════════════════════════════════════
```

### Add the callback redirect URI

After getting your service URL, go back to your App Registration in Azure Portal:

1. Go to **Authentication** in the left sidebar
2. Under **Redirect URIs**, click **Add URI**
3. Add: `https://YOUR-SERVICE-URL/callback` (replace with your actual URL)
4. Click **Save**

You should now have **two** redirect URIs:
- `https://claude.ai/api/mcp/auth_callback`
- `https://YOUR-SERVICE-URL/callback`

### Verify the deployment

```bash
curl https://YOUR-SERVICE-URL/health
# Should return: {"status":"ok"}
```

---

## Step 5: Connect to Claude.ai

1. Go to [claude.ai](https://claude.ai)
2. Click your profile icon → **Settings**
3. Go to **Integrations** → **Add MCP Integration**
4. Enter:
   - **URL:** Your service URL ending in `/mcp` (e.g., `https://crm-mcp-server.blueocean-abc123.eastus.azurecontainerapps.io/mcp`)
   - **Client ID:** Your `AZURE_CLIENT_ID`
   - **Client Secret:** Your `AZURE_CLIENT_SECRET`
5. Click **Connect** — you'll be redirected to Microsoft sign-in
6. Sign in with the email matching your `ALLOWED_EMAIL`
7. Once connected, you'll see confirmation that **7 CRM tools** are available

---

## Step 6: Verify It Works

Start a new conversation in Claude.ai and try these:

| You say... | What should happen |
|---|---|
| "Add a contact: Test User from Acme, met at the conference" | Creates a contact in your blob storage |
| "Who do I know?" | Searches and returns contacts |
| "Tell me about Test User" | Shows full contact details |
| "I had coffee with Test User today, talked about partnerships" | Logs an interaction |
| "What follow-ups do I have?" | Shows pending action items |

If the tools appear but you see errors, wait a few seconds and try again — Azure Container Apps may be cold-starting.

---

## How It Works

```
Claude.ai ←→ MCP Server (Azure Container Apps) ←→ Azure Blob Storage
                    ↕
          Microsoft Entra ID (OAuth)
```

- **Claude.ai** connects to your MCP server using the OAuth flow
- When you talk about people, Claude calls your CRM tools (search, add, update, log)
- The MCP server reads/writes JSON files (`contacts.json`, `interactions.json`) in Azure Blob Storage
- Only the Microsoft account matching `ALLOWED_EMAIL` can access the server

---

## What You Can Do

### Search for People

Just ask about someone. Claude searches by name, company, tag, role, or how you met.

| You say... | What happens |
|---|---|
| "Who do I know at Google?" | Searches contacts by company |
| "Find everyone tagged golf" | Searches contacts by tag |
| "Who's that engineer I met at the conference?" | Freeform search across all fields |

### Look Up a Contact

Ask for details about a specific person to see their full profile and interaction history.

| You say... | What happens |
|---|---|
| "Tell me about James" | Shows full contact + all past interactions |
| "What's Campbell's email?" | Shows contact info |
| "When did I last talk to Sarah?" | Shows interactions sorted by date |

### Add a New Contact

Describe someone you met and Claude creates a contact record.

| You say... | What happens |
|---|---|
| "I met Tom at the Stripe meetup — he's a PM" | Creates contact with details |
| "Add a contact: Lisa Chen, engineer at Notion" | Creates contact with specific details |

### Log an Interaction

Describe a meeting, call, or catch-up and Claude records it.

| You say... | What happens |
|---|---|
| "I had coffee with James today — talked about his new role" | Logs a catch-up |
| "Had a call with Sarah on Monday about the deal. Need to send proposal." | Logs call with follow-up |

### Check Follow-Ups

| You say... | What happens |
|---|---|
| "What follow-ups do I have?" | Shows all pending action items |
| "Do I owe anyone a response?" | Shows follow-ups from recent interactions |

---

## Privacy & Security

- **Your data is private** — stored in your own Azure Blob Storage account under your subscription
- **Single-user access** — only the Microsoft account matching `ALLOWED_EMAIL` can authenticate
- **Token verification** — every request is verified against Microsoft Graph to confirm identity
- **No third-party data sharing** — Claude reads data fresh from your storage on each request
- **You control the infrastructure** — delete the resource group at any time to remove everything

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Claude doesn't show CRM tools | Check Settings → Integrations — make sure the MCP server shows as connected |
| "Unauthorized" or sign-in errors | Verify `ALLOWED_EMAIL` matches your Microsoft account exactly |
| "Forbidden: unauthorized email" in logs | The signed-in email doesn't match `ALLOWED_EMAIL` — check for typos |
| "Invalid or expired token" errors | Re-authenticate: disconnect and reconnect the integration in Claude.ai |
| Tools appear but return errors | Azure Container Apps may be cold-starting — wait a few seconds and retry |
| "AADSTS50011: redirect URI mismatch" | Add both redirect URIs to your App Registration (see Step 4 above) |
| Deployment script fails at ACR build | Check that Docker/container support is available; run `az provider register --namespace Microsoft.ContainerRegistry` |
| Storage errors | Verify `AZURE_STORAGE_CONNECTION_STRING` is correct — re-run the deploy script |
| Need to check logs | Run: `az containerapp logs show --name crm-mcp-server --resource-group YOUR-RG --type console` |

### Redeploying After Code Changes

If you update the server code, re-run the deploy script:

```bash
./scripts/deploy-azure.sh
```

It's idempotent — it will rebuild the image and update the Container App without recreating everything.

---

## Cleaning Up

To remove all Azure resources:

```bash
az group delete --name personal-crm-rg --yes --no-wait
```

This deletes the resource group and everything inside it (storage, container registry, container app).
