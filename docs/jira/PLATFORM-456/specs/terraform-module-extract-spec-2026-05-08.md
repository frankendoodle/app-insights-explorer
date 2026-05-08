---
title: "Terraform Module Extraction and Environment Roots — Feature Spec"
ticket: PLATFORM-456
slug: terraform-module-extract
discovery: specs/terraform-module-extract-discovery.md
date: 2026-05-08
tags: [ai/generated, jira/feature-spec]
status: final
stale: false
---

# Terraform Module Extraction and Environment Roots — Feature Spec

## 1. Overview

This feature refactors the Terraform IaC structure for the app-insights-explorer project from a single flat environment directory into a reusable module pattern. All environment-specific resource definitions — App Service plan, web apps, Key Vault, RBAC assignments, and Key Vault reference string locals — are extracted from the existing test environment configuration into a shared module at `infra/modules/app-environment/`. The test environment root is re-pointed to call the module, and two new environment roots for staging and production are added as thin callers of the same module.

The end state is a three-environment IaC layout where all resource logic lives once in the module and each environment root contains only backend configuration, provider configuration, and a module call with environment-specific variable values. No resource definitions are duplicated across environments. PLATFORM-456 delivers the module and the three env roots; actual provisioning of staging and production is deferred to when PLATFORM-457 completes the required OIDC credentials.

## 2. Delivery Assessment

```
Readiness: Partially blocked
Blocking Items:
- Terraform state migration for the existing test environment: resources currently
  tracked at root module scope must be remapped to module.app_environment.* scope
  via terraform state mv before the refactored configuration can be applied without
  destroying and recreating live test infrastructure. This is an operational step
  required during implementation, not a code dependency.
Decomposition:
- None identified — single implementable unit.
```

## 3. Technical Context

The app-insights-explorer project's Terraform infrastructure is split into two layers. The `infra/shared/` layer provisions resources shared across all environments: an Azure Container Registry, an Azure AD App Registration for SSO, and OIDC federated credentials that allow GitHub Actions to authenticate via workload identity. This layer is managed independently and its outputs (ACR login server, ACR resource ID, SSO client ID) are consumed by the environment layer as input variables.

The `infra/envs/test/` directory is the only environment layer currently in place. It contains inline definitions for a resource group, an App Service plan (Linux, B1 SKU), two Linux web apps (frontend and API), a Key Vault, five RBAC role assignments wiring managed identities to ACR and Key Vault, and local values that construct Azure Key Vault reference strings for use as app settings. Resource names follow the pattern `{resource-type}-aie-{env}-{suffix}`, currently hardcoded for the test environment. A partial backend configuration handles remote state isolation via Azure Storage with a per-environment tfstate key.

The existing test environment is live and managing real Azure resources. Any change to the Terraform configuration that alters how resources are addressed in state requires a state migration operation before re-applying.

## 4. Technical Scope

This feature touches:

- **New module directory** — `infra/modules/app-environment/` containing all resource definitions currently inline in the test env root, parameterized for reuse across environments.
- **Refactored test env root** — `infra/envs/test/` reduced to backend config, provider config, and a module call. Existing outputs re-exported from module outputs.
- **New staging env root** — `infra/envs/staging/` created as a thin caller of the module with staging-appropriate variable values.
- **New production env root** — `infra/envs/production/` created as a thin caller of the module with production-appropriate variable values.
- **Terraform state** — the existing test environment's state must be migrated to reflect the new module address paths. No Azure resources are created or destroyed by this migration.
- **`infra/shared/`** — no changes. OIDC credential additions for staging and production environments are out of scope and owned by PLATFORM-457.

## 5. Key Design Decisions

### Module Constructs Names from env_name and suffix

The module accepts two naming inputs — `env_name` and `suffix` — and constructs all Azure resource names internally using the established `{resource-type}-aie-{env_name}-{suffix}` convention. Env roots pass only these two values alongside the four shared infrastructure references. The alternative of passing fully-qualified resource names per resource from the env root was rejected because it duplicates naming logic across callers and bloats the module's variable interface.

### Key Vault Reference Locals Stay Inside the Module

The locals that construct Azure Key Vault reference strings used as web app settings are defined inside the module, not in env roots. These locals depend on the Key Vault URI, which is produced by a resource inside the module. Keeping them internal preserves encapsulation and avoids exposing an internal implementation detail to callers. The alternative — exporting the KV URI and constructing reference strings in each env root — was rejected for this reason.

### SKU Exposed as Module Variable with Default — Single-Plan Constraint

The App Service plan SKU is a module input variable with a default value. All three environments use the same SKU initially. Env roots that need a different SKU can override the variable without touching the module. Hardcoding the SKU inside the module was rejected because it would require a module change to resize any individual environment. The module intentionally provisions a single App Service plan shared by both the frontend and API web apps. Per-app plan separation (different SKUs, scaling rules, or regions per app) is out of scope and would require a future module redesign. This is a known, intentional constraint.

### Backend and Provider Configs Stay in Each Env Root

Backend configuration (Azure Storage remote state with a per-environment tfstate key) and provider configuration are not absorbed into the module. Terraform does not support backend configuration inside child modules, and provider configuration is inherently per-environment. These files remain in each env root unchanged.

### Module Outputs Match Existing Test Surface

The module exposes four outputs: frontend web app name, API web app name, Key Vault name, and Key Vault URI. This matches the output surface of the existing test env root. Consumers — including GitHub Actions workflows that reference these values — require no changes.

### Staging and Production Env Roots Created but Not Applied

The env roots for staging and production are created as part of this subtask but `terraform apply` for these environments is not executed. Provisioning requires OIDC federated credentials for the staging and production GitHub Actions environments, which are added to `infra/shared/` by PLATFORM-457. Applying before those credentials exist would require temporary manual authentication.

## 6. Technical Dependencies

- **`infra/shared/` outputs** — the module's env roots require the ACR login server, ACR resource ID, and SSO client ID outputs from the shared layer. The shared infrastructure must be applied and its outputs available before env roots can be initialized or applied.
- **Azure Storage backend containers** — the test environment already has a corresponding tfstate container, created by the bootstrap script. Staging and production env roots require equivalent containers in the same storage account before `terraform init` can succeed. Responsibility: the bootstrap script is extended to create the staging and production containers as part of initial environment setup, keeping all state storage provisioning in one place.
- **PLATFORM-457** — OIDC federated credentials for the staging and production GitHub Actions environments must be added to `infra/shared/` before staging and production env roots can be applied via CI/CD.
- **Terraform state migration tooling** — `terraform state mv` must be available and the operator must have access to the Azure Storage backend to perform the test environment state migration during implementation.

## 7. Technical Concerns & Risks

**Terraform state migration for the test environment.** The existing test environment's resources are tracked in state at root module scope. After extraction into a child module, all resources are addressed under `module.app_environment.*`. Without a complete migration, `terraform plan` will show all existing resources as destroyed and recreated. A `terraform state mv` command must be executed for every managed resource listed below before `terraform apply` is run. After all moves are complete, `terraform plan` must show zero destructive changes before apply proceeds. If any resource is missed, test infrastructure will be destroyed on the next apply with no further warning.

The complete migration map (source → destination):

| Resource | From (root scope) | To (module scope) |
|---|---|---|
| Resource group | `azurerm_resource_group.test` | `module.app_environment.azurerm_resource_group.test` |
| App Service plan | `azurerm_service_plan.test` | `module.app_environment.azurerm_service_plan.test` |
| Frontend web app | `azurerm_linux_web_app.frontend` | `module.app_environment.azurerm_linux_web_app.frontend` |
| API web app | `azurerm_linux_web_app.api` | `module.app_environment.azurerm_linux_web_app.api` |
| Key Vault | `azurerm_key_vault.test` | `module.app_environment.azurerm_key_vault.test` |
| Frontend AcrPull | `azurerm_role_assignment.frontend_acr_pull` | `module.app_environment.azurerm_role_assignment.frontend_acr_pull` |
| API AcrPull | `azurerm_role_assignment.api_acr_pull` | `module.app_environment.azurerm_role_assignment.api_acr_pull` |
| Frontend KV Secrets User | `azurerm_role_assignment.frontend_kv_secrets_user` | `module.app_environment.azurerm_role_assignment.frontend_kv_secrets_user` |
| API KV Secrets User | `azurerm_role_assignment.api_kv_secrets_user` | `module.app_environment.azurerm_role_assignment.api_kv_secrets_user` |
| CI/CD KV Secrets Officer | `azurerm_role_assignment.cicd_kv_secrets_officer` | `module.app_environment.azurerm_role_assignment.cicd_kv_secrets_officer` |

Note: `data.azurerm_client_config.current` is a data source and does not require state migration.

**App settings and Key Vault references.** The web app app settings include Azure Key Vault references with no version pin. This behavior is intentional — it enables automatic secret rotation. The module must construct KV reference strings in the format `@Microsoft.KeyVault(SecretUri=https://{vault-name}.vault.azure.net/secrets/{secret-name}/)` — trailing slash present, no version GUID appended. If a version identifier is included, App Service silently pins to the current secret version and stops rotating with no error signal. This format must be verified against the rendered app settings in `terraform plan` output before the implementation is merged.

**Staging and production apply ordering.** The new env roots depend on `infra/shared/` outputs. If `infra/shared/` is ever re-applied and outputs change (e.g., a new ACR is provisioned), all env roots must be re-initialized before applying. This is not a blocker for this subtask but is worth noting as an operational constraint.

**Module output surface drift during deferred-apply window.** Staging and production env roots are committed as part of this subtask but not applied until PLATFORM-457 is complete. Any module output additions made after this subtask merges must include corresponding updates to all env roots in the same change — env roots must never reference a module output that does not exist in the current module version. Before the first `terraform apply` for staging or production, the env root configuration must be reviewed against the module's current output surface to confirm it is in sync. A `terraform plan` that errors on unknown output references is the signal that this sync check was missed.

## 8. Non-Scope

- OIDC federated credential additions to `infra/shared/oidc.tf` for the staging and production GitHub Actions environments — owned by PLATFORM-457.
- GitHub Actions workflow changes — owned by PLATFORM-457.
- Actual provisioning (terraform apply) of staging and production Azure infrastructure — deferred until PLATFORM-457 is complete.
- Changes to the SSO App Registration redirect URIs for staging and production — deferred to a future task.
- Changes to `infra/shared/` for any other purpose — out of scope for this subtask.
