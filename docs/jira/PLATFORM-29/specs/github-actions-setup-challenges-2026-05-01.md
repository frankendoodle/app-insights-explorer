---
title: "GitHub Actions CI/CD Setup — Spec Challenges"
ticket: PLATFORM-29
slug: github-actions-setup
spec: specs/github-actions-setup-spec-2026-05-01.md
date: 2026-05-01
tags: [ai/generated, jira/spec-review]
---

# GitHub Actions CI/CD Setup — Spec Challenges

> [!done] All items addressed.

Developer reviewer assessed the spec. All three items surfaced are now resolved.

## Ready to Fix in Spec

- [x] **1. OIDC scope — future Azure steps in pr.yml would require a separate federated credential (developer)**
  The spec did not note that the existing OIDC federated credential (scoped to the `development` branch) will not authorize pull request workflow runs. The PR workflow currently needs no Azure access, so this is not a current gap — but it is useful context for future maintainers. Added a note to Section 5 (OIDC design decision) and Section 7 (risks) explaining that if Azure steps are ever added to pr.yml, a separate federated credential scoped to pull request events would be required.

- [x] **2. Smoke test retry logic unspecified (developer)**
  Section 7 noted the cold start problem but provided no definition of retry count, wait duration, or failure threshold — leaving the implementer with no basis for choosing between a fixed sleep and a polling loop. Resolved by specifying a concrete strategy in Section 7: 60-second initial wait after the deploy step completes (covers median B1 cold start), followed by curl with up to 5 retries and a 15-second delay between attempts.

- [x] **3. Frontend smoke test outcome unresolved (developer)**
  Section 7 named three mutually exclusive options for the frontend smoke test (accept 302, target a non-authenticated route, omit check) without selecting one. Resolved by decision: accept any non-5xx response (HTTP 200 or 302) from the frontend root URL as a passing result. This treats a redirect to the login page as confirmation that the server is alive and routing correctly.

## Process Note

Spec reviewed by one developer agent on 2026-05-01. All items were in the "Ready to Fix" category — no design decisions required escalation to story owner.
