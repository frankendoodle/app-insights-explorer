---
title: "Terraform IaC Release — Feature Discovery"
ticket: PLATFORM-3
slug: terraform-release
date: 2026-05-04
tags: [ai/generated, jira/discovery]
status: specs_complete
specs:
  - slug: terraform-release
    file: specs/terraform-release-spec-2026-05-04.md
    status: complete
---

# Terraform IaC Release — Feature Discovery

## Story Context

PLATFORM-3 asks for the hand-provisioned Azure infrastructure from PLATFORM-1 to be replaced with Terraform IaC, so that the infrastructure is reproducible, version-controlled, and provisionable on a clean Azure subscription. The story continues the three-part tutorial arc: PLATFORM-1 (provision by hand), PLATFORM-29 (set up GitHub Actions CI/CD), PLATFORM-3 (codify the infrastructure as Terraform).

The technical reading: produce two Terraform root modules and a one-time bootstrap script that together reproduce every resource documented in the PLATFORM-1 walkthrough. The resulting infrastructure must be compatible with the PLATFORM-29 CI/CD workflows — same RBAC setup, same App Service configuration shape, same Key Vault reference pattern.

## Dialog Summary

**Fresh creation, `-tfg` naming:** Terraform will not import the existing hand-provisioned resources. New resources use a `-tfg` suffix (e.g., `rg-app-insights-explorer-test-tfg`) so they coexist alongside the PLATFORM-1 resources without collision. The hand-provisioned resources remain as a reference during development.

**Bootstrap script scope:** A one-time shell script handles the two resources Terraform cannot bootstrap itself — the Terraform state storage account (Azure Blob Storage) and the CI/CD service principal (with Contributor role). The script is designed for idempotency and outputs the exact values needed for manual GitHub repository variable configuration.

**Two root modules, independent state:** `infra/shared/` covers ACR, the SSO App Registration and Service Principal, and the OIDC federated credential on the CI/CD SP. `infra/envs/test/` covers the resource group, App Service Plan, both web apps (with managed identities), Key Vault, all four RBAC role assignments, and all App Service settings. No GitHub Terraform provider — repository-level variables stay manual.

**Hybrid secret management:** Terraform provisions Key Vault structure and RBAC only — no secret values ever appear in Terraform state. A dedicated CI step writes secret values from GitHub Secrets to Key Vault via Azure CLI after each `terraform apply`. This separates infrastructure ownership (Terraform) from secret value ownership (GitHub Secrets).

**SSO client secret is manually bootstrapped:** Terraform creates the SSO App Registration object but not its client secret. The developer creates the secret once in the Azure portal, stores it in GitHub Secrets, and the CI secret step writes it to Key Vault. This avoids cross-module dependency on a Terraform-generated credential value.

**No GitHub Terraform provider:** GitHub Actions variables, environments, and branch protection stay manual. Both modules are Azure-only, keeping the provider surface to `azurerm` and `azuread`.

## Key Design Decisions

### `-tfg` naming suffix

All Terraform-managed resources use a `-tfg` suffix to distinguish them from the hand-provisioned PLATFORM-1 resources. Both sets coexist in the same subscription without name collision. The suffix makes ownership immediately obvious to anyone inspecting the Azure portal.

### Bootstrap script for Terraform prerequisites

The Terraform state backend and CI/CD service principal are prerequisites to Terraform itself and cannot be Terraform-managed. A one-time shell script creates them, assigns the Contributor role, and outputs the GitHub variable values. The script checks for existing resources before creating to support safe re-execution.

### Two independent root modules, no remote state sharing

`infra/shared/` and `infra/envs/test/` are separate root modules with independent state files. Cross-module values (ACR resource ID, ACR login server) are passed as explicit input variables to `infra/envs/test/` rather than consumed via remote state data sources. This keeps the structure flat and directly traceable to the PLATFORM-1 walkthrough sequence.

### Hybrid secret management

Terraform owns the Key Vault structure and RBAC. A CI step owns the secret values, writing them from GitHub Secrets via Azure CLI. Terraform state contains no sensitive data. Rejected alternative: passing secrets as Terraform variables sourced from GitHub Secrets env vars — valid but puts sensitive values in state.

### SSO client secret is manually bootstrapped

Terraform creates the App Registration and Service Principal but not the client secret. The secret is created once in the Azure portal and treated as a bootstrap value alongside the other application secrets. Rejected alternative: `azuread_application_password` resource — would require sensitive outputs flowing between modules.

### No GitHub Terraform provider

GitHub repository configuration (variables, environments, branch protection) remains manual. Eliminates the need for a GitHub PAT in the Terraform workflow and keeps both modules Azure-only. The bootstrap script outputs the exact values to paste into GitHub Settings.

### Tutorial-style, one resource at a time

Following PLATFORM-1 and PLATFORM-29, each resource is introduced individually with an explanation of what it does and why. The implementation plan mirrors the PLATFORM-1 walkthrough sequence so a developer can trace every manual step to its Terraform equivalent.

## Delivery Assessment

```
Readiness: Code-ready
Blocking Items:
- None
Decomposition:
- None identified — bootstrap script + infra/shared/ + infra/envs/test/ form
  a single cohesive deliverable implemented in apply order
```

## Spec Manifest

| Spec | Covers | Status |
|---|---|---|
| terraform-release | Full scope: bootstrap script, infra/shared/, infra/envs/test/, hybrid secret step | pending |

[[terraform-release-spec-2026-05-04.md]]
