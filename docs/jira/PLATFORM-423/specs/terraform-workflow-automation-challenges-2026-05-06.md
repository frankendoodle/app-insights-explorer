---
title: "Terraform Workflow Automation — Spec Challenges"
ticket: PLATFORM-423
slug: terraform-workflow-automation
spec: specs/terraform-workflow-automation-spec-2026-05-06.md
date: 2026-05-06
tags: [ai/generated, jira/spec-review]
---

# Terraform Workflow Automation — Spec Challenges

> [!done] All items addressed.

Developer review ran. 5 items found — 4 required a design decision, 1 was a clear spec fix. All resolved.

## Needs Design Decision

- [x] **1. OIDC subject string for the plan job is unspecified (developer)**
  Resolved: subject string is `repo:frankendoodle/app-insights-explorer:pull_request`. Added explicitly to the Key Design Decisions section and Technical Dependencies.

- [x] **2. OIDC credential bootstrap catch-22 (developer)**
  Resolved: documented as a numbered prerequisite in Technical Dependencies — the credential must be applied manually once before the automated workflow can be used for the first time.

- [x] **3. Apply job runs both modules on every infra push regardless of which module changed (developer)**
  Resolved: accepted trade-off. Both modules always apply on any `infra/**` trigger. Documented as an explicit design decision with rationale in Key Design Decisions.

- [x] **4. CICD_SP_OBJECT_ID stored as GitHub Variable controls a privileged RBAC assignment (developer)**
  Resolved: explicit decision to use Variable documented in Technical Concerns & Risks. Object ID is a public identifier; Azure RBAC is the actual security boundary.

## Ready to Fix in Spec

- [x] **5. Plan output truncation has no defined fallback (developer)**
  Resolved: fallback defined as artifact-only. When plan output exceeds the GitHub comment size limit, the full plan is uploaded as a workflow artifact and the PR comment contains a link to the Actions run. Updated in Technical Scope and Technical Concerns & Risks.

## Process Note

Reviewed by developer role only; spec complexity (5 design decisions) triggered this review.
