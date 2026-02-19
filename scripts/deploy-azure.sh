#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "═══════════════════════════════════════════"
echo "  Personal CRM — Deploy MCP Server (Azure)"
echo "═══════════════════════════════════════════"

# Load .env if present
if [ -f "$PROJECT_ROOT/.env" ]; then
  echo "Loading .env..."
  set -a
  source "$PROJECT_ROOT/.env"
  set +a
fi

# ── Step 1: Validate required env vars ──
echo ""
echo "Validating environment..."
for var in ALLOWED_EMAIL AZURE_SUBSCRIPTION_ID AZURE_RESOURCE_GROUP AZURE_LOCATION \
           AZURE_STORAGE_ACCOUNT_NAME AZURE_CONTAINER_NAME \
           AZURE_CLIENT_ID AZURE_CLIENT_SECRET AZURE_TENANT_ID; do
  if [ -z "${!var:-}" ]; then
    echo "ERROR: $var is not set. See .env.example"
    exit 1
  fi
done
echo "All required vars present."

# Derived names
ACR_NAME="${AZURE_RESOURCE_GROUP}acr"
# ACR names must be alphanumeric only, 5-50 chars
ACR_NAME=$(echo "$ACR_NAME" | tr -cd '[:alnum:]' | cut -c1-50)
CONTAINER_APP_NAME="crm-mcp-server"
CONTAINER_ENV_NAME="${AZURE_RESOURCE_GROUP}-env"
IMAGE_NAME="crm-mcp-server"
IMAGE_TAG="latest"

# ── Step 2: Set Azure subscription ──
echo ""
echo "Setting Azure subscription to $AZURE_SUBSCRIPTION_ID..."
az account set --subscription "$AZURE_SUBSCRIPTION_ID"

# ── Step 3: Create resource group ──
echo ""
echo "Creating resource group: $AZURE_RESOURCE_GROUP..."
az group create \
  --name "$AZURE_RESOURCE_GROUP" \
  --location "$AZURE_LOCATION" \
  --output none 2>/dev/null || true
echo "Resource group ready."

# ── Step 4: Create storage account + blob container ──
echo ""
echo "Creating storage account: $AZURE_STORAGE_ACCOUNT_NAME..."
az storage account create \
  --name "$AZURE_STORAGE_ACCOUNT_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --location "$AZURE_LOCATION" \
  --sku Standard_LRS \
  --kind StorageV2 \
  --output none 2>/dev/null || true

echo "Getting storage connection string..."
AZURE_STORAGE_CONNECTION_STRING=$(az storage account show-connection-string \
  --name "$AZURE_STORAGE_ACCOUNT_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --query connectionString \
  --output tsv)

echo "Creating blob container: $AZURE_CONTAINER_NAME..."
az storage container create \
  --name "$AZURE_CONTAINER_NAME" \
  --connection-string "$AZURE_STORAGE_CONNECTION_STRING" \
  --output none 2>/dev/null || true
echo "Storage ready."

# ── Step 5: Create Azure Container Registry + build image ──
echo ""
echo "Creating Azure Container Registry: $ACR_NAME..."
az acr create \
  --name "$ACR_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --sku Basic \
  --admin-enabled true \
  --output none 2>/dev/null || true

echo "Building container image in ACR..."
az acr build \
  --registry "$ACR_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --image "${IMAGE_NAME}:${IMAGE_TAG}" \
  "$PROJECT_ROOT/azure/functions-mcp"

ACR_LOGIN_SERVER=$(az acr show \
  --name "$ACR_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --query loginServer \
  --output tsv)

ACR_PASSWORD=$(az acr credential show \
  --name "$ACR_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --query "passwords[0].value" \
  --output tsv)

# ── Step 6: Create Container Apps environment + deploy ──
echo ""
echo "Creating Container Apps environment: $CONTAINER_ENV_NAME..."
az containerapp env create \
  --name "$CONTAINER_ENV_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --location "$AZURE_LOCATION" \
  --output none 2>/dev/null || true

echo "Deploying Container App: $CONTAINER_APP_NAME..."
az containerapp create \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --environment "$CONTAINER_ENV_NAME" \
  --image "${ACR_LOGIN_SERVER}/${IMAGE_NAME}:${IMAGE_TAG}" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_NAME" \
  --registry-password "$ACR_PASSWORD" \
  --target-port 8080 \
  --ingress external \
  --min-replicas 0 \
  --max-replicas 1 \
  --cpu 0.5 \
  --memory 1.0Gi \
  --env-vars \
    "ALLOWED_EMAIL=${ALLOWED_EMAIL}" \
    "AZURE_STORAGE_CONNECTION_STRING=${AZURE_STORAGE_CONNECTION_STRING}" \
    "AZURE_CONTAINER_NAME=${AZURE_CONTAINER_NAME}" \
    "AZURE_CLIENT_ID=${AZURE_CLIENT_ID}" \
    "AZURE_CLIENT_SECRET=${AZURE_CLIENT_SECRET}" \
    "AZURE_TENANT_ID=${AZURE_TENANT_ID}" \
  --output none 2>/dev/null || true

# ── Step 7: Get service URL and update SERVICE_URL env var ──
echo ""
echo "Retrieving service URL..."
SERVICE_URL=$(az containerapp show \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --query "properties.configuration.ingress.fqdn" \
  --output tsv)
SERVICE_URL="https://${SERVICE_URL}"

echo "Setting SERVICE_URL=${SERVICE_URL}..."
az containerapp update \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --set-env-vars "SERVICE_URL=${SERVICE_URL}" \
  --output none

# ── Step 8: Seed blob container if empty ──
echo ""
echo "Checking blob container for initial seed files..."
BLOB_EXISTS=$(az storage blob exists \
  --container-name "$AZURE_CONTAINER_NAME" \
  --name "contacts.json" \
  --connection-string "$AZURE_STORAGE_CONNECTION_STRING" \
  --query exists \
  --output tsv)

if [ "$BLOB_EXISTS" = "false" ]; then
  echo "Seeding initial data files..."
  echo '[]' | az storage blob upload \
    --container-name "$AZURE_CONTAINER_NAME" \
    --name "contacts.json" \
    --data @- \
    --content-type "application/json" \
    --connection-string "$AZURE_STORAGE_CONNECTION_STRING" \
    --overwrite \
    --output none
  echo '[]' | az storage blob upload \
    --container-name "$AZURE_CONTAINER_NAME" \
    --name "interactions.json" \
    --data @- \
    --content-type "application/json" \
    --connection-string "$AZURE_STORAGE_CONNECTION_STRING" \
    --overwrite \
    --output none
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
echo "  IMPORTANT: Ensure these redirect URIs are"
echo "  configured in your Entra ID App Registration:"
echo "    https://claude.ai/api/mcp/auth_callback"
echo "    ${SERVICE_URL}/callback"
echo ""
echo "  To register with Claude.ai:"
echo "  1. Go to Settings → Integrations → Add MCP Server"
echo "  2. Enter URL: ${SERVICE_URL}/mcp"
echo "  3. Enter Client ID: ${AZURE_CLIENT_ID}"
echo "  4. Enter Client Secret: ${AZURE_CLIENT_SECRET}"
echo "  5. Sign in with ${ALLOWED_EMAIL}"
echo "  6. Your 7 CRM tools will appear in conversations"
echo "═══════════════════════════════════════════"
