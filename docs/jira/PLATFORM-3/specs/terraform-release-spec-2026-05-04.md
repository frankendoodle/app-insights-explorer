---
title: "Terraform IaC Release — Feature Spec"
ticket: PLATFORM-3
slug: terraform-release
discovery: specs/terraform-release-discovery.md
date: 2026-05-04
tags: [ai/generated, jira/feature-spec]
status: final
stale: false
---

# Terraform IaC Release — Feature Spec

## 1. Overview

PLATFORM-3 translates the manually provisioned Azure infrastructure from PLATFORM-1 into Terraform IaC, producing a reproducible provisioning sequence that a developer can run on a clean Azure subscription to arrive at a fully deployed, CI/CD-wired application. The feature comprises a one-time bootstrap shell script and two Terraform root modules — one for shared Azure resources and one for the test environment — that together reproduce every resource documented in the PLATFORM-1 walkthrough. All Terraform-managed resources carry a `-tfg` naming suffix so they coexist alongside the existing hand-provisioned resources without collision, and the hand-provisioned resources remain as a reference throughout development.

Like PLATFORM-1 and PLATFORM-29 before it, this story follows a step-by-step, annotated tutorial approach. Each Terraform resource is introduced individually with an explanation of what it is, why it exists, and how it connects to the surrounding infrastructure. The resulting code is directly traceable to the PLATFORM-1 provisioning steps, making it possible to read both artifacts side by side and see exactly what each manual step became in code.

## 2. Delivery Assessment

```
Readiness: Partially blocked
Blocking Items:
- azuread provider compatibility with personal Microsoft account (consumers
  tenant) must be validated via a minimal apply before infra/shared/ can be
  fully written. If managed azuread_application resources fail with
  Authorization_RequestDenied, the SSO App Registration must be created
  manually and referenced via data sources. The correct path for infra/shared/
  cannot be determined until this is tested.
Decomposition:
- None identified — the bootstrap script and two root modules form a single
  cohesive deliverable that is implemented in the order it is applied:
  bootstrap → infra/shared/ → infra/envs/test/
```

## 3. Technical Context

App-insights-explorer is a two-container web application — a Next.js frontend and a NestJS API backend — deployed as Linux Docker App Services in Azure. PLATFORM-1 manually provisioned all required Azure infrastructure and produced a detailed walkthrough documenting each resource and the reason it exists. That walkthrough is the direct source this story translates into Terraform; every resource in the spec maps back to a specific PLATFORM-1 step.

PLATFORM-29 established two GitHub Actions workflows: a PR validation workflow that builds Docker images without pushing, and a CI deployment workflow that builds, pushes to ACR, deploys to App Services, and smoke-tests both containers. Those workflows expect specific resource names, a particular RBAC configuration, and App Service settings wired as Key Vault references. The Terraform-provisioned infrastructure must satisfy all of those expectations for the PLATFORM-29 pipeline to pass end-to-end.

No Terraform infrastructure currently exists for this project. The hand-provisioned PLATFORM-1 resources remain active in the subscription and will continue to run throughout development of this story. The two sets of resources — hand-provisioned and Terraform-managed — coexist in the same subscription, distinguished by their naming suffix.

## 4. Technical Scope

This feature touches the following systems and boundaries:

**Bootstrap shell script** — provisions the Terraform state backend (an Azure Blob Storage account and container) and the CI/CD service principal with its Contributor role assignment. Outputs the values needed for manual GitHub repository variable configuration, including the CI/CD service principal's object ID which is required as an input variable by `infra/shared/`. Designed to be safely re-runnable.

**`azurerm` Terraform provider** — manages all Azure resource types: resource groups, App Service Plans, App Service web apps, Azure Container Registry, Key Vault, role assignments, and managed identities.

**`azuread` Terraform provider** — manages Azure AD resources: the OIDC federated credential on the CI/CD service principal, and conditionally the SSO App Registration and its Service Principal (managed resources if personal account permissions allow; data sources if they do not — see Section 5 and Section 7).

**`infra/shared/` root module** — provisions ACR (the container image registry shared across environments), the SSO App Registration and its bound Service Principal (used by NextAuth.js for user authentication), and the OIDC federated credential on the CI/CD service principal (enabling GitHub Actions to authenticate to Azure without stored credentials). The OIDC federated credential resource references the CI/CD service principal by its object ID, which is passed in as an input variable sourced from the bootstrap script's output.

**`infra/envs/test/` root module** — provisions the resource group, App Service Plan, frontend and API web apps (each with system-assigned managed identity and ACR pull integration enabled), Key Vault with RBAC authorization, four RBAC role assignments (AcrPull for each web app managed identity, Key Vault Secrets User for each web app managed identity), and all App Service application settings (Key Vault reference strings for sensitive values, plain values for non-sensitive configuration).

**CI secret-population step** — PLATFORM-3 extends the existing `ci-test.yml` workflow from PLATFORM-29 with a new step that writes all secret values from GitHub Secrets directly to Key Vault via Azure CLI, running after `terraform apply infra/envs/test/` completes. This is the only mechanism by which secret values enter Key Vault; Terraform never handles them. The `ci-test.yml` modification is the only change to the PLATFORM-29 workflows in scope for this story.

**GitHub Actions CI/CD pipeline (PLATFORM-29)** — the acceptance gate for this story. The pipeline must complete end-to-end — build, push, deploy, smoke test — on the Terraform-provisioned infrastructure.

## 5. Key Design Decisions

### `-tfg` naming suffix for all Terraform-managed resources

All resources provisioned by Terraform use a `-tfg` suffix. This makes ownership immediately clear, prevents name collisions with the existing hand-provisioned resources, and allows both sets to coexist in the same subscription during the transition period. The PLATFORM-1 resources are not modified or deleted. Rejected alternative: using a `-3` suffix matching the Jira ticket — `-tfg` is more self-documenting after the ticket context fades.

### Bootstrap script handles the two Terraform prerequisites

The Terraform state storage account and the CI/CD service principal must exist before any `terraform apply` can run — they are prerequisites to Terraform itself and cannot be Terraform-managed. A shell script creates both, assigns the Contributor role to the service principal, and outputs the exact GitHub repository variable values to set manually. The script checks for existing resources before creating to support safe re-execution if it fails partway through. Rejected alternative: provisioning these in a separate Terraform root module — creates a circular dependency where Terraform needs a backend to manage its own backend.

### Two independent root modules with no remote state sharing

`infra/shared/` and `infra/envs/test/` have separate state files. Values that `infra/envs/test/` needs from `infra/shared/` — such as the ACR resource ID for role assignments and the ACR login server URL for App Service configuration — are passed as explicit input variables. The developer retrieves these from the `infra/shared/` outputs after apply and provides them to `infra/envs/test/` before the second apply. Rejected alternative: Terraform remote state data sources — adds a runtime dependency between modules that obscures the provisioning sequence for a learning context.

### Hybrid secret management — Terraform owns structure, CI owns values

Terraform provisions the Key Vault, configures RBAC, and creates App Service settings as Key Vault reference strings. It never writes a secret value. A dedicated GitHub Actions step writes secret values from GitHub Secrets to Key Vault via Azure CLI after each environment apply. This keeps Terraform state free of sensitive data. Rejected alternative: passing secrets as `TF_VAR_*` environment variables and writing them as `azurerm_key_vault_secret` resources — valid but stores values in state, creating a secondary sensitive data store.

### SSO App Registration client secret is manually bootstrapped

Terraform creates the SSO App Registration object and its bound Service Principal but not the client secret. The developer creates the client secret once in the Azure portal during the bootstrap sequence, adds it to GitHub Secrets, and the CI secret step writes it to Key Vault alongside the other application secrets. Rejected alternative: `azuread_application_password` managed by `infra/shared/` — the generated secret value would need to flow into `infra/envs/test/` as a sensitive output, coupling the two modules on a generated credential.

### `lifecycle { ignore_changes }` on the SSO App Registration

The `azuread_application` resource for the SSO App Registration must include a `lifecycle { ignore_changes }` block covering API permission and app role fields. Terraform cannot replicate admin consent grants — those are applied separately through the Azure portal consent flow. Without `ignore_changes`, each subsequent `terraform apply` attempts to reconcile those fields and silently removes portal-applied consent grants, breaking the OAuth login flow in a way that is difficult to trace. This pattern was previously observed to cause login failures in this project. Keeping `ignore_changes` in place has no downside: Terraform simply stops managing those specific fields, which is the correct behavior for anything governed by the portal consent flow. This pattern is also recommended in the M&M Terraform App Registration Guide stored in the PLATFORM-3 Confluence artifacts.

### SSO App Registration — managed resources vs. data sources (TBD pending validation)

Two implementation paths are viable for the SSO App Registration in `infra/shared/`, and the correct one cannot be chosen until a minimal `azuread` apply is attempted against the personal account tenant.

**Path A — managed resources:** `azuread_application` and `azuread_service_principal` are fully managed by Terraform. Requires `lifecycle { ignore_changes }` on the application resource. The developer creates the client secret manually in the portal (the client secret is never Terraform-managed regardless of path). This is the preferred path if permissions allow.

**Path B — data sources:** The App Registration and Service Principal are created manually in the Azure portal as part of the bootstrap sequence. `infra/shared/` references them via `data "azuread_application"` and `data "azuread_service_principal"` by display name. Terraform manages only the OIDC federated credential. This path is the fallback if `Authorization_RequestDenied` is encountered on Path A.

Both paths produce equivalent runtime infrastructure. Path B adds one manual step to the bootstrap sequence, which is consistent with the pattern already established for the client secret. The implementation plan must document both paths and the decision point at which the developer chooses between them.

### No GitHub Terraform provider

GitHub repository-level variables, environments, and branch protection rules are set by hand in GitHub Settings. Both Terraform modules are Azure-only, keeping the provider surface to `azurerm` and `azuread`. The bootstrap script outputs the exact values to paste into GitHub Settings. Rejected alternative: Terraform GitHub provider — requires a GitHub PAT as an additional secret, adds a non-Azure provider dependency, and the configuration is a one-time setup that does not benefit meaningfully from being Terraform-managed.

### Tutorial-style implementation — one resource at a time

Following the approach established in PLATFORM-1 and PLATFORM-29, each Terraform resource is implemented and annotated individually rather than introduced in bulk. The implementation plan mirrors the PLATFORM-1 provisioning walkthrough in sequence so a developer can read both documents side by side and see exactly what each manual step became in code.

## 6. Technical Dependencies

- **PLATFORM-1 provisioning walkthrough** — the direct source for resource names, configurations, and the reasoning behind each resource; the Terraform code must be traceable step-by-step to this document
- **PLATFORM-29 CI/CD workflows** — define the exact infrastructure surface the provisioned resources must expose: ACR name, App Service names, Key Vault secret names, RBAC configuration, App Service settings shape
- **Active Azure subscription** — personal Microsoft account with sufficient permissions to create App Registrations, assign RBAC roles, create storage accounts, and provision all resource types used in PLATFORM-1
- **GitHub repository** — Actions enabled, with the ability to set repository-level secrets and variables
- **Terraform CLI** — installed locally for bootstrap and initial manual applies; version to be pinned in `required_version`
- **Azure CLI** — used in the bootstrap script and in the CI secret-population step
- **`hashicorp/azurerm` and `hashicorp/azuread` providers** — specific versions to be pinned in module `required_providers` blocks

## 7. Technical Concerns & Risks

**`azuread` provider behavior with personal Microsoft accounts — blocking.** Personal Microsoft accounts share the `consumers` tenant (`9188040d-6c67-4c5b-b112-36a304b66dad`) and do not have their own isolated Entra ID directory. The `hashicorp/azuread` provider is designed and tested against organizational Entra ID tenants. Creating managed `azuread_application` and `azuread_service_principal` resources on a personal account typically fails with `Authorization_RequestDenied` because personal accounts lack the `microsoft.directory/applications/create` directory role permission that the managed resource requires.

The minimal apply that must run first in `infra/shared/` implementation is: attempt a standalone `azuread_application` + `azuread_service_principal` resource pair with minimal configuration. If it succeeds, proceed with managed resources and apply `lifecycle { ignore_changes }` as designed. If it fails with `Authorization_RequestDenied`, switch to the data source fallback path: create the SSO App Registration manually in the Azure portal during the bootstrap sequence (alongside the client secret), then reference it in `infra/shared/` using `data "azuread_application"` and `data "azuread_service_principal"` by display name. The OIDC federated credential resource on the CI/CD service principal remains Terraform-managed on either path, since the underlying App Registration object exists regardless of how it was created.

The data source fallback path is well-documented, fits the manual bootstrap pattern already established for the client secret, and does not reduce the educational value of the tutorial — the distinction between managed resources and data sources is itself a meaningful Terraform concept worth explaining. This concern is the reason the Delivery Assessment is Partially blocked.

**Bootstrap script idempotency.** Shell scripts that create Azure resources are not naturally idempotent. Running `az ad sp create-for-rbac` twice produces two service principals. The bootstrap script must check for the existence of each resource before creating it and must be verified to re-run safely if it fails partway through.

**Cross-module variable passing requires manual coordination.** Because `infra/shared/` and `infra/envs/test/` have independent state files, output values from the first apply must be manually retrieved and supplied as input variables to the second. There is no automated dependency. The implementation plan must make this coordination step explicit and provide clear instructions for retrieving the correct output values.

**AcrPush role assignment timing.** The CI/CD service principal requires the AcrPush role on the ACR to push Docker images. ACR is provisioned by `infra/shared/`. If the CI/CD pipeline runs before `infra/shared/` has been successfully applied, the image push step will fail with an authorization error. The provisioning sequence must be followed in order, and this dependency must be clearly documented in the tutorial.

**Key Vault reference resolution caching.** App Services cache Key Vault reference resolutions. After the CI secret-population step writes secret values to Key Vault, the App Services may not immediately reflect the new values. A stop/start sequence — not just a restart — forces a fresh Key Vault reference resolution. This behavior was observed and documented in the PLATFORM-29 lessons learned section and applies equally to the Terraform-provisioned infrastructure.

## 8. Non-Scope

- Importing the existing PLATFORM-1 hand-provisioned resources into Terraform state — the Terraform code is designed for fresh creation only; the existing resources remain untouched
- GitHub Terraform provider — repository variables, environments, and branch protection rules are set manually and are not managed as code
- Staging or production Terraform environments — this story covers `infra/envs/test/` only; additional environments are future scope
- Reusable Terraform modules — all resources are written as flat root module configurations for clarity and direct traceability to PLATFORM-1; abstraction into shared modules is future scope
- Application code changes — no changes to the NestJS backend or Next.js frontend are required by this story
- Terraform Cloud or Terraform Enterprise — state is stored in Azure Blob Storage only
- Cost optimization, resource tagging, or monitoring configuration beyond what is required for basic resource identification and operation
