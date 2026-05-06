---
title: "Terraform Workflow Automation — Plan Manifest"
ticket: PLATFORM-423
date: 2026-05-06
tags: [ai/generated, jira/plan-manifest]
status: plans_complete
plans:
  - slug: terraform-workflow-automation
    file: terraform-workflow-automation-plan-2026-05-06.md
    spec: specs/terraform-workflow-automation-spec-2026-05-06.md
    status: draft
    implement_subtask_key: PLATFORM-431
    depends_on: []
    parallel_with: []
    slot: 1
    bundle_id: null
    worktree: null
    merge_commit: null
    completed_date: null
---

# Terraform Workflow Automation — Plan Manifest

Implementation plan manifest for PLATFORM-423 — covers the single plan that adds the pull_request OIDC credential and the terraform.yml GitHub Actions workflow.

## Ticket Context

PLATFORM-423: Add GitHub Actions workflows to run Terraform plan/apply for infrastructure changes.

Discovery: [[terraform-workflow-automation-discovery]]

## Plan Ordering

One plan. No dependencies. Slot 1.

The plan covers four sequential tasks: (1) add the OIDC federated credential resource in `infra/shared/oidc.tf`, (2) manually apply `infra/shared/` to register the credential in Azure before any PR is opened, (3) set three new GitHub Variables in the repository, and (4) create `.github/workflows/terraform.yml`. Tasks 1 and 4 produce commits; tasks 2 and 3 are manual bootstrap steps with no commit.

## Completion Protocol

When all tasks in a plan are complete, invoke the `plan-completion` skill.
