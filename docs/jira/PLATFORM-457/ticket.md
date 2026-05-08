---
ticket: PLATFORM-457
fetched: 2026-05-08T17:45:00Z
jira_updated: 2026-05-08T17:14:30Z
---

# GitHub Actions: Reusable Deploy Workflow with SHA Promotion

**Summary:** GitHub Actions: reusable deploy workflow with SHA promotion
**Status:** Created (To Do)
**Priority:** Medium
**Type:** Sub-task
**Parent:** PLATFORM-453 — Refactor IaC and CI/CD Pipeline for Environment Promotion
**Assignee:** Goulart, Frank
**Reporter:** Goulart, Frank
**Created:** 2026-05-08
**Updated:** 2026-05-08
**Labels:** (none)
**Sprint:** (none)
**Components:** (none)

## Description

Extract the deploy logic from ci.yml into a reusable _deploy.yml workflow (triggered by workflow_call, accepts environment name as input). Add environment-specific caller workflows for staging and production. Implement the build-once model: the Docker image is built and tagged with the git SHA on push to development, and that exact tag is promoted through environments without rebuilding.

## Acceptance Criteria

(None explicitly stated — derived from description)

- `_deploy.yml` is a reusable workflow triggered by `workflow_call` that accepts environment name as an input
- Environment-specific caller workflows exist for staging and production
- Docker image is built once, tagged with the git SHA, and the same tag is promoted through environments without rebuilding

## Linked Issues

(None)

## Subtasks

(None)

## Comments

(None)

## Attachments

(None)
