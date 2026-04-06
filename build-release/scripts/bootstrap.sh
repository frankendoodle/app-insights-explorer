#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# bootstrap.sh — One-time setup for App Insights Explorer CI/CD pipeline
#
# Run this ONCE by a human admin before anything else. It creates the two
# resources that cannot be created by Terraform itself:
#   1. Azure Storage Account — Terraform remote state backend
#   2. Azure Service Principal — CI/CD pipeline identity (OIDC / no secrets)
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

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)
SUBSCRIPTION_NAME=$(az account show --query name -o tsv)

info "Subscription : $SUBSCRIPTION_NAME ($SUBSCRIPTION_ID)"
info "Tenant       : $TENANT_ID"
echo ""
read -r -p "Is this the correct subscription? (y/N) " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Run 'az account set --subscription <name>' first, then re-run this script."; exit 1; }

# ── Interactive configuration ─────────────────────────────────────────────────
section "Configuration — press Enter to accept the default"

LOCATION=$(prompt        "LOCATION"        "Azure region"                                      "eastus")
TFSTATE_RG=$(prompt      "TFSTATE_RG"      "Resource group name for Terraform state storage"   "rg-aie-tfstate")
TFSTATE_SA=$(prompt      "TFSTATE_SA"      "Storage account name (globally unique, lowercase)"  "aietfstate$RANDOM")
TFSTATE_CONTAINER=$(prompt "TFSTATE_CONTAINER" "Blob container name"                            "tfstate")
SP_NAME=$(prompt         "SP_NAME"         "Service Principal name"                            "sp-app-insights-explorer-cicd")

echo ""
info "Will create:"
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

info "Creating resource group: $TFSTATE_RG"
az group create \
  --name "$TFSTATE_RG" \
  --location "$LOCATION" \
  --output none
success "Resource group created"

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

info "Creating blob container: $TFSTATE_CONTAINER"
az storage container create \
  --name "$TFSTATE_CONTAINER" \
  --account-name "$TFSTATE_SA" \
  --auth-mode login \
  --output none
success "Blob container created"

# ── CI/CD Service Principal ───────────────────────────────────────────────────
section "CI/CD Service Principal"

info "Creating App Registration + Service Principal: $SP_NAME"
SP_APP_ID=$(az ad app create --display-name "$SP_NAME" --query appId -o tsv)
az ad sp create --id "$SP_APP_ID" --output none
SP_OBJECT_ID=$(az ad sp show --id "$SP_APP_ID" --query id -o tsv)
success "Service Principal created (appId: $SP_APP_ID)"

info "Granting Storage Blob Data Contributor on TF state storage account"
STORAGE_RESOURCE_ID=$(az storage account show \
  --name "$TFSTATE_SA" \
  --resource-group "$TFSTATE_RG" \
  --query id -o tsv)
az role assignment create \
  --assignee-object-id "$SP_OBJECT_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Storage Blob Data Contributor" \
  --scope "$STORAGE_RESOURCE_ID" \
  --output none
success "Storage Blob Data Contributor assigned"

info "Granting Contributor on subscription (scope can be narrowed to resource groups post-bootstrap)"
az role assignment create \
  --assignee-object-id "$SP_OBJECT_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Contributor" \
  --scope "/subscriptions/$SUBSCRIPTION_ID" \
  --output none
success "Contributor assigned"

# ── Output ────────────────────────────────────────────────────────────────────
section "Done — set these as GitHub Actions Variables"

echo ""
echo "  AZURE_CLIENT_ID             = $SP_APP_ID"
echo "  AZURE_TENANT_ID             = $TENANT_ID"
echo "  AZURE_SUBSCRIPTION_ID       = $SUBSCRIPTION_ID"
echo "  TF_BACKEND_RESOURCE_GROUP   = $TFSTATE_RG"
echo "  TF_BACKEND_STORAGE_ACCOUNT  = $TFSTATE_SA"
echo ""
echo "Next steps:"
echo "  1. Set the five values above as GitHub Actions Variables"
echo "     (repo → Settings → Secrets and variables → Actions → Variables)"
echo "  2. Run: cd infra/shared && terraform init && terraform apply"
echo "     This provisions ACR, federated credentials, SSO App Registration,"
echo "     remaining GitHub Variables, and branch protection rules."
echo ""
