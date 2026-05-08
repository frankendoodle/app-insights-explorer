---
title: "Terraform Module Extraction and Environment Roots — Feature Discovery"
ticket: PLATFORM-456
slug: terraform-module-extract
date: 2026-05-08
tags: [ai/generated, jira/discovery]
status: specs_complete
specs:
  - slug: terraform-module-extract
    file: specs/terraform-module-extract-spec-2026-05-08.md
    status: complete
---

# Terraform Module Extraction and Environment Roots — Feature Discovery

## Story Context

**PLATFORM-456** — Terraform: extract module and env roots (Sub-task of PLATFORM-453)

The current `infra/envs/test/` directory contains all Terraform resource definitions inline — App Service plan, two Linux web apps, Key Vault, five RBAC role assignments, and local values for Key Vault reference strings. The `infra/shared/` layer (ACR, SSO App Registration, OIDC federated credentials) is separate and unchanged. The goal is to extract the env-specific resource logic into a reusable module and add thin callers for test, staging, and production so that new environments can be provisioned without duplicating resource definitions.

## Dialog Summary

The dialog established the following:

- **Module naming**: The module will construct all Azure resource names internally from two inputs — `env_name` (e.g., "test", "staging", "production") and `suffix` (e.g., "tfg"). Resource names follow the existing pattern `{resource-type}-aie-{env_name}-{suffix}`. Env roots pass only these two values plus the four shared infrastructure references inherited from `infra/shared/`.
- **KV reference locals**: The `settings.tf` locals that build Key Vault reference strings depend on the module's internally-created Key Vault URI. They stay inside the module — not the env root — so the KV reference construction is encapsulated alongside the resource that provides the URI.
- **SKU parameterization**: All three environments start on the same App Service SKU. The SKU is exposed as a module variable with a default so individual env roots can override it without touching the module.
- **Scope boundary**: OIDC federated credential additions (for staging/production GitHub Actions environments) are out of scope. They are owned by PLATFORM-457, which handles the GitHub Actions workflow side. The Terraform env roots for staging and production are created by this subtask but not yet applied — provisioning waits on OIDC creds being in place.
- **State migration**: The existing test environment's Terraform state was written with resources at root module scope. After extraction into a child module, a `terraform state mv` operation is required for each managed resource to remap state paths from root to `module.app_environment.*`. This is a required step during implementation and must not be skipped.
- **Backend and providers**: These files are inherently per-environment (different tfstate keys, different subscription contexts) and stay in each env root unchanged.

## Key Design Decisions

### 1. Module Constructs Names from env_name + suffix

**Decision:** The module accepts `env_name` and `suffix` as inputs and constructs all Azure resource names internally using the existing `{resource-type}-aie-{env_name}-{suffix}` convention.

**Rationale:** Keeps env roots free of name string construction logic. A single naming convention change updates all environments simultaneously. The alternative — passing full resource names as variables — would push name construction into each env root, creating duplication and drift risk.

**Rejected alternative:** Passing fully-qualified resource names per resource from the env root. Rejected because it bloats the module's variable interface and moves naming logic to callers.

### 2. Key Vault Reference Locals Stay Inside the Module

**Decision:** The locals that construct Azure Key Vault reference strings (used as app setting values in the web apps) are defined inside the module, not in the env root.

**Rationale:** These locals depend on the Key Vault URI, which is produced by the Key Vault resource inside the module. Keeping them in the module preserves encapsulation — the env root has no visibility into KV internal details.

**Rejected alternative:** Passing the KV URI out as a module output and constructing reference strings in the env root. Rejected because it exposes an internal implementation detail to callers unnecessarily.

### 3. SKU Exposed as Module Variable with Default

**Decision:** The App Service SKU is a module input variable with a default value matching the current test environment configuration. Env roots that do not override it inherit the default.

**Rationale:** Hardcoding the SKU inside the module would require a module change to scale any environment. A variable with a default achieves the same result today while keeping the door open for per-environment sizing without duplicating logic.

### 4. Backend and Provider Configs Stay in Each Env Root

**Decision:** `backend.tf` and `providers.tf` are not absorbed into the module. They remain in each env root.

**Rationale:** Backend configuration (tfstate key, storage account) and provider configuration are inherently per-environment. Terraform does not support backend configuration inside child modules. These files cannot be shared.

### 5. Module Outputs Match Existing Test Surface

**Decision:** The module exposes the same four outputs that `infra/envs/test/` currently exposes: frontend web app name, API web app name, Key Vault name, and Key Vault URI.

**Rationale:** GitHub Actions workflows and any other consumers reference these values via Terraform output. Matching the existing surface avoids downstream changes in pipelines that already read these outputs.

### 6. Staging and Production Env Roots Created but Not Applied

**Decision:** The `envs/staging/` and `envs/production/` Terraform roots are written as part of this subtask, but actual `terraform apply` for these environments is deferred until PLATFORM-457 completes the OIDC federated credentials and GitHub Actions environments needed to authenticate.

**Rationale:** Creating the roots without applying them is safe and unblocks PLATFORM-457. Applying without OIDC creds would require manual Azure credentials or temporary workarounds.

## Delivery Assessment

**Readiness:** Partially blocked
**Blocking Items:**
- Terraform state migration (`terraform state mv`) must be executed manually during implementation to remap the test environment's existing resources from root scope to `module.app_environment.*` scope. This is a required operational step, not a code blocker — but it means the test environment will have a brief disruption window during the migration if done incorrectly.

**Decomposition:** None — single implementable unit.

## Spec Manifest

1. **terraform-module-extract** — Full extraction of env-specific resources into `infra/modules/app-environment/`, refactoring of `envs/test/`, and creation of `envs/staging/` and `envs/production/` thin callers. Single concern, single spec.

---

[[terraform-module-extract-spec-2026-05-08]]
