---
title: "Terraform Module Extraction and Environment Roots — Spec Challenges"
ticket: PLATFORM-456
slug: terraform-module-extract
spec: specs/terraform-module-extract-spec-2026-05-08.md
date: 2026-05-08
tags: [ai/generated, jira/spec-review]
---

# Terraform Module Extraction and Environment Roots — Spec Challenges

> [!done] All items addressed.

Developer and senior developer reviews completed. No timeouts or kills.

## Needs Design Decision

- [x] **1. Backend storage containers for staging/prod — who creates them? (developer)**
  The spec lists Azure Storage tfstate containers for staging and production as a dependency but assigns no owner and provides no path to resolution. If the containers don't exist when a developer runs `terraform init` on the new env roots, init fails silently. This needs to be decided: do they live in bootstrap scripting, in `infra/shared/`, or are they created manually? The answer should be noted in the spec's Technical Dependencies section.

- [x] **2. SKU single variable — per-app override support (senior developer)**
  Exposing one SKU variable with a shared default embeds the assumption that the frontend and API App Services always scale together. When production needs different SKUs, scaling rules, or App Service plans per app, the module either accumulates conditional complexity or gets forked — either of which requires another state migration while production is live. The spec should state whether the module is intentionally designed for single-plan environments only, or whether per-app plan separation is in scope.

## Ready to Fix in Spec

- [x] **3. State migration scope unquantified (developer)**
  The spec acknowledges that `terraform state mv` is required for the test environment but does not enumerate which resources need remapping or define a verification step. A partial migration silently queues resource destruction on the next apply with no error signal until it's too late. The spec should either enumerate the expected resource addresses or add an explicit constraint that a pre-apply migration checklist must be produced and verified before `terraform apply` is run against the refactored test configuration.

- [x] **4. KV reference no-version-pin constraint unspecified (developer)**
  The spec flags preserving no-version-pin behavior as a risk but adds no constraint to guarantee it. Key Vault reference strings constructed from a resource's `vault_uri` output are easy to accidentally version-pin depending on how the URI is interpolated. If versioned URIs are generated, App Service silently pins to the current secret version and stops rotating — a correctness failure with no error signal. The spec should add an explicit constraint: KV reference strings must not include a secret version identifier.

- [x] **5. Module output surface drift during deferred-apply window (senior developer)**
  Staging and production env roots are committed now but not applied until PLATFORM-457 completes. If the module adds outputs between now and first apply, the env roots will be referencing a stale module interface with no apply to surface the mismatch. The spec should address how env root/module sync is maintained during the deferred-apply period — at minimum a note that env roots must be reviewed against the module's current output surface before first apply.

## Process Note

Inline self-review passed. Developer and senior developer background reviews completed; one speculative structural concern (cross-environment resource name referencing) was filtered as out of scope for this feature.
