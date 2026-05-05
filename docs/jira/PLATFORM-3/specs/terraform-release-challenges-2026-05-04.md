---
title: "Terraform IaC Release — Spec Challenges"
ticket: PLATFORM-3
slug: terraform-release
spec: specs/terraform-release-spec-2026-05-04.md
date: 2026-05-04
tags: [ai/generated, jira/spec-review]
---

# Terraform IaC Release — Spec Challenges

One developer reviewer ran against the spec. No reviewers timed out or were stopped.

### Needs Design Decision

- [x] **1. OIDC federated credential wiring — how does it reference the bootstrap-created SP? (developer)**
  The spec places the OIDC federated credential resource in `infra/shared/`, but the CI/CD service principal it must be attached to is created by the bootstrap script — outside Terraform. This means `infra/shared/` must reference an SP it did not create, requiring the SP's object ID to be passed in as an input variable or resolved via a data source. Neither mechanism is mentioned in the spec. This is a concrete wiring problem that must be resolved before the `infra/shared/` module can be written.

- [x] **2. `azuread_application` admin consent — is `lifecycle { ignore_changes }` required? (developer)**
  The PLATFORM-29 Lessons Learned and the Confluence App Registration Guide both note that Terraform cannot replicate admin consent grants and that a `lifecycle { ignore_changes }` block is required on `azuread_application` to prevent Terraform from stripping portal-applied consent on subsequent applies. The spec flags the `azuread` personal-tenant compatibility risk but does not address this pattern. For the SSO App Registration, which must support a working OAuth login flow to pass the acceptance gate, an unintended consent wipe on re-apply would be a non-obvious failure. The spec should either prescribe the `ignore_changes` pattern or explicitly note that this app has no API permissions requiring admin consent and the pattern is not needed.

### Ready to Fix in Spec

- [x] **3. CI secret-population step ownership is unresolved (developer)**
  The spec describes a CI workflow step that writes secret values from GitHub Secrets to Key Vault via Azure CLI after each `terraform apply`. The existing `ci-test.yml` from PLATFORM-29 has no such step and PLATFORM-3 does not acknowledge modifying it. This creates an unresolved ownership problem: either this story must extend the CI workflow (not currently in scope), or secret population is a manual step run by the developer after apply. The PLATFORM-29 Staging Checklist treats secret population as a manual prerequisite, which is likely the correct approach for this POC. The spec should state clearly which path is intended.

### Process Note

Reviewed by one Developer agent on 2026-05-04.
