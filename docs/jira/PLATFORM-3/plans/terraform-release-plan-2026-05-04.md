---
title: "Terraform IaC Release — Implementation Plan"
ticket: PLATFORM-3
spec: specs/terraform-release-spec-2026-05-04.md
manifest: manifest.md
date: 2026-05-04
tags: [ai/generated, jira/implementation-plan]
tech_stack: ["Terraform >= 1.9", "hashicorp/azurerm ~> 4.0", "hashicorp/azuread ~> 3.0", "Azure CLI", "Bash"]
testing_strategy: manual
validation_commands:
  - "terraform validate"
  - "terraform plan"
  - "terraform apply"
  - "az resource show --ids <resource-id>"
---

> Automated review identified and resolved 1 issue before this presentation: missing `Key Vault Secrets Officer` role assignment for the CI/CD service principal (required for `az keyvault secret set` when Key Vault RBAC authorization mode is enabled).

# Terraform IaC Release — Implementation Plan

**Goal:** Produce a reproducible provisioning sequence — a modified bootstrap script, two Terraform root modules, and a CI workflow extension — that provisions fresh Azure infrastructure named with the `-tfg` suffix and passes the PLATFORM-29 CI/CD pipeline end-to-end.

**Architecture:** The bootstrap script is run once by the developer to create the Terraform state backend and CI/CD service principal. `infra/shared/` is applied next to provision ACR, the SSO App Registration, and the OIDC federated credential. `infra/envs/test/` is applied last to provision the resource group, App Service Plan, two web apps, Key Vault, four RBAC role assignments, and all App Service settings. The `ci-test.yml` workflow extension writes all secret values from GitHub Secrets to Key Vault after each deploy, completing the hybrid secret management design. All Terraform-managed resources carry a `-tfg` suffix and coexist with the existing hand-provisioned PLATFORM-1 resources.

**Tech Stack:** Terraform >= 1.9, hashicorp/azurerm ~> 4.0, hashicorp/azuread ~> 3.0, Azure CLI, Bash

**Testing Strategy:** Manual verification — each task runs `terraform plan` or `terraform apply` and verifies the result via `az` CLI or portal inspection.

> **Windows / PowerShell note:** Multi-line commands in the per-task steps use shell line-continuation (`\`). In PowerShell, replace every trailing `\` with a backtick (`` ` ``). The **Pre-Merge Provisioning Sequence** section below uses PowerShell syntax throughout and is the primary reference for running these steps on Windows.

**Validation Commands:**
- `terraform validate`
- `terraform plan`
- `terraform apply`
- `az resource show --ids <resource-id>`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `build-release/scripts/bootstrap.sh` | Modify | Add idempotency checks + `SP_OBJECT_ID` output |
| `infra/shared/providers.tf` | Create | azurerm + azuread provider configuration |
| `infra/shared/backend.tf` | Create | azurerm backend pointing to TF state storage |
| `infra/shared/variables.tf` | Create | `cicd_sp_object_id` input variable |
| `infra/shared/acr.tf` | Create | `azurerm_container_registry` resource |
| `infra/shared/azuread.tf` | Create | SSO App Registration + SP (Path A) or data sources (Path B) |
| `infra/shared/oidc.tf` | Create | `azuread_application_federated_identity_credential` |
| `infra/shared/outputs.tf` | Create | `acr_login_server`, `acr_id`, `sso_client_id`, `sso_sp_object_id` |
| `infra/envs/test/providers.tf` | Create | azurerm provider configuration |
| `infra/envs/test/backend.tf` | Create | azurerm backend (separate state key) |
| `infra/envs/test/variables.tf` | Create | `acr_login_server`, `acr_id`, `sso_client_id`, `cicd_sp_object_id` inputs |
| `infra/envs/test/main.tf` | Create | Resource group + App Service Plan |
| `infra/envs/test/webapps.tf` | Create | Frontend + API `azurerm_linux_web_app` |
| `infra/envs/test/keyvault.tf` | Create | `azurerm_key_vault` (RBAC auth mode) |
| `infra/envs/test/rbac.tf` | Create | 4 `azurerm_role_assignment` resources |
| `infra/envs/test/settings.tf` | Create | App Service application settings for both web apps |
| `infra/envs/test/outputs.tf` | Create | `webapp_frontend_name`, `webapp_api_name`, `kv_name` |
| `.github/workflows/ci-test.yml` | Modify | Add Key Vault secret-population step to `deploy` job |

---

## Pre-Merge Provisioning Sequence

All code is committed on `fg/platform-3` but the infrastructure does not exist yet. Complete the steps below in order before opening the PR. The PR merge triggers CI — if these steps are incomplete, CI will fail.

Commands use **PowerShell** syntax. Replace placeholder values (e.g. `<TFSTATE_RG>`) with the actual values recorded at each step.

---

### Sequence Step 1 — Run bootstrap.sh

bootstrap.sh is a bash script. Run it from WSL or Git Bash (not PowerShell):

```bash
# In WSL or Git Bash:
cd /path/to/app-insights-explorer
bash build-release/scripts/bootstrap.sh
```

When the script finishes, record **all six values** from the output:

```
AZURE_CLIENT_ID             = <SP_APP_ID>
AZURE_TENANT_ID             = <TENANT_ID>
AZURE_SUBSCRIPTION_ID       = <SUBSCRIPTION_ID>
TF_BACKEND_RESOURCE_GROUP   = <TFSTATE_RG>
TF_BACKEND_STORAGE_ACCOUNT  = <TFSTATE_SA>
SP_OBJECT_ID (cicd_sp_object_id) = <SP_OBJECT_ID>
```

---

### Sequence Step 2 — Set GitHub Actions Variables (5)

In GitHub: repo → Settings → Secrets and variables → Actions → **Variables** tab → New repository variable

| Variable name | Value |
|---|---|
| `AZURE_CLIENT_ID` | `<SP_APP_ID>` from bootstrap output |
| `AZURE_TENANT_ID` | `<TENANT_ID>` from bootstrap output |
| `AZURE_SUBSCRIPTION_ID` | `<SUBSCRIPTION_ID>` from bootstrap output |
| `TF_BACKEND_RESOURCE_GROUP` | `<TFSTATE_RG>` from bootstrap output |
| `TF_BACKEND_STORAGE_ACCOUNT` | `<TFSTATE_SA>` from bootstrap output |

> ⚠ **Potential issue — verify this variable name maps correctly in the workflow.**
> `TF_BACKEND_STORAGE_ACCOUNT` refers to the **Azure Storage Account** (e.g. `aietfstate3`), NOT the blob container (`tfstate3`).
> The blob container name is passed as a hardcoded `-backend-config="container_name=tfstate3"` in the workflow `terraform init` step — it is not a GitHub Variable.
> If CI fails on `terraform init` with a backend config error, check that the workflow's `container_name` matches what bootstrap actually created (run `az storage container list --account-name <TFSTATE_SA> --auth-mode login` to verify).

---

### Sequence Step 3 — Init infra/shared/ and validate azuread provider (Task 3)

```powershell
Set-Location infra/shared

terraform init `
  -backend-config="resource_group_name=<TFSTATE_RG>" `
  -backend-config="storage_account_name=<TFSTATE_SA>" `
  -backend-config="container_name=tfstate3" `
  -backend-config="key=shared.tfstate"

terraform validate
```

Run the validation apply to determine Path A vs. Path B:

```powershell
terraform apply `
  -var cicd_sp_object_id=<SP_OBJECT_ID> `
  -target azuread_application.validation `
  -target azuread_service_principal.validation
```

**If apply succeeds → Path A (managed resources):**

```powershell
terraform destroy `
  -var cicd_sp_object_id=<SP_OBJECT_ID> `
  -target azuread_service_principal.validation `
  -target azuread_application.validation

Remove-Item infra/shared/azuread-validation.tf
```

Proceed to Sequence Step 4.

**If apply fails with `Authorization_RequestDenied` → Path B (data sources):**

```powershell
Remove-Item infra/shared/azuread-validation.tf
```

Then create the SSO App Registration manually in the Azure portal before continuing:
1. portal.azure.com → Azure Active Directory → App Registrations → New Registration
2. Name: `app-insights-explorer-sso-tfg`
3. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
4. Redirect URI: Web — `https://app-aie-frontend-test-tfg.azurewebsites.net/api/auth/callback/azure-ad`
5. Record the **Application (client) ID** — this becomes `AZURE_AD_CLIENT_ID`

Then edit `infra/shared/azuread.tf`: delete the two `resource` blocks and uncomment the two `data` blocks at the bottom of the file. Also update `infra/shared/outputs.tf` to reference `data.azuread_application.sso` and `data.azuread_service_principal.sso` instead of `azuread_application.sso` and `azuread_service_principal.sso`. Commit the change.

---

### Sequence Step 4 — Apply infra/shared/

```powershell
# Still in infra/shared/
terraform apply -var cicd_sp_object_id=<SP_OBJECT_ID>
```

After apply, record outputs:

```powershell
terraform output acr_login_server   # e.g. craietesttfg.azurecr.io
terraform output acr_id             # /subscriptions/.../providers/Microsoft.ContainerRegistry/registries/craietesttfg
terraform output sso_client_id      # GUID — this is AZURE_AD_CLIENT_ID
```

---

### Sequence Step 5 — Set ACR_LOGIN_SERVER GitHub Variable

In GitHub → Variables → New repository variable:

| Variable name | Value |
|---|---|
| `ACR_LOGIN_SERVER` | value from `terraform output acr_login_server` (e.g. `craietesttfg.azurecr.io`) |

---

### Sequence Step 6 — Create SSO client secret in Azure portal

portal.azure.com → App Registrations → `app-insights-explorer-sso-tfg` → Certificates & secrets → New client secret
- Description: any label (e.g. `ci`)
- Expires: 24 months
- **Copy the secret value immediately** — it is only shown once. This becomes `AZURE_AD_CLIENT_SECRET`.

---

### Sequence Step 7 — Init and apply infra/envs/test/

```powershell
Set-Location ..\envs\test

terraform init `
  -backend-config="resource_group_name=<TFSTATE_RG>" `
  -backend-config="storage_account_name=<TFSTATE_SA>" `
  -backend-config="container_name=tfstate3" `
  -backend-config="key=test.tfstate"

terraform apply `
  -var acr_login_server=<ACR_LOGIN_SERVER> `
  -var acr_id=<ACR_ID> `
  -var sso_client_id=<SSO_CLIENT_ID> `
  -var cicd_sp_object_id=<SP_OBJECT_ID>
```

After apply, record outputs:

```powershell
terraform output webapp_frontend_name   # app-aie-frontend-test-tfg
terraform output webapp_api_name        # app-aie-api-test-tfg
terraform output kv_name               # kv-aie-test-tfg
```

---

### Sequence Step 8 — Set 3 more GitHub Actions Variables

These are **environment-scoped** variables (not repo-level) because they differ per environment (test, staging, prod).

In GitHub → repo → Settings → Environments → `test` → Environment variables:

| Variable name | Value |
|---|---|
| `WEBAPP_FRONTEND` | `app-aie-frontend-test-tfg` |
| `WEBAPP_API` | `app-aie-api-test-tfg` |
| `KV_NAME` | `kv-aie-test-tfg` |

---

### Sequence Step 9 — Generate NEXTAUTH_SECRET

Run in PowerShell to generate a secure random value:

```powershell
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Copy the output — this is `NEXTAUTH_SECRET`.

---

### Sequence Step 10 — Set GitHub Secrets (5)

In GitHub → repo → Settings → Secrets and variables → Actions → **Secrets** tab → New repository secret

| Secret name | Value |
|---|---|
| `AZURE_AD_CLIENT_ID` | from `terraform output sso_client_id` (or the client ID recorded in Step 3 Path B) |
| `AZURE_AD_CLIENT_SECRET` | client secret value from Step 6 |
| `ANTHROPIC_API_KEY` | your Anthropic API key |
| `BACKEND_API_SECRET` | any strong random string shared between frontend and API |
| `NEXTAUTH_SECRET` | value generated in Step 9 |

---

### Sequence Step 11 — Open PR and merge

Infrastructure is provisioned. Secrets are set. Push the branch if you haven't already, open a PR from `fg/platform-3` into `development`, and merge. The push to `development` triggers `ci-test.yml`. Watch the Actions tab — the pipeline should complete build, push, deploy, Key Vault population, and both smoke tests.

---

### Task 1: Modify bootstrap.sh — idempotency and SP_OBJECT_ID output

**Files:**
- Modify: `build-release/scripts/bootstrap.sh`

The current bootstrap.sh creates every resource unconditionally. Running it a second time would attempt to create resources that already exist. Two fixes are needed: existence checks before each `az` create command, and the `SP_OBJECT_ID` value added to the output block (it is already captured in a variable but not printed — `infra/shared/` needs it as an input variable to attach the OIDC fedcred).

- [ ] **Step 1: Implement**

Replace the full contents of `build-release/scripts/bootstrap.sh` with the following. The structure is identical to the original; only the create operations gain existence checks and the output block gains `SP_OBJECT_ID`.

```bash
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

LOCATION=$(prompt        "LOCATION"           "Azure region"                                      "westus2")
TFSTATE_RG=$(prompt      "TFSTATE_RG"         "Resource group name for Terraform state storage"   "rg-aie-tfstate")
TFSTATE_SA=$(prompt      "TFSTATE_SA"         "Storage account name (globally unique, lowercase)"  "aietfstate$RANDOM")
TFSTATE_CONTAINER=$(prompt "TFSTATE_CONTAINER" "Blob container name"                              "tfstate")
SP_NAME=$(prompt         "SP_NAME"            "Service Principal name"                            "sp-app-insights-explorer-cicd")

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

STORAGE_RESOURCE_ID=$(az storage account show \
  --name "$TFSTATE_SA" \
  --resource-group "$TFSTATE_RG" \
  --query id -o tsv)

# ── CI/CD Service Principal ───────────────────────────────────────────────────
section "CI/CD Service Principal"

EXISTING_APP_ID=$(az ad app list --display-name "$SP_NAME" --query "[0].appId" -o tsv 2>/dev/null || echo "")

if [[ -n "$EXISTING_APP_ID" && "$EXISTING_APP_ID" != "null" ]]; then
  skip "App Registration already exists: $SP_NAME (appId: $EXISTING_APP_ID)"
  SP_APP_ID="$EXISTING_APP_ID"
else
  info "Creating App Registration + Service Principal: $SP_NAME"
  SP_APP_ID=$(az ad app create --display-name "$SP_NAME" --query appId -o tsv)
  az ad sp create --id "$SP_APP_ID" --output none
  success "App Registration + Service Principal created (appId: $SP_APP_ID)"
fi

SP_OBJECT_ID=$(az ad sp show --id "$SP_APP_ID" --query id -o tsv)

# ── Role assignments ──────────────────────────────────────────────────────────
section "Role assignments"

EXISTING_STORAGE_ROLE=$(az role assignment list \
  --assignee "$SP_OBJECT_ID" \
  --role "Storage Blob Data Contributor" \
  --scope "$STORAGE_RESOURCE_ID" \
  --query "[0].id" -o tsv 2>/dev/null || echo "")

if [[ -n "$EXISTING_STORAGE_ROLE" && "$EXISTING_STORAGE_ROLE" != "null" ]]; then
  skip "Storage Blob Data Contributor already assigned"
else
  info "Granting Storage Blob Data Contributor on TF state storage account"
  az role assignment create \
    --assignee-object-id "$SP_OBJECT_ID" \
    --assignee-principal-type ServicePrincipal \
    --role "Storage Blob Data Contributor" \
    --scope "$STORAGE_RESOURCE_ID" \
    --output none
  success "Storage Blob Data Contributor assigned"
fi

EXISTING_SUB_ROLE=$(az role assignment list \
  --assignee "$SP_OBJECT_ID" \
  --role "Contributor" \
  --scope "/subscriptions/$SUBSCRIPTION_ID" \
  --query "[0].id" -o tsv 2>/dev/null || echo "")

if [[ -n "$EXISTING_SUB_ROLE" && "$EXISTING_SUB_ROLE" != "null" ]]; then
  skip "Contributor on subscription already assigned"
else
  info "Granting Contributor on subscription"
  az role assignment create \
    --assignee-object-id "$SP_OBJECT_ID" \
    --assignee-principal-type ServicePrincipal \
    --role "Contributor" \
    --scope "/subscriptions/$SUBSCRIPTION_ID" \
    --output none
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
```

- [ ] **Step 2: Verify**

Run: `bash build-release/scripts/bootstrap.sh` (or on a second run to verify idempotency)

Expected: Re-running the script prints `[SKIP]` for all existing resources and does not error. `SP_OBJECT_ID` is printed in the output section alongside the five GitHub Variables.

- [ ] **Step 3: Commit**

`git commit -m "PLATFORM-3: add idempotency checks and SP_OBJECT_ID output to bootstrap.sh"`

---

### Task 2: Scaffold infra/ directory structure

**Files:**
- Create: `infra/shared/providers.tf`
- Create: `infra/shared/backend.tf`
- Create: `infra/shared/variables.tf`
- Create: `infra/shared/outputs.tf` (empty placeholder — populated in later tasks)
- Create: `infra/envs/test/providers.tf`
- Create: `infra/envs/test/backend.tf`
- Create: `infra/envs/test/variables.tf`
- Create: `infra/envs/test/outputs.tf` (empty placeholder — populated in later tasks)

Both modules declare their provider requirements and remote state backend here. The backend configuration uses partial configuration — the storage account name and resource group are passed via `-backend-config` at `terraform init` time so that the same files work regardless of what the bootstrap named the storage account.

- [ ] **Step 1: Implement**

Create `infra/shared/providers.tf`:

```hcl
terraform {
  required_version = ">= 1.9"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 3.0"
    }
  }
}

provider "azurerm" {
  features {}
}

provider "azuread" {}
```

Create `infra/shared/backend.tf`:

```hcl
# Partial backend configuration — supply storage details at terraform init:
#
#   terraform init \
#     -backend-config="resource_group_name=<TFSTATE_RG>" \
#     -backend-config="storage_account_name=<TFSTATE_SA>" \
#     -backend-config="container_name=tfstate3" \
#     -backend-config="key=shared.tfstate"
#
terraform {
  backend "azurerm" {
    key = "shared.tfstate"
  }
}
```

Create `infra/shared/variables.tf`:

```hcl
variable "cicd_sp_object_id" {
  description = "Object ID of the CI/CD service principal created by bootstrap.sh. Required to attach the OIDC federated credential. Retrieve from bootstrap.sh output (SP_OBJECT_ID)."
  type        = string
}
```

Create `infra/shared/outputs.tf` (empty for now — populated as resources are added):

```hcl
# Outputs are added in subsequent tasks as resources are created.
```

Create `infra/envs/test/providers.tf`:

```hcl
terraform {
  required_version = ">= 1.9"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}

provider "azurerm" {
  features {}
}
```

Create `infra/envs/test/backend.tf`:

```hcl
# Partial backend configuration — supply storage details at terraform init:
#
#   terraform init \
#     -backend-config="resource_group_name=<TFSTATE_RG>" \
#     -backend-config="storage_account_name=<TFSTATE_SA>" \
#     -backend-config="container_name=tfstate3" \
#     -backend-config="key=test.tfstate"
#
terraform {
  backend "azurerm" {
    key = "test.tfstate"
  }
}
```

Create `infra/envs/test/variables.tf`:

```hcl
variable "acr_login_server" {
  description = "Login server URL for the ACR provisioned by infra/shared/. Retrieve from: terraform -chdir=infra/shared output acr_login_server"
  type        = string
}

variable "acr_id" {
  description = "Resource ID of the ACR provisioned by infra/shared/. Retrieve from: terraform -chdir=infra/shared output acr_id"
  type        = string
}

variable "sso_client_id" {
  description = "Application (client) ID of the SSO App Registration provisioned by infra/shared/. Retrieve from: terraform -chdir=infra/shared output sso_client_id"
  type        = string
}

variable "cicd_sp_object_id" {
  description = "Object ID of the CI/CD service principal created by bootstrap.sh. Required to grant Key Vault Secrets Officer so the CI step can write secrets. Retrieve from bootstrap.sh output (SP_OBJECT_ID)."
  type        = string
}
```

Create `infra/envs/test/outputs.tf` (empty for now):

```hcl
# Outputs are added in subsequent tasks as resources are created.
```

- [ ] **Step 2: Verify**

```
cd infra/shared
terraform init \
  -backend-config="resource_group_name=<TFSTATE_RG>" \
  -backend-config="storage_account_name=<TFSTATE_SA>" \
  -backend-config="container_name=tfstate3" \
  -backend-config="key=shared.tfstate"
terraform validate
```

Expected: `Success! The configuration is valid.`

```
cd ../envs/test
terraform init \
  -backend-config="resource_group_name=<TFSTATE_RG>" \
  -backend-config="storage_account_name=<TFSTATE_SA>" \
  -backend-config="container_name=tfstate3" \
  -backend-config="key=test.tfstate"
terraform validate
```

Expected: `Success! The configuration is valid.`

- [ ] **Step 3: Commit**

`git commit -m "PLATFORM-3: scaffold infra/shared/ and infra/envs/test/ directory structure"`

---

### Task 3: infra/shared/ — validate azuread provider on personal tenant

**Files:**
- Create (temporary): `infra/shared/azuread-validation.tf`

This is the blocking validation step from the spec. Personal Microsoft accounts share the `consumers` tenant and may lack the `microsoft.directory/applications/create` permission required by managed `azuread_application` resources. The expected failure mode is `Authorization_RequestDenied`. This task determines whether to proceed with **Path A** (managed resources) or **Path B** (data sources) for Task 5.

- [ ] **Step 1: Implement validation file**

Create `infra/shared/azuread-validation.tf`:

```hcl
# TEMPORARY — delete this file after validation. See Task 3 in the plan.
resource "azuread_application" "validation" {
  display_name = "aie-tfg-azuread-validation"
}

resource "azuread_service_principal" "validation" {
  client_id = azuread_application.validation.client_id
}
```

- [ ] **Step 2: Run validation apply**

```
cd infra/shared
terraform apply -var cicd_sp_object_id=<SP_OBJECT_ID_FROM_BOOTSTRAP> -target azuread_application.validation -target azuread_service_principal.validation
```

**If `terraform apply` succeeds:**

The `azuread` provider works on this tenant. This is **Path A — managed resources**.

Clean up the validation resources immediately:
```
terraform destroy -var cicd_sp_object_id=<SP_OBJECT_ID_FROM_BOOTSTRAP> -target azuread_service_principal.validation -target azuread_application.validation
```

Delete the temporary file:
```
rm infra/shared/azuread-validation.tf
```

Proceed to Task 4. Task 5 will use managed `azuread_application` and `azuread_service_principal` resources.

**If `terraform apply` fails with `Authorization_RequestDenied`:**

The `azuread` provider cannot create managed App Registration resources on this tenant. This is **Path B — data sources**.

Delete the temporary file without running destroy (no resources were created):
```
rm infra/shared/azuread-validation.tf
```

Before Task 5, create the SSO App Registration manually in the Azure portal:
1. Navigate to portal.azure.com → Azure Active Directory → App Registrations → New Registration
2. Name: `app-insights-explorer-sso-tfg`
3. Supported account types: Accounts in any organizational directory and personal Microsoft accounts
4. Redirect URI: Web — `https://app-aie-frontend-test-tfg.azurewebsites.net/api/auth/callback/azure-ad`
5. Record the **Application (client) ID** — needed for bootstrap and GitHub Secrets
6. After registration, create a client secret (Certificates & secrets → New client secret, 24 months) — record the value immediately

Proceed to Task 4. Task 5 will use `data "azuread_application"` and `data "azuread_service_principal"` instead of managed resources.

- [ ] **Step 3: Commit**

`git commit -m "PLATFORM-3: document azuread validation result (Path A or Path B)"`

---

### Task 4: infra/shared/ — ACR

**Files:**
- Create: `infra/shared/acr.tf`
- Modify: `infra/shared/outputs.tf`

ACR (`craietesttfg`) is the container image registry shared across environments. Both the frontend and API Docker images are pushed here by the CI pipeline and pulled from here by the App Service web apps. ACR names are alphanumeric only (no hyphens) and globally unique.

- [ ] **Step 1: Implement**

Create `infra/shared/acr.tf`:

```hcl
resource "azurerm_container_registry" "main" {
  name                = "craietesttfg"
  resource_group_name = "rg-aie-tfstate"
  location            = "westus2"
  sku                 = "Basic"
  admin_enabled       = false
}
```

> **Note on resource group:** ACR is placed in the existing TF state resource group (`rg-aie-tfstate`) created by bootstrap.sh. A dedicated shared resource group is future scope. This keeps `infra/shared/` from needing to create a resource group of its own while keeping the ACR lifecycle decoupled from the test environment resource group.

Replace `infra/shared/outputs.tf` with:

```hcl
output "acr_login_server" {
  description = "ACR login server URL — set as GitHub Actions Variable ACR_LOGIN_SERVER after apply."
  value       = azurerm_container_registry.main.login_server
}

output "acr_id" {
  description = "ACR resource ID — pass as var.acr_id to infra/envs/test/."
  value       = azurerm_container_registry.main.id
}
```

- [ ] **Step 2: Verify**

```
cd infra/shared
terraform plan -var cicd_sp_object_id=<SP_OBJECT_ID>
```

Expected: Plan shows `+ azurerm_container_registry.main` to be created. No errors.

```
terraform apply -var cicd_sp_object_id=<SP_OBJECT_ID>
```

Expected: `Apply complete! Resources: 1 added, 0 changed, 0 destroyed.`

```
terraform output acr_login_server
```

Expected: prints `craietesttfg.azurecr.io`

Verify in Azure:
```
az acr show --name craietesttfg --query "{name:name, loginServer:loginServer, sku:sku.name}" -o table
```

Expected: row showing `craietesttfg`, `craietesttfg.azurecr.io`, `Basic`.

- [ ] **Step 3: Commit**

`git commit -m "PLATFORM-3: add ACR to infra/shared/"`

---

### Task 5: infra/shared/ — SSO App Registration

**Files:**
- Create: `infra/shared/azuread.tf`
- Modify: `infra/shared/outputs.tf`

The SSO App Registration (`app-insights-explorer-sso-tfg`) is used by NextAuth.js for Microsoft OAuth login. Follow the path determined in Task 3.

**Path A — managed resources** (azuread validation succeeded):

- [ ] **Step 1 (Path A): Implement**

Create `infra/shared/azuread.tf`:

```hcl
# SSO App Registration — used by NextAuth.js for Microsoft OAuth login.
# lifecycle.ignore_changes is required on required_resource_access and optional_claims:
# Terraform cannot replicate admin consent grants. Without ignore_changes, each
# subsequent apply would strip portal-applied consent, silently breaking the OAuth flow.
resource "azuread_application" "sso" {
  display_name     = "app-insights-explorer-sso-tfg"
  sign_in_audience = "AzureADandPersonalMicrosoftAccount"

  web {
    redirect_uris = [
      "https://app-aie-frontend-test-tfg.azurewebsites.net/api/auth/callback/azure-ad",
    ]
  }

  lifecycle {
    ignore_changes = [
      required_resource_access,
      optional_claims,
    ]
  }
}

resource "azuread_service_principal" "sso" {
  client_id = azuread_application.sso.client_id
}
```

Append to `infra/shared/outputs.tf`:

```hcl
output "sso_client_id" {
  description = "SSO App Registration client ID — set as GitHub Secret AZURE_AD_CLIENT_ID and pass as var.sso_client_id to infra/envs/test/."
  value       = azuread_application.sso.client_id
}

output "sso_sp_object_id" {
  description = "SSO Service Principal object ID."
  value       = azuread_service_principal.sso.object_id
}
```

**Path B — data sources** (azuread validation failed; App Registration created manually in Task 3):

- [ ] **Step 1 (Path B): Implement**

Create `infra/shared/azuread.tf`:

```hcl
# SSO App Registration — created manually in Azure portal during bootstrap
# (azuread managed resources not supported on this tenant).
# Referenced here via data sources so downstream outputs remain consistent.
data "azuread_application" "sso" {
  display_name = "app-insights-explorer-sso-tfg"
}

data "azuread_service_principal" "sso" {
  client_id = data.azuread_application.sso.client_id
}
```

Append to `infra/shared/outputs.tf`:

```hcl
output "sso_client_id" {
  description = "SSO App Registration client ID — set as GitHub Secret AZURE_AD_CLIENT_ID and pass as var.sso_client_id to infra/envs/test/."
  value       = data.azuread_application.sso.client_id
}

output "sso_sp_object_id" {
  description = "SSO Service Principal object ID."
  value       = data.azuread_service_principal.sso.object_id
}
```

- [ ] **Step 2: Verify**

```
cd infra/shared
terraform plan -var cicd_sp_object_id=<SP_OBJECT_ID>
```

Expected (Path A): Plan shows `+ azuread_application.sso` and `+ azuread_service_principal.sso`.
Expected (Path B): Plan shows data sources only (no resources to create).

```
terraform apply -var cicd_sp_object_id=<SP_OBJECT_ID>
```

```
terraform output sso_client_id
```

Expected: prints the SSO App Registration client ID (GUID).

- [ ] **Step 3: Commit**

`git commit -m "PLATFORM-3: add SSO App Registration to infra/shared/ (Path A or Path B)"`

---

### Task 6: infra/shared/ — OIDC federated credential

**Files:**
- Create: `infra/shared/oidc.tf`

The OIDC federated credential is attached to the CI/CD service principal created by bootstrap.sh. It enables GitHub Actions to authenticate to Azure using a short-lived OIDC token scoped to the `development` branch — no stored Azure credentials required in GitHub. The CI/CD SP object ID is passed in as an input variable (`var.cicd_sp_object_id`).

The `azuread_application_federated_identity_credential` resource requires the **application object ID** (not the SP object ID). The CI/CD SP was created with `az ad app create` + `az ad sp create` in bootstrap.sh, so its App Registration exists. We look up the application object ID via a data source.

- [ ] **Step 1: Implement**

Create `infra/shared/oidc.tf`:

```hcl
# Look up the CI/CD App Registration by its SP object ID.
# The SP object ID comes from bootstrap.sh output (SP_OBJECT_ID).
data "azuread_service_principal" "cicd" {
  object_id = var.cicd_sp_object_id
}

# Look up the backing App Registration for the CI/CD SP.
data "azuread_application" "cicd" {
  client_id = data.azuread_service_principal.cicd.client_id
}

# OIDC federated credential — scoped to the development branch.
# Enables GitHub Actions to authenticate to Azure without stored credentials.
resource "azuread_application_federated_identity_credential" "cicd_development" {
  application_id = data.azuread_application.cicd.id
  display_name   = "github-development"
  description    = "GitHub Actions OIDC credential for the development branch."
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:frankendoodle/app-insights-explorer:ref:refs/heads/development"
}
```

- [ ] **Step 2: Verify**

```
cd infra/shared
terraform plan -var cicd_sp_object_id=<SP_OBJECT_ID>
```

Expected: Plan shows `+ azuread_application_federated_identity_credential.cicd_development`.

```
terraform apply -var cicd_sp_object_id=<SP_OBJECT_ID>
```

Expected: `Apply complete! Resources: 1 added, 0 changed, 0 destroyed.`

Verify in Azure portal: App Registrations → `sp-app-insights-explorer-cicd` → Certificates & secrets → Federated credentials. Should show one credential named `github-development` with subject `repo:frankendoodle/app-insights-explorer:ref:refs/heads/development`.

- [ ] **Step 3: Post-apply — update GitHub Actions Variables**

After `infra/shared/` is fully applied, retrieve outputs and update the GitHub repository variables:

```
terraform output acr_login_server
```

In GitHub → Settings → Secrets and variables → Actions → Variables:
- Set `ACR_LOGIN_SERVER` = value from `terraform output acr_login_server` (e.g. `craietesttfg.azurecr.io`)

Also record `terraform output sso_client_id` — this value is needed as `var.sso_client_id` for `infra/envs/test/` and as the `AZURE_AD_CLIENT_ID` GitHub Secret used by the CI secret-population step.

- [ ] **Step 4: Commit**

`git commit -m "PLATFORM-3: add OIDC federated credential to infra/shared/"`

---

### Task 7: infra/envs/test/ — Resource group and App Service Plan

**Files:**
- Create: `infra/envs/test/main.tf`

The resource group (`rg-app-insights-explorer-test-tfg`) contains all test environment resources: the App Service Plan, both web apps, and the Key Vault. The App Service Plan uses the B1 SKU — F1 (free tier) does not support Linux Docker containers.

- [ ] **Step 1: Implement**

Create `infra/envs/test/main.tf`:

```hcl
resource "azurerm_resource_group" "test" {
  name     = "rg-app-insights-explorer-test-tfg"
  location = "westus2"
}

resource "azurerm_service_plan" "test" {
  name                = "asp-app-insights-explorer-test-tfg"
  resource_group_name = azurerm_resource_group.test.name
  location            = azurerm_resource_group.test.location
  os_type             = "Linux"
  sku_name            = "B1"
}
```

- [ ] **Step 2: Verify**

```
cd infra/envs/test
terraform init \
  -backend-config="resource_group_name=<TFSTATE_RG>" \
  -backend-config="storage_account_name=<TFSTATE_SA>" \
  -backend-config="container_name=tfstate3" \
  -backend-config="key=test.tfstate"

terraform plan \
  -var acr_login_server=<ACR_LOGIN_SERVER> \
  -var acr_id=<ACR_ID> \
  -var sso_client_id=<SSO_CLIENT_ID> \
  -var cicd_sp_object_id=<SP_OBJECT_ID>
```

Expected: Plan shows `+ azurerm_resource_group.test` and `+ azurerm_service_plan.test`.

```
terraform apply \
  -var acr_login_server=<ACR_LOGIN_SERVER> \
  -var acr_id=<ACR_ID> \
  -var sso_client_id=<SSO_CLIENT_ID> \
  -var cicd_sp_object_id=<SP_OBJECT_ID>
```

Expected: `Apply complete! Resources: 2 added, 0 changed, 0 destroyed.`

```
az group show --name rg-app-insights-explorer-test-tfg --query "{name:name,location:location}" -o table
```

Expected: row showing `rg-app-insights-explorer-test-tfg`, `westus2`.

- [ ] **Step 3: Commit**

`git commit -m "PLATFORM-3: add resource group and App Service Plan to infra/envs/test/"`

---

### Task 8: infra/envs/test/ — Frontend web app

**Files:**
- Create: `infra/envs/test/webapps.tf` (frontend section)

The frontend web app (`app-aie-frontend-test-tfg`) runs the Next.js Docker container. It has a system-assigned managed identity (for credential-free ACR pull and Key Vault access) and is configured to pull its image from ACR. App settings and Key Vault references are added in Task 11.

- [ ] **Step 1: Implement**

Create `infra/envs/test/webapps.tf`:

```hcl
resource "azurerm_linux_web_app" "frontend" {
  name                = "app-aie-frontend-test-tfg"
  resource_group_name = azurerm_resource_group.test.name
  location            = azurerm_resource_group.test.location
  service_plan_id     = azurerm_service_plan.test.id

  identity {
    type = "SystemAssigned"
  }

  site_config {
    always_on = false

    application_stack {
      docker_image_name        = "app-insights-explorer-frontend:latest"
      docker_registry_url      = "https://${var.acr_login_server}"
    }
  }

  app_settings = {
    # Settings added in Task 11
  }

  lifecycle {
    ignore_changes = [
      app_settings,
    ]
  }
}
```

- [ ] **Step 2: Verify**

```
cd infra/envs/test
terraform plan \
  -var acr_login_server=<ACR_LOGIN_SERVER> \
  -var acr_id=<ACR_ID> \
  -var sso_client_id=<SSO_CLIENT_ID> \
  -var cicd_sp_object_id=<SP_OBJECT_ID>
```

Expected: Plan shows `+ azurerm_linux_web_app.frontend`.

```
terraform apply \
  -var acr_login_server=<ACR_LOGIN_SERVER> \
  -var acr_id=<ACR_ID> \
  -var sso_client_id=<SSO_CLIENT_ID> \
  -var cicd_sp_object_id=<SP_OBJECT_ID>
```

Expected: `Apply complete! Resources: 1 added, 0 changed, 0 destroyed.`

```
az webapp show \
  --name app-aie-frontend-test-tfg \
  --resource-group rg-app-insights-explorer-test-tfg \
  --query "{name:name,state:state,identityType:identity.type}" -o table
```

Expected: `app-aie-frontend-test-tfg`, `Running`, `SystemAssigned`.

- [ ] **Step 3: Commit**

`git commit -m "PLATFORM-3: add frontend web app to infra/envs/test/"`

---

### Task 9: infra/envs/test/ — API web app

**Files:**
- Modify: `infra/envs/test/webapps.tf` (add API section)

The API web app (`app-aie-api-test-tfg`) runs the NestJS Docker container. Same pattern as the frontend — system-assigned managed identity, ACR pull. App settings added in Task 11.

- [ ] **Step 1: Implement**

Append to `infra/envs/test/webapps.tf`:

```hcl
resource "azurerm_linux_web_app" "api" {
  name                = "app-aie-api-test-tfg"
  resource_group_name = azurerm_resource_group.test.name
  location            = azurerm_resource_group.test.location
  service_plan_id     = azurerm_service_plan.test.id

  identity {
    type = "SystemAssigned"
  }

  site_config {
    always_on = false

    application_stack {
      docker_image_name        = "app-insights-explorer-api:latest"
      docker_registry_url      = "https://${var.acr_login_server}"
    }
  }

  app_settings = {
    # Settings added in Task 11
  }

  lifecycle {
    ignore_changes = [
      app_settings,
    ]
  }
}
```

- [ ] **Step 2: Verify**

```
cd infra/envs/test
terraform apply \
  -var acr_login_server=<ACR_LOGIN_SERVER> \
  -var acr_id=<ACR_ID> \
  -var sso_client_id=<SSO_CLIENT_ID> \
  -var cicd_sp_object_id=<SP_OBJECT_ID>
```

Expected: `Apply complete! Resources: 1 added, 0 changed, 0 destroyed.`

```
az webapp show \
  --name app-aie-api-test-tfg \
  --resource-group rg-app-insights-explorer-test-tfg \
  --query "{name:name,state:state,identityType:identity.type}" -o table
```

Expected: `app-aie-api-test-tfg`, `Running`, `SystemAssigned`.

- [ ] **Step 3: Commit**

`git commit -m "PLATFORM-3: add API web app to infra/envs/test/"`

---

### Task 10: infra/envs/test/ — Key Vault

**Files:**
- Create: `infra/envs/test/keyvault.tf`
- Modify: `infra/envs/test/outputs.tf`

Key Vault (`kv-aie-test-tfg`) stores the five application secrets. RBAC authorization mode is used — the managed identities are granted Key Vault Secrets User via role assignments (Task 11) rather than via access policies. Terraform itself needs Key Vault Administrator to write secrets via the CI step; that role is granted to the CI/CD SP by the Contributor subscription-level role assigned in bootstrap.sh.

Key Vault names have a 24-character limit. `kv-aie-test-tfg` is 15 characters.

- [ ] **Step 1: Implement**

Create `infra/envs/test/keyvault.tf`:

```hcl
data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "test" {
  name                        = "kv-aie-test-tfg"
  resource_group_name         = azurerm_resource_group.test.name
  location                    = azurerm_resource_group.test.location
  tenant_id                   = data.azurerm_client_config.current.tenant_id
  sku_name                    = "standard"
  enable_rbac_authorization   = true
  soft_delete_retention_days  = 7
  purge_protection_enabled    = false
}
```

Replace `infra/envs/test/outputs.tf` with:

```hcl
output "webapp_frontend_name" {
  description = "Frontend web app name — set as GitHub Actions Variable WEBAPP_FRONTEND after apply."
  value       = azurerm_linux_web_app.frontend.name
}

output "webapp_api_name" {
  description = "API web app name — set as GitHub Actions Variable WEBAPP_API after apply."
  value       = azurerm_linux_web_app.api.name
}

output "kv_name" {
  description = "Key Vault name — used by the CI secret-population step."
  value       = azurerm_key_vault.test.name
}

output "kv_uri" {
  description = "Key Vault URI — used to construct Key Vault reference strings in App Service settings."
  value       = azurerm_key_vault.test.vault_uri
}
```

- [ ] **Step 2: Verify**

```
cd infra/envs/test
terraform apply \
  -var acr_login_server=<ACR_LOGIN_SERVER> \
  -var acr_id=<ACR_ID> \
  -var sso_client_id=<SSO_CLIENT_ID> \
  -var cicd_sp_object_id=<SP_OBJECT_ID>
```

Expected: `Apply complete! Resources: 1 added, 0 changed, 0 destroyed.`

```
az keyvault show \
  --name kv-aie-test-tfg \
  --query "{name:name,enableRbacAuthorization:properties.enableRbacAuthorization,sku:properties.sku.name}" -o table
```

Expected: `kv-aie-test-tfg`, `true`, `standard`.

- [ ] **Step 3: Commit**

`git commit -m "PLATFORM-3: add Key Vault to infra/envs/test/"`

---

### Task 11: infra/envs/test/ — RBAC role assignments and App Service settings

**Files:**
- Create: `infra/envs/test/rbac.tf`
- Create: `infra/envs/test/settings.tf`
- Modify: `infra/envs/test/webapps.tf` (remove `lifecycle.ignore_changes` on `app_settings` and replace placeholder `app_settings` block with real values)

Five role assignments enable credential-free access and CI secret writes:
- `AcrPull` on ACR for each web app's managed identity (enables Docker image pull at deploy time)
- `Key Vault Secrets User` on Key Vault for each web app's managed identity (enables Key Vault reference resolution at startup)
- `Key Vault Secrets Officer` on Key Vault for the CI/CD service principal (enables `az keyvault secret set` in the CI secret-population step — `Contributor` on the subscription does not grant Key Vault data plane write access when RBAC authorization mode is enabled)

App Service settings use Key Vault reference strings (`@Microsoft.KeyVault(...)`) for all five secrets. The `SecretUri` format without version pin is used so Key Vault reference resolution always reads the current secret version.

- [ ] **Step 1: Implement RBAC**

Create `infra/envs/test/rbac.tf`:

```hcl
# AcrPull — frontend managed identity → ACR
resource "azurerm_role_assignment" "frontend_acr_pull" {
  scope                = var.acr_id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_linux_web_app.frontend.identity[0].principal_id
}

# AcrPull — API managed identity → ACR
resource "azurerm_role_assignment" "api_acr_pull" {
  scope                = var.acr_id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_linux_web_app.api.identity[0].principal_id
}

# Key Vault Secrets User — frontend managed identity → Key Vault
resource "azurerm_role_assignment" "frontend_kv_secrets_user" {
  scope                = azurerm_key_vault.test.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_linux_web_app.frontend.identity[0].principal_id
}

# Key Vault Secrets User — API managed identity → Key Vault
resource "azurerm_role_assignment" "api_kv_secrets_user" {
  scope                = azurerm_key_vault.test.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_linux_web_app.api.identity[0].principal_id
}

# Key Vault Secrets Officer — CI/CD service principal → Key Vault
# The CI step (az keyvault secret set) runs as the CI/CD SP. Key Vault RBAC
# authorization mode does not grant data plane access via Contributor — a
# Secrets Officer assignment is required separately.
resource "azurerm_role_assignment" "cicd_kv_secrets_officer" {
  scope                = azurerm_key_vault.test.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = var.cicd_sp_object_id
}
```

- [ ] **Step 2: Implement App Service settings**

Create `infra/envs/test/settings.tf`:

```hcl
locals {
  kv_uri = azurerm_key_vault.test.vault_uri

  # Key Vault reference string helper — no version pin so references always
  # resolve to the current secret version without requiring a re-apply.
  kv_ref = {
    app_reg_client_id     = "@Microsoft.KeyVault(SecretUri=${local.kv_uri}secrets/AppRegistrationClientId/)"
    app_reg_client_secret = "@Microsoft.KeyVault(SecretUri=${local.kv_uri}secrets/AppRegistrationClientSecret/)"
    anthropic_api_key     = "@Microsoft.KeyVault(SecretUri=${local.kv_uri}secrets/AnthropicApiKey/)"
    backend_api_secret    = "@Microsoft.KeyVault(SecretUri=${local.kv_uri}secrets/BackendApiSecret/)"
    nextauth_secret       = "@Microsoft.KeyVault(SecretUri=${local.kv_uri}secrets/NextAuthSecret/)"
  }
}
```

Now replace the `app_settings` blocks and remove `lifecycle.ignore_changes` from both web apps in `infra/envs/test/webapps.tf`. The full updated file:

```hcl
resource "azurerm_linux_web_app" "frontend" {
  name                = "app-aie-frontend-test-tfg"
  resource_group_name = azurerm_resource_group.test.name
  location            = azurerm_resource_group.test.location
  service_plan_id     = azurerm_service_plan.test.id

  identity {
    type = "SystemAssigned"
  }

  site_config {
    always_on = false

    application_stack {
      docker_image_name = "app-insights-explorer-frontend:latest"
      docker_registry_url = "https://${var.acr_login_server}"
    }
  }

  app_settings = {
    # Key Vault references — resolved at startup via managed identity
    "AppRegistrationClientId"     = local.kv_ref.app_reg_client_id
    "AppRegistrationClientSecret" = local.kv_ref.app_reg_client_secret
    "BackendApiSecret"            = local.kv_ref.backend_api_secret
    "NextAuthSecret"              = local.kv_ref.nextauth_secret

    # Plain text — not sensitive, environment-specific
    "AppRegistrationTenantId" = "consumers"
    "NEXTAUTH_URL"            = "https://app-aie-frontend-test-tfg.azurewebsites.net"
    "NEXT_PUBLIC_API_URL"     = "https://app-aie-api-test-tfg.azurewebsites.net"
  }
}

resource "azurerm_linux_web_app" "api" {
  name                = "app-aie-api-test-tfg"
  resource_group_name = azurerm_resource_group.test.name
  location            = azurerm_resource_group.test.location
  service_plan_id     = azurerm_service_plan.test.id

  identity {
    type = "SystemAssigned"
  }

  site_config {
    always_on = false

    application_stack {
      docker_image_name = "app-insights-explorer-api:latest"
      docker_registry_url = "https://${var.acr_login_server}"
    }
  }

  app_settings = {
    # Key Vault references — resolved at startup via managed identity
    "AnthropicApiKey"  = local.kv_ref.anthropic_api_key
    "BackendApiSecret" = local.kv_ref.backend_api_secret

    # Plain text — not sensitive, environment-specific
    "AppRegistrationTenantId" = "consumers"
    "FRONTEND_ORIGIN"         = "https://app-aie-frontend-test-tfg.azurewebsites.net"
  }
}
```

- [ ] **Step 3: Verify**

```
cd infra/envs/test
terraform plan \
  -var acr_login_server=<ACR_LOGIN_SERVER> \
  -var acr_id=<ACR_ID> \
  -var sso_client_id=<SSO_CLIENT_ID>
```

Expected: Plan shows 5 role assignments to create and 2 web app updates (app_settings populated).

```
terraform apply \
  -var acr_login_server=<ACR_LOGIN_SERVER> \
  -var acr_id=<ACR_ID> \
  -var sso_client_id=<SSO_CLIENT_ID> \
  -var cicd_sp_object_id=<SP_OBJECT_ID>
```

Expected: `Apply complete! Resources: 5 added, 2 changed, 0 destroyed.`

Verify role assignments:
```
az role assignment list \
  --scope $(az keyvault show --name kv-aie-test-tfg --query id -o tsv) \
  --query "[].{principal:principalName,role:roleDefinitionName}" -o table
```

Expected: Two rows showing `Key Vault Secrets User` for the frontend and API managed identities.

- [ ] **Step 4: Post-apply — update GitHub Actions Variables**

After `infra/envs/test/` is fully applied, update GitHub Actions Variables:
```
terraform output webapp_frontend_name   # → app-aie-frontend-test-tfg
terraform output webapp_api_name        # → app-aie-api-test-tfg
```

In GitHub → Settings → Secrets and variables → Actions → Variables:
- Set `WEBAPP_FRONTEND` = `app-aie-frontend-test-tfg`
- Set `WEBAPP_API` = `app-aie-api-test-tfg`

Also add a new variable (used by the secret-population step in Task 12):
- Set `KV_NAME` = `kv-aie-test-tfg`

- [ ] **Step 5: Commit**

`git commit -m "PLATFORM-3: add RBAC role assignments and App Service settings to infra/envs/test/"`

---

### Task 12: Extend ci-test.yml — Key Vault secret-population step

**Files:**
- Modify: `.github/workflows/ci-test.yml`

This step writes all five application secret values from GitHub Secrets directly to Key Vault via `az keyvault secret set`. It runs in the `deploy` job after both web apps have been deployed and is the only mechanism by which secret values enter Key Vault — Terraform never touches them. The step uses the same OIDC Azure login that the rest of the deploy job uses.

After secrets are written, a stop/start is issued on both App Services to force fresh Key Vault reference resolution. App Services cache Key Vault references and require a stop/start (not just a restart) to pick up newly populated secrets. This behavior was observed in the PLATFORM-29 lessons learned.

- [ ] **Step 1: Implement**

The current `deploy` job in `.github/workflows/ci-test.yml` ends after the two smoke test steps. Add the following step block immediately after the `Deploy API to App Service` step and before the `Wait for App Services to start` step. Then add two additional stop/start steps at the end of the job.

The full updated `.github/workflows/ci-test.yml`:

```yaml
name: CI — Build, Push, Deploy to TEST
on:
  push:
    branches:
      - development

permissions:
  id-token: write
  contents: read

env:
  IMAGE_FRONTEND: app-insights-explorer-frontend
  IMAGE_API: app-insights-explorer-api

jobs:
  build-and-push:
    name: Build and push Docker images
    runs-on: ubuntu-latest
    environment: test
    outputs:
      short_sha: ${{ steps.sha.outputs.short_sha }}
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Get short git SHA
        id: sha
        run: echo "short_sha=$(git rev-parse --short HEAD)" >> $GITHUB_OUTPUT

      - name: Log in to Azure via OIDC
        uses: azure/login@v2
        with:
          client-id: ${{ vars.AZURE_CLIENT_ID }}
          tenant-id: ${{ vars.AZURE_TENANT_ID }}
          subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}

      - name: Log in to ACR
        run: az acr login --name $(echo "${{ vars.ACR_LOGIN_SERVER }}" | cut -d'.' -f1)

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push frontend image
        uses: docker/build-push-action@v5
        with:
          context: ./frontend
          file: ./frontend/Dockerfile
          push: true
          tags: |
            ${{ vars.ACR_LOGIN_SERVER }}/${{ env.IMAGE_FRONTEND }}:latest
            ${{ vars.ACR_LOGIN_SERVER }}/${{ env.IMAGE_FRONTEND }}:${{ steps.sha.outputs.short_sha }}
          build-args: |
            NEXT_PUBLIC_API_URL=https://${{ vars.WEBAPP_API }}.azurewebsites.net
            NEXT_PUBLIC_BACKEND_API_SECRET=${{ secrets.BACKEND_API_SECRET }}

      - name: Build and push API image
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          file: ./backend/Dockerfile
          push: true
          tags: |
            ${{ vars.ACR_LOGIN_SERVER }}/${{ env.IMAGE_API }}:latest
            ${{ vars.ACR_LOGIN_SERVER }}/${{ env.IMAGE_API }}:${{ steps.sha.outputs.short_sha }}

  deploy:
    name: Deploy to TEST
    runs-on: ubuntu-latest
    needs: build-and-push
    environment: test
    steps:
      - name: Log in to Azure via OIDC
        uses: azure/login@v2
        with:
          client-id: ${{ vars.AZURE_CLIENT_ID }}
          tenant-id: ${{ vars.AZURE_TENANT_ID }}
          subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}

      - name: Deploy frontend to App Service
        uses: azure/webapps-deploy@v3
        with:
          app-name: ${{ vars.WEBAPP_FRONTEND }}
          images: ${{ vars.ACR_LOGIN_SERVER }}/${{ env.IMAGE_FRONTEND }}:${{ needs.build-and-push.outputs.short_sha }}

      - name: Deploy API to App Service
        uses: azure/webapps-deploy@v3
        with:
          app-name: ${{ vars.WEBAPP_API }}
          images: ${{ vars.ACR_LOGIN_SERVER }}/${{ env.IMAGE_API }}:${{ needs.build-and-push.outputs.short_sha }}

      - name: Populate Key Vault secrets from GitHub Secrets
        run: |
          az keyvault secret set --vault-name "${{ vars.KV_NAME }}" --name "AppRegistrationClientId"     --value "${{ secrets.AZURE_AD_CLIENT_ID }}"      --output none
          az keyvault secret set --vault-name "${{ vars.KV_NAME }}" --name "AppRegistrationClientSecret" --value "${{ secrets.AZURE_AD_CLIENT_SECRET }}"   --output none
          az keyvault secret set --vault-name "${{ vars.KV_NAME }}" --name "AnthropicApiKey"             --value "${{ secrets.ANTHROPIC_API_KEY }}"         --output none
          az keyvault secret set --vault-name "${{ vars.KV_NAME }}" --name "BackendApiSecret"            --value "${{ secrets.BACKEND_API_SECRET }}"        --output none
          az keyvault secret set --vault-name "${{ vars.KV_NAME }}" --name "NextAuthSecret"              --value "${{ secrets.NEXTAUTH_SECRET }}"           --output none

      - name: Stop App Services to force Key Vault reference refresh
        run: |
          az webapp stop --name "${{ vars.WEBAPP_FRONTEND }}" --resource-group rg-app-insights-explorer-test-tfg
          az webapp stop --name "${{ vars.WEBAPP_API }}"      --resource-group rg-app-insights-explorer-test-tfg

      - name: Start App Services
        run: |
          az webapp start --name "${{ vars.WEBAPP_FRONTEND }}" --resource-group rg-app-insights-explorer-test-tfg
          az webapp start --name "${{ vars.WEBAPP_API }}"      --resource-group rg-app-insights-explorer-test-tfg

      - name: Wait for App Services to start
        run: sleep 60

      - name: Smoke test — API health check
        run: |
          curl --fail \
               --retry 5 \
               --retry-delay 15 \
               --retry-connrefused \
               --retry-all-errors \
               https://${{ vars.WEBAPP_API }}.azurewebsites.net/health

      - name: Smoke test — frontend liveness check
        run: |
          status=$(curl --silent --output /dev/null --write-out "%{http_code}" \
                        --retry 5 \
                        --retry-delay 15 \
                        --retry-connrefused \
                        --retry-all-errors \
                        https://${{ vars.WEBAPP_FRONTEND }}.azurewebsites.net) || exit 1
          if [ "$status" -ge 500 ]; then
            echo "Frontend returned HTTP $status — smoke test failed"
            exit 1
          fi
          echo "Frontend returned HTTP $status — smoke test passed"
```

Before the pipeline can pass, the following GitHub Secrets must be set (repo → Settings → Secrets and variables → Actions → Secrets):
- `AZURE_AD_CLIENT_ID` — SSO App Registration client ID (from `terraform output sso_client_id`)
- `AZURE_AD_CLIENT_SECRET` — SSO App Registration client secret (created manually in Azure portal)
- `ANTHROPIC_API_KEY` — Anthropic API key
- `BACKEND_API_SECRET` — shared secret between frontend and API
- `NEXTAUTH_SECRET` — NextAuth.js encryption key (generate with: `openssl rand -base64 32`)

- [ ] **Step 2: Verify**

Push a commit to the `development` branch to trigger the CI workflow. The pipeline must complete all jobs — build-and-push, deploy (including the Key Vault population and stop/start steps), and both smoke tests.

Expected: All jobs green. The Key Vault population step should show five `az keyvault secret set` commands completing with no error output.

Verify Key Vault secrets are present:
```
az keyvault secret list --vault-name kv-aie-test-tfg --query "[].name" -o table
```

Expected: five secret names listed — `AppRegistrationClientId`, `AppRegistrationClientSecret`, `AnthropicApiKey`, `BackendApiSecret`, `NextAuthSecret`.

- [ ] **Step 3: Commit**

`git commit -m "PLATFORM-3: add Key Vault secret-population and App Service stop/start steps to ci-test.yml"`

---

### Final: Close-out

This plan is not complete until the close-out protocol in `manifest.md` has been followed. Do not mark this plan as complete without completing close-out.
