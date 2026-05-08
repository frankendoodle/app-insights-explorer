---
title: "Terraform Module Extraction and Environment Roots — Implementation Plan"
ticket: PLATFORM-456
implement_subtask: PLATFORM-458
slug: terraform-module-extract
spec: specs/terraform-module-extract-spec-2026-05-08.md
date: 2026-05-08
tags: [ai/generated, jira/plan]
status: approved
---

# Terraform Module Extraction and Environment Roots — Implementation Plan

Implements spec `terraform-module-extract` (PLATFORM-456). Extracts all env-specific Terraform
resources from `infra/envs/test/` into `infra/modules/app-environment/`, refactors the test env
root as a thin module caller, and creates staging and production env roots. Extends `bootstrap.sh`
to provision the required tfstate containers for the new environments.

**Verification strategy:** CI-verified. The `pr.yml` pipeline runs `terraform plan` automatically
on every PR and posts the output as a comment. The merge gate is a plan comment showing
`Plan: 0 to add, 0 to change, 0 to destroy`. The Terraform state migration (Task 7) is a
developer-run prerequisite that must complete before the PR is opened.

> **Developer steps** are tasks that must be executed by a human on their local machine. They
> require Azure CLI authentication and access to the remote Terraform backend. They cannot be
> run by an agent. Each such task is prefixed with `[DEVELOPER STEP]`.

---

## Task 1 — Create `infra/modules/app-environment/`

Create the module directory and all 7 files. All resources are extracted 1:1 from
`infra/envs/test/`. The only changes are parameterizing names on `var.env_name` + `var.suffix`
and exposing `sku_name` as a variable with a `"B1"` default.

### `infra/modules/app-environment/variables.tf`

```hcl
variable "env_name" {
  description = "Environment name used in all Azure resource names (e.g. 'test', 'staging', 'production')."
  type        = string
}

variable "suffix" {
  description = "Short personal suffix appended to resource names to ensure uniqueness (e.g. 'tfg')."
  type        = string
}

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
  description = "Object ID of the CI/CD service principal created by bootstrap.sh. Required to grant Key Vault Secrets Officer so the CI step can write secrets."
  type        = string
}

variable "sku_name" {
  description = "App Service plan SKU. All environments share a single plan — per-app plan separation is out of scope."
  type        = string
  default     = "B1"
}
```

### `infra/modules/app-environment/main.tf`

```hcl
resource "azurerm_resource_group" "test" {
  name     = "rg-app-insights-explorer-${var.env_name}-${var.suffix}"
  location = "westus2"
}

resource "azurerm_service_plan" "test" {
  name                = "asp-app-insights-explorer-${var.env_name}-${var.suffix}"
  resource_group_name = azurerm_resource_group.test.name
  location            = azurerm_resource_group.test.location
  os_type             = "Linux"
  sku_name            = var.sku_name
}
```

### `infra/modules/app-environment/keyvault.tf`

```hcl
data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "test" {
  name                       = "kv-aie-${var.env_name}-${var.suffix}"
  resource_group_name        = azurerm_resource_group.test.name
  location                   = azurerm_resource_group.test.location
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  enable_rbac_authorization  = true
  soft_delete_retention_days = 7
  purge_protection_enabled   = false
}
```

### `infra/modules/app-environment/settings.tf`

KV reference strings use no version pin so App Service always resolves the current secret version.
The trailing slash with no version GUID is required — see spec Technical Concerns for format details.

```hcl
locals {
  kv_uri = azurerm_key_vault.test.vault_uri

  kv_ref = {
    app_reg_client_id     = "@Microsoft.KeyVault(SecretUri=${local.kv_uri}secrets/AppRegistrationClientId/)"
    app_reg_client_secret = "@Microsoft.KeyVault(SecretUri=${local.kv_uri}secrets/AppRegistrationClientSecret/)"
    anthropic_api_key     = "@Microsoft.KeyVault(SecretUri=${local.kv_uri}secrets/AnthropicApiKey/)"
    backend_api_secret    = "@Microsoft.KeyVault(SecretUri=${local.kv_uri}secrets/BackendApiSecret/)"
    nextauth_secret       = "@Microsoft.KeyVault(SecretUri=${local.kv_uri}secrets/NextAuthSecret/)"
  }
}
```

### `infra/modules/app-environment/webapps.tf`

`NEXTAUTH_URL`, `NEXT_PUBLIC_API_URL`, and `FRONTEND_ORIGIN` are derived from the naming
convention — no extra variables needed since the module already knows `env_name` and `suffix`.

```hcl
resource "azurerm_linux_web_app" "frontend" {
  name                = "app-aie-frontend-${var.env_name}-${var.suffix}"
  resource_group_name = azurerm_resource_group.test.name
  location            = azurerm_resource_group.test.location
  service_plan_id     = azurerm_service_plan.test.id

  identity {
    type = "SystemAssigned"
  }

  site_config {
    always_on                               = false
    container_registry_use_managed_identity = true

    application_stack {
      docker_image_name   = "app-insights-explorer-frontend:latest"
      docker_registry_url = "https://${var.acr_login_server}"
    }
  }

  app_settings = {
    "AppRegistrationClientId"     = local.kv_ref.app_reg_client_id
    "AppRegistrationClientSecret" = local.kv_ref.app_reg_client_secret
    "BackendApiSecret"            = local.kv_ref.backend_api_secret
    "NextAuthSecret"              = local.kv_ref.nextauth_secret
    "AppRegistrationTenantId"     = "consumers"
    "NEXTAUTH_URL"                = "https://app-aie-frontend-${var.env_name}-${var.suffix}.azurewebsites.net"
    "NEXT_PUBLIC_API_URL"         = "https://app-aie-api-${var.env_name}-${var.suffix}.azurewebsites.net"
  }
}

resource "azurerm_linux_web_app" "api" {
  name                = "app-aie-api-${var.env_name}-${var.suffix}"
  resource_group_name = azurerm_resource_group.test.name
  location            = azurerm_resource_group.test.location
  service_plan_id     = azurerm_service_plan.test.id

  identity {
    type = "SystemAssigned"
  }

  site_config {
    always_on                               = false
    container_registry_use_managed_identity = true

    application_stack {
      docker_image_name   = "app-insights-explorer-api:latest"
      docker_registry_url = "https://${var.acr_login_server}"
    }
  }

  app_settings = {
    "AnthropicApiKey"         = local.kv_ref.anthropic_api_key
    "BackendApiSecret"        = local.kv_ref.backend_api_secret
    "AppRegistrationTenantId" = "consumers"
    "FRONTEND_ORIGIN"         = "https://app-aie-frontend-${var.env_name}-${var.suffix}.azurewebsites.net"
  }
}
```

### `infra/modules/app-environment/rbac.tf`

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

### `infra/modules/app-environment/outputs.tf`

Matches the existing `infra/envs/test/` output surface exactly so downstream consumers
(GitHub Actions workflows) require no changes.

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

---

## Task 2 — Refactor `infra/envs/test/`

### Files to delete

Remove the four resource files that are now owned by the module:

- `infra/envs/test/webapps.tf`
- `infra/envs/test/keyvault.tf`
- `infra/envs/test/rbac.tf`
- `infra/envs/test/settings.tf`

### Files unchanged

- `infra/envs/test/backend.tf` — no changes
- `infra/envs/test/providers.tf` — no changes
- `infra/envs/test/variables.tf` — no changes (retains the same 4 shared infra variables)

### `infra/envs/test/main.tf` — replace entirely

`suffix` is hardcoded as `"tfg"` — it is a fixed deployment identifier, not an
environment-varying value.

```hcl
module "app_environment" {
  source            = "../../modules/app-environment"
  env_name          = "test"
  suffix            = "tfg"
  acr_login_server  = var.acr_login_server
  acr_id            = var.acr_id
  sso_client_id     = var.sso_client_id
  cicd_sp_object_id = var.cicd_sp_object_id
}
```

### `infra/envs/test/outputs.tf` — replace entirely

Re-exports module outputs. Descriptions are preserved from the original.

```hcl
output "webapp_frontend_name" {
  description = "Frontend web app name — set as GitHub Actions Variable WEBAPP_FRONTEND after apply."
  value       = module.app_environment.webapp_frontend_name
}

output "webapp_api_name" {
  description = "API web app name — set as GitHub Actions Variable WEBAPP_API after apply."
  value       = module.app_environment.webapp_api_name
}

output "kv_name" {
  description = "Key Vault name — used by the CI secret-population step."
  value       = module.app_environment.kv_name
}

output "kv_uri" {
  description = "Key Vault URI — used to construct Key Vault reference strings in App Service settings."
  value       = module.app_environment.kv_uri
}
```

---

## Task 3 — Create `infra/envs/staging/`

### `infra/envs/staging/backend.tf`

```hcl
# Partial backend configuration — supply storage details at terraform init:
#
#   terraform -chdir=infra/envs/staging init `
#     -backend-config="resource_group_name=rg-aie-tfstate-3" `
#     -backend-config="storage_account_name=aietfstate3" `
#     -backend-config="container_name=tfstate3-staging" `
#     -backend-config="key=staging.tfstate"
#
terraform {
  backend "azurerm" {
    key = "staging.tfstate"
  }
}
```

### `infra/envs/staging/providers.tf`

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

### `infra/envs/staging/variables.tf`

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

### `infra/envs/staging/main.tf`

```hcl
module "app_environment" {
  source            = "../../modules/app-environment"
  env_name          = "staging"
  suffix            = "tfg"
  acr_login_server  = var.acr_login_server
  acr_id            = var.acr_id
  sso_client_id     = var.sso_client_id
  cicd_sp_object_id = var.cicd_sp_object_id
}
```

### `infra/envs/staging/outputs.tf`

```hcl
output "webapp_frontend_name" {
  description = "Frontend web app name — set as GitHub Actions Variable WEBAPP_FRONTEND after apply."
  value       = module.app_environment.webapp_frontend_name
}

output "webapp_api_name" {
  description = "API web app name — set as GitHub Actions Variable WEBAPP_API after apply."
  value       = module.app_environment.webapp_api_name
}

output "kv_name" {
  description = "Key Vault name — used by the CI secret-population step."
  value       = module.app_environment.kv_name
}

output "kv_uri" {
  description = "Key Vault URI — used to construct Key Vault reference strings in App Service settings."
  value       = module.app_environment.kv_uri
}
```

---

## Task 4 — Create `infra/envs/production/`

Same structure as staging. Only `env_name`, the backend container name, and the backend key differ.

### `infra/envs/production/backend.tf`

```hcl
# Partial backend configuration — supply storage details at terraform init:
#
#   terraform -chdir=infra/envs/production init `
#     -backend-config="resource_group_name=rg-aie-tfstate-3" `
#     -backend-config="storage_account_name=aietfstate3" `
#     -backend-config="container_name=tfstate3-production" `
#     -backend-config="key=production.tfstate"
#
terraform {
  backend "azurerm" {
    key = "production.tfstate"
  }
}
```

### `infra/envs/production/providers.tf`

Identical to `infra/envs/staging/providers.tf`.

### `infra/envs/production/variables.tf`

Identical to `infra/envs/staging/variables.tf`.

### `infra/envs/production/main.tf`

```hcl
module "app_environment" {
  source            = "../../modules/app-environment"
  env_name          = "production"
  suffix            = "tfg"
  acr_login_server  = var.acr_login_server
  acr_id            = var.acr_id
  sso_client_id     = var.sso_client_id
  cicd_sp_object_id = var.cicd_sp_object_id
}
```

### `infra/envs/production/outputs.tf`

Identical to `infra/envs/staging/outputs.tf`.

---

## Task 5 — Extend `build-release/scripts/bootstrap.sh`

Add two idempotent container-creation blocks immediately after the existing container block
(after line 114). Derived names use the existing `TFSTATE_CONTAINER` variable as the base.

Insert after the closing `fi` of the existing container block:

```bash
# ── Staging and production tfstate containers ─────────────────────────────────

TFSTATE_CONTAINER_STAGING="${TFSTATE_CONTAINER}-staging"
TFSTATE_CONTAINER_PRODUCTION="${TFSTATE_CONTAINER}-production"

if az storage container show \
     --name "$TFSTATE_CONTAINER_STAGING" \
     --account-name "$TFSTATE_SA" \
     --auth-mode login &>/dev/null; then
  skip "Blob container already exists: $TFSTATE_CONTAINER_STAGING"
else
  info "Creating blob container: $TFSTATE_CONTAINER_STAGING"
  az storage container create \
    --name "$TFSTATE_CONTAINER_STAGING" \
    --account-name "$TFSTATE_SA" \
    --auth-mode login \
    --output none
  success "Blob container created"
fi

if az storage container show \
     --name "$TFSTATE_CONTAINER_PRODUCTION" \
     --account-name "$TFSTATE_SA" \
     --auth-mode login &>/dev/null; then
  skip "Blob container already exists: $TFSTATE_CONTAINER_PRODUCTION"
else
  info "Creating blob container: $TFSTATE_CONTAINER_PRODUCTION"
  az storage container create \
    --name "$TFSTATE_CONTAINER_PRODUCTION" \
    --account-name "$TFSTATE_SA" \
    --auth-mode login \
    --output none
  success "Blob container created"
fi
```

Also update the output section at the bottom to note the two new containers. After the existing
`SP_OBJECT_ID` line, add:

```bash
echo "Also record these container names — needed as backend-config values for terraform init:"
echo ""
echo "  Staging container    : ${TFSTATE_CONTAINER_STAGING}"
echo "  Production container : ${TFSTATE_CONTAINER_PRODUCTION}"
```

---

## Task 6 — Re-initialize the test environment `[DEVELOPER STEP]`

> **Run on your local machine.** Requires `az login` and access to the Azure Storage backend.
> This re-downloads the module source so Terraform is aware of the new module path.

```powershell
terraform -chdir=infra/envs/test init `
  -backend-config="resource_group_name=rg-aie-tfstate-3" `
  -backend-config="storage_account_name=aietfstate3" `
  -backend-config="container_name=tfstate3" `
  -backend-config="key=test.tfstate"
```

Expected output includes: `Initializing modules...` and `Terraform has been successfully initialized!`

If prompted to migrate state, answer **no** — the state migration is handled manually in Task 7.

---

## Task 7 — Migrate Terraform state `[DEVELOPER STEP]`

> **Run on your local machine.** Requires the test environment to be initialized (Task 6 complete).
> These commands remap the 10 existing resources from root scope to `module.app_environment.*`
> scope. If any resource is missed, `terraform plan` will show it as destroy+recreate.
> Run all 10 commands before checking the plan.

Run from the repo root:

```powershell
terraform -chdir=infra/envs/test state mv `
  'azurerm_resource_group.test' `
  'module.app_environment.azurerm_resource_group.test'

terraform -chdir=infra/envs/test state mv `
  'azurerm_service_plan.test' `
  'module.app_environment.azurerm_service_plan.test'

terraform -chdir=infra/envs/test state mv `
  'azurerm_linux_web_app.frontend' `
  'module.app_environment.azurerm_linux_web_app.frontend'

terraform -chdir=infra/envs/test state mv `
  'azurerm_linux_web_app.api' `
  'module.app_environment.azurerm_linux_web_app.api'

terraform -chdir=infra/envs/test state mv `
  'azurerm_key_vault.test' `
  'module.app_environment.azurerm_key_vault.test'

terraform -chdir=infra/envs/test state mv `
  'azurerm_role_assignment.frontend_acr_pull' `
  'module.app_environment.azurerm_role_assignment.frontend_acr_pull'

terraform -chdir=infra/envs/test state mv `
  'azurerm_role_assignment.api_acr_pull' `
  'module.app_environment.azurerm_role_assignment.api_acr_pull'

terraform -chdir=infra/envs/test state mv `
  'azurerm_role_assignment.frontend_kv_secrets_user' `
  'module.app_environment.azurerm_role_assignment.frontend_kv_secrets_user'

terraform -chdir=infra/envs/test state mv `
  'azurerm_role_assignment.api_kv_secrets_user' `
  'module.app_environment.azurerm_role_assignment.api_kv_secrets_user'

terraform -chdir=infra/envs/test state mv `
  'azurerm_role_assignment.cicd_kv_secrets_officer' `
  'module.app_environment.azurerm_role_assignment.cicd_kv_secrets_officer'
```

Each command outputs: `Move "..." to "..."` — confirm all 10 succeed before continuing.

**Verification gate — run before opening the PR:**

```powershell
terraform -chdir=infra/envs/test plan `
  -var="acr_login_server=<value>" `
  -var="acr_id=<value>" `
  -var="sso_client_id=<value>" `
  -var="cicd_sp_object_id=<value>"
```

The plan **must** show:

```
Plan: 0 to add, 0 to change, 0 to destroy.
```

Any other output means at least one resource was not migrated. Do not open the PR until
this gate passes.

Also verify in the plan output that app settings containing Key Vault references match the
format `@Microsoft.KeyVault(SecretUri=https://{vault-name}.vault.azure.net/secrets/{name}/)` —
trailing slash present, no version GUID appended.

---

## Task 8 — Open PR and confirm CI plan `[DEVELOPER STEP]`

> **Run on your local machine.** Push the feature branch and open a PR against `development`.

```powershell
git push origin fg/platform-456-terraform-module
```

Open a PR from `fg/platform-456-terraform-module` → `development`. The `pr.yml` workflow runs
automatically and posts a `terraform plan` comment on the PR.

**Merge gate:** The plan comment must show `Plan: 0 to add, 0 to change, 0 to destroy` before
merging. This is the same verification as Task 7 but run by CI in the pipeline authentication
context.

---

## Task 9 — Commit `[DEVELOPER STEP]`

> Per project convention, commit is handled by the developer.

Stage and commit all changes from Tasks 1–5:

```
PLATFORM-456: extract infra/modules/app-environment, add staging and production env roots, extend bootstrap.sh
```

Files changed:
- `infra/modules/app-environment/` (7 new files)
- `infra/envs/test/main.tf` (replaced)
- `infra/envs/test/outputs.tf` (replaced)
- `infra/envs/test/webapps.tf` (deleted)
- `infra/envs/test/keyvault.tf` (deleted)
- `infra/envs/test/rbac.tf` (deleted)
- `infra/envs/test/settings.tf` (deleted)
- `infra/envs/staging/` (5 new files)
- `infra/envs/production/` (5 new files)
- `build-release/scripts/bootstrap.sh` (extended)

---

## Out of Scope

The following are explicitly excluded from this plan per the spec:

- OIDC federated credentials for staging/production — owned by PLATFORM-457
- `terraform apply` for staging or production environments — deferred until PLATFORM-457 completes
- GitHub Actions workflow changes — owned by PLATFORM-457
- SSO App Registration redirect URI additions for staging/production — future task
- Running `bootstrap.sh` again to create the new containers — this is a one-time operator step
  documented in bootstrap.sh's output; it does not need to happen as part of this PR

## Sync Check Note

Before the first `terraform apply` for staging or production, review the env root `main.tf`
against the module's current `outputs.tf` to confirm all referenced outputs still exist. Any
module output additions made after this plan merges must include updates to all env roots in
the same change.
