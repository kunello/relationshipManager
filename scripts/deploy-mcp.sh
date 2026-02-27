#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "═══════════════════════════════════════════"
echo "  Personal CRM — Deploy MCP Server"
echo "═══════════════════════════════════════════"

# ── Secrets via 1Password CLI ──
# If not already running under `op run`, re-exec with 1Password secret injection.
# This resolves op:// references in .env.tpl into environment variables at runtime
# without ever writing plaintext secrets to disk.
ENV_TPL="$PROJECT_ROOT/.env.tpl"
if [ -f "$ENV_TPL" ] && [ -z "${OP_INJECTED:-}" ]; then
  echo "Injecting secrets from 1Password via .env.tpl..."
  export OP_INJECTED=1
  exec op run --account=my.1password.com --env-file="$ENV_TPL" -- "$0" "$@"
fi

# ── Step 1: Validate required env vars ──
echo ""
echo "Validating environment..."
for var in ALLOWED_EMAIL GOOGLE_PROJECT_ID DATA_BUCKET_NAME GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET; do
  if [ -z "${!var:-}" ]; then
    echo "ERROR: $var is not set. See .env.example"
    exit 1
  fi
done
echo "All required vars present."

# ── Step 2: Set GCP project ──
echo ""
echo "Setting GCP project to $GOOGLE_PROJECT_ID..."
gcloud config set project "$GOOGLE_PROJECT_ID"

# ── Step 3: Create GCS bucket if it doesn't exist ──
echo ""
echo "Checking GCS data bucket: gs://$DATA_BUCKET_NAME"
if ! gcloud storage buckets describe "gs://$DATA_BUCKET_NAME" > /dev/null 2>&1; then
  echo "Creating bucket gs://$DATA_BUCKET_NAME..."
  gcloud storage buckets create "gs://$DATA_BUCKET_NAME" \
    --location=us-central1 \
    --uniform-bucket-level-access
else
  echo "Bucket already exists — skipping."
fi

# ── Step 4: Store client secret in Secret Manager ──
echo ""
echo "Storing GOOGLE_CLIENT_SECRET in Secret Manager..."
if gcloud secrets describe GOOGLE_CLIENT_SECRET --project="$GOOGLE_PROJECT_ID" > /dev/null 2>&1; then
  echo "Secret already exists — adding new version..."
  echo -n "$GOOGLE_CLIENT_SECRET" | gcloud secrets versions add GOOGLE_CLIENT_SECRET --data-file=-
else
  echo "Creating new secret..."
  echo -n "$GOOGLE_CLIENT_SECRET" | gcloud secrets create GOOGLE_CLIENT_SECRET \
    --project="$GOOGLE_PROJECT_ID" \
    --data-file=-
fi

# Grant Cloud Run service account access to the secret
PROJECT_NUMBER=$(gcloud projects describe "$GOOGLE_PROJECT_ID" --format='value(projectNumber)')
gcloud secrets add-iam-policy-binding GOOGLE_CLIENT_SECRET \
  --project="$GOOGLE_PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" > /dev/null 2>&1 || true
echo "Secret stored."

# ── Step 5: First deploy (to get the URL, needed for SERVICE_URL env var) ──
echo ""
echo "Deploying crm-mcp-server to Cloud Run..."

# Build env vars — SERVICE_URL will be set after first deploy
ENV_VARS="ALLOWED_EMAIL=${ALLOWED_EMAIL},DATA_BUCKET_NAME=${DATA_BUCKET_NAME},GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}"

gcloud run deploy crm-mcp-server \
  --source="$PROJECT_ROOT/gcp/functions-mcp" \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --memory=512Mi \
  --timeout=300 \
  --port=8080 \
  --set-env-vars="$ENV_VARS" \
  --set-secrets="GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest"

# ── Step 6: Get service URL and redeploy with SERVICE_URL set ──
echo ""
echo "Retrieving service URL..."
SERVICE_URL=$(gcloud run services describe crm-mcp-server \
  --region=us-central1 \
  --format='value(status.url)')

echo "Setting SERVICE_URL=${SERVICE_URL}..."
gcloud run services update crm-mcp-server \
  --region=us-central1 \
  --update-env-vars="SERVICE_URL=${SERVICE_URL}"

# ── Step 7: Seed GCS bucket if empty ──
echo ""
echo "Checking data bucket for initial seed files..."
if ! gcloud storage objects describe "gs://$DATA_BUCKET_NAME/contacts.json" > /dev/null 2>&1; then
  echo "Seeding initial data files..."
  echo '[]' | gcloud storage cp - "gs://$DATA_BUCKET_NAME/contacts.json" --content-type=application/json
  echo '[]' | gcloud storage cp - "gs://$DATA_BUCKET_NAME/interactions.json" --content-type=application/json
  echo "Empty contacts.json and interactions.json created."
else
  echo "Data files already exist — skipping seed."
fi

# ── Done ──
echo ""
echo "═══════════════════════════════════════════"
echo "  MCP Server deployed!"
echo ""
echo "  Service URL: ${SERVICE_URL}"
echo "  MCP endpoint: ${SERVICE_URL}/mcp"
echo "  Health check: ${SERVICE_URL}/health"
echo ""
echo "  IMPORTANT: Add this redirect URI to your"
echo "  Google OAuth Client ID configuration:"
echo "    ${SERVICE_URL}/callback"
echo ""
echo "  To register with Claude.ai:"
echo "  1. Go to Settings → Integrations → Add MCP Server"
echo "  2. Enter URL: ${SERVICE_URL}/mcp"
echo "  3. Sign in with ${ALLOWED_EMAIL}"
echo "  4. Your 13 CRM tools will appear in conversations"
echo "═══════════════════════════════════════════"
