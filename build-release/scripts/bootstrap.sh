#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# bootstrap.sh — One-time setup for App Insights Explorer CI/CD pipeline
#
# Run this ONCE by a human admin before anything else. It creates the two
# resources that cannot be created by Terraform itself:
#   1. Azure Storage Account — Terraform remote state backend
#   2. Azure Service Principal — CI/CD pipeline identity (OIDC / no secrets)
#
# Safe to re-run: checks for existing resources before creating.
#
# Prerequisites:
#   - Azure CLI installed and logged in: az login
#   - Sufficient permissions: Owner or Contributor + User Access Administrator
#     on the target subscription
#
# Usage:
#   chmod +x build-release/scripts/bootstrap.sh
#   ./build-release/scripts/bootstrap.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { echo "[INFO]  $*"; }
success() { echo "[OK]    $*"; }
skip()    { echo "[SKIP]  $*"; }
section() { echo ""; echo "── $* ──────────────────────────────────────────────"; }

prompt() {
  local var_name="$1"
  local prompt_text="$2"
  local default="$3"
  local value
  read -r -p "$prompt_text [$default]: " value
  echo "${value:-$default}"
}

# ── Preflight ─────────────────────────────────────────────────────────────────
section "Preflight — current Azure context"

SUBSCRIPTION_ID=$(az account show --query id -o tsv | tr -d '\r')
TENANT_ID=$(az account show --query tenantId -o tsv | tr -d '\r')
SUBSCRIPTION_NAME=$(az account show --query name -o tsv | tr -d '\r')

info "Subscription : $SUBSCRIPTION_NAME ($SUBSCRIPTION_ID)"
info "Tenant       : $TENANT_ID"
echo ""
read -r -p "Is this the correct subscription? (y/N) " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Run 'az account set --subscription <name>' first, then re-run this script."; exit 1; }

# ── Interactive configuration ─────────────────────────────────────────────────
section "Configuration — press Enter to accept the default"

LOCATION=$(prompt        "LOCATION"           "Azure region"                                      "westus2")
TFSTATE_RG=$(prompt      "TFSTATE_RG"         "Resource group name for Terraform state storage"   "rg-aie-tfstate-3")
TFSTATE_SA=$(prompt      "TFSTATE_SA"         "Storage account name (globally unique, lowercase)"  "aietfstate3")
TFSTATE_CONTAINER=$(prompt "TFSTATE_CONTAINER" "Blob container name"                              "tfstate3")
SP_NAME=$(prompt         "SP_NAME"            "Service Principal name"                            "sp-app-insights-explorer-cicd-3")

echo ""
info "Will create (skipping any that already exist):"
info "  Location          : $LOCATION"
info "  TF state RG       : $TFSTATE_RG"
info "  Storage account   : $TFSTATE_SA"
info "  Blob container    : $TFSTATE_CONTAINER"
info "  Service Principal : $SP_NAME"
echo ""
read -r -p "Proceed? (y/N) " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

# ── Terraform state storage ───────────────────────────────────────────────────
section "Terraform state storage"

if az group show --name "$TFSTATE_RG" &>/dev/null; then
  skip "Resource group already exists: $TFSTATE_RG"
else
  info "Creating resource group: $TFSTATE_RG"
  az group create \
    --name "$TFSTATE_RG" \
    --location "$LOCATION" \
    --output none
  success "Resource group created"
fi

if az storage account show --name "$TFSTATE_SA" --resource-group "$TFSTATE_RG" &>/dev/null; then
  skip "Storage account already exists: $TFSTATE_SA"
else
  info "Creating storage account: $TFSTATE_SA"
  az storage account create \
    --name "$TFSTATE_SA" \
    --resource-group "$TFSTATE_RG" \
    --location "$LOCATION" \
    --sku Standard_LRS \
    --kind StorageV2 \
    --min-tls-version TLS1_2 \
    --allow-blob-public-access false \
    --output none
  success "Storage account created"
fi

if az storage container show \
     --name "$TFSTATE_CONTAINER" \
     --account-name "$TFSTATE_SA" \
     --auth-mode login &>/dev/null; then
  skip "Blob container already exists: $TFSTATE_CONTAINER"
else
  info "Creating blob container: $TFSTATE_CONTAINER"
  az storage container create \
    --name "$TFSTATE_CONTAINER" \
    --account-name "$TFSTATE_SA" \
    --auth-mode login \
    --output none
  success "Blob container created"
fi

STORAGE_RESOURCE_ID="/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$TFSTATE_RG/providers/Microsoft.Storage/storageAccounts/$TFSTATE_SA"

# ── CI/CD Service Principal ───────────────────────────────────────────────────
section "CI/CD Service Principal"

EXISTING_APP_ID=$(az ad app list --display-name "$SP_NAME" --query "[0].appId" -o tsv 2>/dev/null | tr -d '\r' || echo "")

if [[ -n "$EXISTING_APP_ID" && "$EXISTING_APP_ID" != "null" ]]; then
  skip "App Registration already exists: $SP_NAME (appId: $EXISTING_APP_ID)"
  SP_APP_ID="$EXISTING_APP_ID"
else
  info "Creating App Registration + Service Principal: $SP_NAME"
  SP_APP_ID=$(az ad app create --display-name "$SP_NAME" --query appId -o tsv | tr -d '\r')
  az ad sp create --id "$SP_APP_ID" --output none
  success "App Registration + Service Principal created (appId: $SP_APP_ID)"
fi

SP_OBJECT_ID=$(az ad sp show --id "$SP_APP_ID" --query id -o tsv | tr -d '\r')

# ── Role assignments ──────────────────────────────────────────────────────────
section "Role assignments"

# Validate critical variables before attempting role assignments
info "Debug — variable values:"
info "  SUBSCRIPTION_ID    : '${SUBSCRIPTION_ID}'"
info "  SP_OBJECT_ID       : '${SP_OBJECT_ID}'"
info "  STORAGE_RESOURCE_ID: '${STORAGE_RESOURCE_ID}'"
echo ""

[[ -n "$SUBSCRIPTION_ID" ]]     || { echo "ERROR: SUBSCRIPTION_ID is empty — check az login"; exit 1; }
[[ -n "$SP_OBJECT_ID" ]]        || { echo "ERROR: SP_OBJECT_ID is empty — SP lookup failed"; exit 1; }
[[ -n "$STORAGE_RESOURCE_ID" ]] || { echo "ERROR: STORAGE_RESOURCE_ID is empty"; exit 1; }

EXISTING_STORAGE_ROLE=$(az role assignment list --assignee "$SP_APP_ID" --role "Storage Blob Data Contributor" --scope "$STORAGE_RESOURCE_ID" --subscription "$SUBSCRIPTION_ID" --query "[0].id" -o tsv 2>/dev/null | tr -d '\r' || echo "")

if [[ -n "$EXISTING_STORAGE_ROLE" && "$EXISTING_STORAGE_ROLE" != "null" ]]; then
  skip "Storage Blob Data Contributor already assigned"
else
  info "Granting Storage Blob Data Contributor on TF state storage account"
  az role assignment create --assignee "$SP_APP_ID" --role "Storage Blob Data Contributor" --scope "$STORAGE_RESOURCE_ID" --subscription "$SUBSCRIPTION_ID" --output none
  success "Storage Blob Data Contributor assigned"
fi

EXISTING_SUB_ROLE=$(az role assignment list --assignee "$SP_APP_ID" --role "Contributor" --scope "/subscriptions/$SUBSCRIPTION_ID" --subscription "$SUBSCRIPTION_ID" --query "[0].id" -o tsv 2>/dev/null | tr -d '\r' || echo "")

if [[ -n "$EXISTING_SUB_ROLE" && "$EXISTING_SUB_ROLE" != "null" ]]; then
  skip "Contributor on subscription already assigned"
else
  info "Granting Contributor on subscription"
  az role assignment create --assignee "$SP_APP_ID" --role "Contributor" --scope "/subscriptions/$SUBSCRIPTION_ID" --subscription "$SUBSCRIPTION_ID" --output none
  success "Contributor assigned"
fi

# ── Output ────────────────────────────────────────────────────────────────────
section "Done — set these as GitHub Actions Variables"

echo ""
echo "  AZURE_CLIENT_ID             = $SP_APP_ID"
echo "  AZURE_TENANT_ID             = $TENANT_ID"
echo "  AZURE_SUBSCRIPTION_ID       = $SUBSCRIPTION_ID"
echo "  TF_BACKEND_RESOURCE_GROUP   = $TFSTATE_RG"
echo "  TF_BACKEND_STORAGE_ACCOUNT  = $TFSTATE_SA"
echo ""
echo "Also record this value — needed as input variable for infra/shared/:"
echo ""
echo "  SP_OBJECT_ID (cicd_sp_object_id) = $SP_OBJECT_ID"
echo ""
echo "Next steps:"
echo "  1. Set the five AZURE_* and TF_BACKEND_* values above as GitHub Actions Variables"
echo "     (repo → Settings → Secrets and variables → Actions → Variables)"
echo "  2. Record SP_OBJECT_ID — you will pass it as -var cicd_sp_object_id=<value>"
echo "     when running terraform apply for infra/shared/"
echo "  3. Run: cd infra/shared && terraform init && terraform apply"
echo ""
