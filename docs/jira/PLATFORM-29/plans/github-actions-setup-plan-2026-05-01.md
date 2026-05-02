---
title: "GitHub Actions CI/CD Setup — Implementation Plan"
ticket: PLATFORM-29
spec: specs/github-actions-setup-spec-2026-05-01.md
manifest: manifest.md
date: 2026-05-01
tags: [ai/generated, jira/implementation-plan]
tech_stack: ["TypeScript", "NestJS", "Node.js 20", "Next.js", "GitHub Actions", "Docker"]
testing_strategy: tests-exist-and-green
validation_commands:
  - "cd backend && npm test"
  - "cd backend && npm run build"
---

> Automated review identified and resolved 3 issue(s) before this presentation.

# GitHub Actions CI/CD Setup — Implementation Plan

**Goal:** Deliver two GitHub Actions workflows (PR validation and CI deployment), a `GET /health` endpoint on the NestJS API excluded from the global API key guard, and removal of the managed identity exclusion that blocks the deployed application from querying Application Insights.

**Architecture:** The NestJS backend gains a guard-bypass mechanism using the standard NestJS `Reflector` + `SetMetadata` pattern, enabling a `HealthController` to serve `GET /health` publicly while all existing routes remain protected. Two GitHub Actions workflow files are added: `pr.yml` builds both Docker images on every PR to `development` without pushing (catching build failures early), and `ci-test.yml` authenticates to Azure via OIDC, builds and pushes versioned images to ACR, deploys both App Services using `azure/webapps-deploy`, and smoke-tests the running containers. The test-environment-specific naming (`ci-test.yml`, `CI — Build, Push, Deploy to TEST`) parallels the existing `ci-staging.yml` convention so future environment workflows are immediately distinguishable.

**Tech Stack:** TypeScript / NestJS (backend), Next.js (frontend), GitHub Actions YAML, Docker (node:20-alpine), Azure Container Registry, Azure App Service

**Testing Strategy:** Tests exist and green for NestJS code changes (Tasks 2–3); Manual verification for configuration and workflow tasks (Tasks 1, 4–7)

**Validation Commands:**
- `cd backend && npm test`
- `cd backend && npm run build`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/src/decorators/public.decorator.ts` | Create | `@Public()` decorator and `IS_PUBLIC_KEY` constant |
| `backend/src/guards/api-key.guard.ts` | Modify | Inject Reflector; skip check when `@Public()` is present |
| `backend/src/guards/api-key.guard.spec.ts` | Create | Unit tests for guard bypass and API key enforcement |
| `backend/src/health/health.controller.ts` | Create | `GET /health` endpoint returning `{ status: 'ok' }` |
| `backend/src/health/health.controller.spec.ts` | Create | Unit test for health endpoint |
| `backend/src/health/health.module.ts` | Create | NestJS module registering HealthController |
| `backend/src/app.module.ts` | Modify | Import HealthModule |
| `backend/src/appinsights/appinsights.service.ts` | Modify (line 13) | Remove `excludeManagedIdentityCredential: true` |
| `.github/workflows/.gitkeep` | Delete | Replaced by real workflow files |
| `.github/workflows/pr.yml` | Create | Build-only PR validation workflow |
| `.github/workflows/ci-test.yml` | Create | Full CI build, push, deploy, and smoke test workflow targeting the test environment |

---

### Task 1: Configure GitHub repository prerequisites

**Jira Subtasks:** PLATFORM-292 (OIDC variables), PLATFORM-293 (deployment variables), PLATFORM-294 (test environment)

**Files:** None — all steps are performed in GitHub repository settings UI

- [ ] **Step 1: Set OIDC variables**

  In the GitHub repository → Settings → Secrets and variables → Actions → Variables tab, create three repository-level variables:

  | Name | Value |
  |------|-------|
  | `AZURE_CLIENT_ID` | Client ID of `sp-app-insights-explorer-cicd-2` (from Azure portal → App registrations → sp-app-insights-explorer-cicd-2 → Application (client) ID) |
  | `AZURE_TENANT_ID` | Azure AD tenant ID (from Azure portal → Microsoft Entra ID → Overview → Tenant ID) |
  | `AZURE_SUBSCRIPTION_ID` | Azure subscription ID (from Azure portal → Subscriptions) |

- [ ] **Step 2: Set `BACKEND_API_SECRET` secret**

  In Settings → Secrets and variables → Actions → Secrets tab, create one repository-level secret:

  | Name | Value |
  |------|-------|
  | `BACKEND_API_SECRET` | The API secret key used by the frontend to authenticate to the backend (`BACKEND_API_SECRET` from Key Vault in the test environment) |

  Note: This value is baked into the Next.js bundle at Docker build time via the `NEXT_PUBLIC_BACKEND_API_SECRET` build arg. It must match the value the running API validates.

- [ ] **Step 3: Create `test` GitHub Environment**

  In Settings → Environments, click "New environment". Name it `test`. Leave all protection rules unconfigured (no required reviewers, no deployment branches filter). Save.

- [ ] **Step 4: Set deployment variables on the `test` environment**

  Open the `test` environment (Settings → Environments → test). Under "Environment variables", create four variables:

  | Name | Value |
  |------|-------|
  | `ACR_LOGIN_SERVER` | `acrappinsightstest2.azurecr.io` |
  | `RESOURCE_GROUP` | `rg-app-insights-explorer-test-2` |
  | `WEBAPP_FRONTEND` | `aie-web-test-2` |
  | `WEBAPP_API` | `aie-api-test-2` |

  These are scoped to the `test` environment so that when a `staging` environment is added later, it gets its own values with no restructuring required. The `ci-test.yml` deploy job runs under `environment: test`, so GitHub injects these automatically.

- [ ] **Step 5: Verify**

  Expected: Settings → Secrets and variables → Actions shows 3 repo-level variables and 1 secret. Settings → Environments → test shows 4 environment variables.

---

### Task 2: Create `@Public()` decorator and update `ApiKeyGuard`

**Jira Subtasks:** None listed — backend health endpoint prerequisites are implied by PLATFORM-29 directly

**Files:**
- Create: `backend/src/decorators/public.decorator.ts`
- Modify: `backend/src/guards/api-key.guard.ts`
- Create: `backend/src/guards/api-key.guard.spec.ts`

- [ ] **Step 1: Create the `@Public()` decorator**

  Create `backend/src/decorators/public.decorator.ts`:

  ```typescript
  import { SetMetadata } from '@nestjs/common';

  export const IS_PUBLIC_KEY = 'isPublic';
  export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
  ```

- [ ] **Step 2: Update `ApiKeyGuard` to use Reflector**

  Existing `backend/src/guards/api-key.guard.ts`:
  ```typescript
  import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
  import { Request } from 'express';

  @Injectable()
  export class ApiKeyGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest<Request>();
      const apiKey = request.headers['x-api-key'];

      if (!apiKey || apiKey !== process.env.BACKEND_API_SECRET) {
        throw new UnauthorizedException('Invalid or missing API key');
      }

      return true;
    }
  }
  ```

  Replace the entire file with:
  ```typescript
  import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
  import { Reflector } from '@nestjs/core';
  import { Request } from 'express';
  import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

  @Injectable()
  export class ApiKeyGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
      const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (isPublic) return true;

      const request = context.switchToHttp().getRequest<Request>();
      const apiKey = request.headers['x-api-key'] as string;
      if (!apiKey || apiKey !== process.env.BACKEND_API_SECRET) {
        throw new UnauthorizedException('Invalid or missing API key');
      }
      return true;
    }
  }
  ```

- [ ] **Step 3: Write guard unit tests**

  Create `backend/src/guards/api-key.guard.spec.ts`:

  ```typescript
  import { ApiKeyGuard } from './api-key.guard';
  import { Reflector } from '@nestjs/core';
  import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

  describe('ApiKeyGuard', () => {
    let guard: ApiKeyGuard;
    let reflector: Reflector;

    beforeEach(() => {
      reflector = new Reflector();
      guard = new ApiKeyGuard(reflector);
      process.env.BACKEND_API_SECRET = 'test-api-key';
    });

    const mockContext = (apiKey?: string, isPublic = false): ExecutionContext => {
      const handler = jest.fn();
      const classRef = jest.fn();
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(isPublic);
      return {
        switchToHttp: () => ({
          getRequest: () => ({ headers: { 'x-api-key': apiKey } }),
        }),
        getHandler: () => handler,
        getClass: () => classRef,
      } as unknown as ExecutionContext;
    };

    it('allows public routes without an API key', () => {
      const ctx = mockContext(undefined, true);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows requests with the correct API key', () => {
      const ctx = mockContext('test-api-key');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('throws UnauthorizedException for a wrong API key', () => {
      const ctx = mockContext('wrong-key');
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when API key is missing', () => {
      const ctx = mockContext(undefined);
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });
  });
  ```

- [ ] **Step 4: Validate**

  Run from the project root:
  ```
  cd backend && npm test
  ```
  Expected: all tests pass, including the 4 new guard tests.

- [ ] **Step 5: Commit**

  ```
  git commit -m "PLATFORM-29: add @Public() decorator and update ApiKeyGuard to support public routes"
  ```

---

### Task 3: Create `HealthController` and `HealthModule`

**Jira Subtasks:** None listed — implied by PLATFORM-29 (required by PLATFORM-304 smoke test)

**Files:**
- Create: `backend/src/health/health.controller.ts`
- Create: `backend/src/health/health.controller.spec.ts`
- Create: `backend/src/health/health.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Create `HealthController`**

  Create `backend/src/health/health.controller.ts`:

  ```typescript
  import { Controller, Get } from '@nestjs/common';
  import { Public } from '../decorators/public.decorator';

  @Controller()
  export class HealthController {
    @Public()
    @Get('health')
    health(): { status: string } {
      return { status: 'ok' };
    }
  }
  ```

- [ ] **Step 2: Write health controller unit test**

  Create `backend/src/health/health.controller.spec.ts`:

  ```typescript
  import { Test, TestingModule } from '@nestjs/testing';
  import { HealthController } from './health.controller';

  describe('HealthController', () => {
    let controller: HealthController;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [HealthController],
      }).compile();

      controller = module.get<HealthController>(HealthController);
    });

    it('returns status ok', () => {
      expect(controller.health()).toEqual({ status: 'ok' });
    });
  });
  ```

- [ ] **Step 3: Create `HealthModule`**

  Create `backend/src/health/health.module.ts`:

  ```typescript
  import { Module } from '@nestjs/common';
  import { HealthController } from './health.controller';

  @Module({
    controllers: [HealthController],
  })
  export class HealthModule {}
  ```

- [ ] **Step 4: Register `HealthModule` in `AppModule`**

  Existing `backend/src/app.module.ts`:
  ```typescript
  import { Module } from '@nestjs/common';
  import { APP_GUARD } from '@nestjs/core';
  import { ScheduleModule } from '@nestjs/schedule';
  import { AppInsightsModule } from './appinsights/appinsights.module';
  import { AlertingModule } from './alerting/alerting.module';
  import { ApiKeyGuard } from './guards/api-key.guard';

  @Module({
    imports: [ScheduleModule.forRoot(), AppInsightsModule, AlertingModule],
    providers: [{ provide: APP_GUARD, useClass: ApiKeyGuard }],
  })
  export class AppModule {}
  ```

  Replace with:
  ```typescript
  import { Module } from '@nestjs/common';
  import { APP_GUARD } from '@nestjs/core';
  import { ScheduleModule } from '@nestjs/schedule';
  import { AppInsightsModule } from './appinsights/appinsights.module';
  import { AlertingModule } from './alerting/alerting.module';
  import { HealthModule } from './health/health.module';
  import { ApiKeyGuard } from './guards/api-key.guard';

  @Module({
    imports: [ScheduleModule.forRoot(), AppInsightsModule, AlertingModule, HealthModule],
    providers: [{ provide: APP_GUARD, useClass: ApiKeyGuard }],
  })
  export class AppModule {}
  ```

- [ ] **Step 5: Validate**

  Run from the project root:
  ```
  cd backend && npm test
  ```
  Expected: all tests pass, including the new `HealthController` test.

  Then confirm the build compiles:
  ```
  cd backend && npm run build
  ```
  Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

  ```
  git commit -m "PLATFORM-29: add GET /health endpoint excluded from ApiKeyGuard"
  ```

---

### Task 4: Remove `excludeManagedIdentityCredential` from `DefaultAzureCredential`

**Jira Subtasks:** None listed — implied by PLATFORM-29 (blocker for deployed application)

**Files:**
- Modify: `backend/src/appinsights/appinsights.service.ts` (line 13)

- [ ] **Step 1: Remove the exclusion**

  Existing `backend/src/appinsights/appinsights.service.ts` constructor (lines 10–16):
  ```typescript
    constructor() {
      const credential = new DefaultAzureCredential({
        excludeEnvironmentCredential: true,
        excludeManagedIdentityCredential: true,
        excludeAzurePowerShellCredential: true,
      } as DefaultAzureCredentialOptions);
      this.client = new LogsQueryClient(credential);
    }
  ```

  Remove line 13 only. Result:
  ```typescript
    constructor() {
      const credential = new DefaultAzureCredential({
        excludeEnvironmentCredential: true,
        excludeAzurePowerShellCredential: true,
      } as DefaultAzureCredentialOptions);
      this.client = new LogsQueryClient(credential);
    }
  ```

- [ ] **Step 2: Validate build**

  ```
  cd backend && npm run build
  ```
  Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

  ```
  git commit -m "PLATFORM-29: enable managed identity credential in DefaultAzureCredential"
  ```

---

### Task 5: Create `pr.yml` PR validation workflow

**Jira Subtasks:** PLATFORM-291 (remove legacy files), PLATFORM-295 (pr.yml skeleton), PLATFORM-296 (frontend build step), PLATFORM-297 (API build step)

**Files:**
- Delete: `.github/workflows/.gitkeep`
- Create: `.github/workflows/pr.yml`

- [ ] **Step 1: Delete `.gitkeep`**

  Delete the file `.github/workflows/.gitkeep`.

- [ ] **Step 2: Create `pr.yml`**

  Create `.github/workflows/pr.yml`:

  ```yaml
  name: PR Validation

  on:
    pull_request:
      branches:
        - development

  jobs:
    build:
      name: Build Docker images
      runs-on: ubuntu-latest

      steps:
        - name: Checkout code
          uses: actions/checkout@v4

        - name: Set up Docker Buildx
          uses: docker/setup-buildx-action@v3

        - name: Build frontend Docker image (no push)
          uses: docker/build-push-action@v5
          with:
            context: ./frontend
            file: ./frontend/Dockerfile
            push: false
            tags: app-insights-explorer-frontend:pr
            build-args: |
              NEXT_PUBLIC_API_URL=http://localhost:3001

        - name: Build API Docker image (no push)
          uses: docker/build-push-action@v5
          with:
            context: ./backend
            file: ./backend/Dockerfile
            push: false
            tags: app-insights-explorer-api:pr
  ```

- [ ] **Step 3: Commit**

  ```
  git commit -m "PLATFORM-29: add pr.yml PR validation workflow"
  ```

---

### Task 6: Create `ci-test.yml` CI deployment workflow

**Jira Subtasks:** PLATFORM-298 (ci-test.yml skeleton), PLATFORM-299 (OIDC login), PLATFORM-300 (frontend ACR push), PLATFORM-301 (API ACR push), PLATFORM-302 (frontend App Service deploy), PLATFORM-303 (API App Service deploy), PLATFORM-304 (smoke test)

**Files:**
- Create: `.github/workflows/ci-test.yml`

- [ ] **Step 1: Create `ci-test.yml`**

  Create `.github/workflows/ci-test.yml`:

  ```yaml
  name: CI — Build, Push, Deploy to TEST

  on:
    push:
      branches:
        - development

  permissions:
    id-token: write
    contents: read

  env:
    IMAGE_FRONTEND: app-insights-explorer-frontend
    IMAGE_API: app-insights-explorer-api

  jobs:
    build-and-push:
      name: Build and push Docker images to ACR
      runs-on: ubuntu-latest

      outputs:
        short_sha: ${{ steps.sha.outputs.short_sha }}

      steps:
        - name: Checkout code
          uses: actions/checkout@v4

        - name: Compute short git SHA
          id: sha
          run: echo "short_sha=$(git rev-parse --short HEAD)" >> "$GITHUB_OUTPUT"

        - name: Log in to Azure via OIDC
          uses: azure/login@v2
          with:
            client-id: ${{ vars.AZURE_CLIENT_ID }}
            tenant-id: ${{ vars.AZURE_TENANT_ID }}
            subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}

        - name: Log in to Azure Container Registry
          run: az acr login --name ${{ vars.ACR_LOGIN_SERVER }}

        - name: Set up Docker Buildx
          uses: docker/setup-buildx-action@v3

        - name: Build and push frontend image
          uses: docker/build-push-action@v5
          with:
            context: ./frontend
            file: ./frontend/Dockerfile
            push: true
            tags: |
              ${{ vars.ACR_LOGIN_SERVER }}/${{ env.IMAGE_FRONTEND }}:latest
              ${{ vars.ACR_LOGIN_SERVER }}/${{ env.IMAGE_FRONTEND }}:${{ steps.sha.outputs.short_sha }}
            build-args: |
              NEXT_PUBLIC_API_URL=https://${{ vars.WEBAPP_API }}.azurewebsites.net
              NEXT_PUBLIC_BACKEND_API_SECRET=${{ secrets.BACKEND_API_SECRET }}

        - name: Build and push API image
          uses: docker/build-push-action@v5
          with:
            context: ./backend
            file: ./backend/Dockerfile
            push: true
            tags: |
              ${{ vars.ACR_LOGIN_SERVER }}/${{ env.IMAGE_API }}:latest
              ${{ vars.ACR_LOGIN_SERVER }}/${{ env.IMAGE_API }}:${{ steps.sha.outputs.short_sha }}

    deploy:
      name: Deploy to test App Service
      runs-on: ubuntu-latest
      needs: build-and-push
      environment: test

      steps:
        - name: Log in to Azure via OIDC
          uses: azure/login@v2
          with:
            client-id: ${{ vars.AZURE_CLIENT_ID }}
            tenant-id: ${{ vars.AZURE_TENANT_ID }}
            subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}

        - name: Deploy frontend to App Service
          uses: azure/webapps-deploy@v3
          with:
            app-name: ${{ vars.WEBAPP_FRONTEND }}
            images: ${{ vars.ACR_LOGIN_SERVER }}/${{ env.IMAGE_FRONTEND }}:${{ needs.build-and-push.outputs.short_sha }}

        - name: Deploy API to App Service
          uses: azure/webapps-deploy@v3
          with:
            app-name: ${{ vars.WEBAPP_API }}
            images: ${{ vars.ACR_LOGIN_SERVER }}/${{ env.IMAGE_API }}:${{ needs.build-and-push.outputs.short_sha }}

        - name: Wait for App Services to start
          run: sleep 60

        - name: Smoke test — API health endpoint
          run: |
            curl --fail \
              --retry 5 \
              --retry-delay 15 \
              --retry-connrefused \
              --retry-all-errors \
              https://${{ vars.WEBAPP_API }}.azurewebsites.net/health

        - name: Smoke test — Frontend
          run: |
            status=$(curl \
              --retry 5 \
              --retry-delay 15 \
              --retry-connrefused \
              --retry-all-errors \
              --write-out "%{http_code}" \
              --silent \
              --output /dev/null \
              https://${{ vars.WEBAPP_FRONTEND }}.azurewebsites.net) || exit 1
            if [ "$status" -ge 500 ]; then
              echo "Frontend returned HTTP $status — smoke test failed"
              exit 1
            fi
            echo "Frontend returned HTTP $status — smoke test passed"
  ```

  Note: `az acr login --name` accepts both the registry name (`acrappinsightstest2`) and the full login server URL (`acrappinsightstest2.azurecr.io`). The `ACR_LOGIN_SERVER` variable stores the full URL. If the `az acr login` step fails with an invalid registry name error, strip the `.azurecr.io` suffix: `az acr login --name $(echo "${{ vars.ACR_LOGIN_SERVER }}" | sed 's/\.azurecr\.io//')`.

- [ ] **Step 2: Commit**

  ```
  git commit -m "PLATFORM-29: add ci-test.yml CI/CD deployment workflow for test environment"
  ```

---

### Task 7: Validate workflows end-to-end

**Jira Subtasks:** PLATFORM-305 (validate PR workflow), PLATFORM-306 (validate CI workflow)

**Files:** None — validation only

- [ ] **Step 1: Push the feature branch to GitHub**

  ```
  git push origin HEAD
  ```

- [ ] **Step 2: Validate `pr.yml` (PLATFORM-305)**

  Open a PR from the feature branch targeting `development` on GitHub. Expected:
  - The `PR Validation` workflow triggers
  - Both Docker build steps complete successfully (no push)
  - Workflow status shows green ✓

- [ ] **Step 3: Merge the PR and validate `ci-test.yml` (PLATFORM-306)**

  Merge the PR to `development`. Expected:
  - The `CI — Build, Push, Deploy to TEST` workflow triggers
  - `build-and-push` job: both images pushed to ACR with `:latest` and `:{short-sha}` tags
  - `deploy` job: both App Services updated; deployment visible in the `test` GitHub Environment history
  - Smoke test — API: `GET https://aie-api-test-2.azurewebsites.net/health` returns HTTP 200
  - Smoke test — Frontend: `GET https://aie-web-test-2.azurewebsites.net` returns a non-5xx status (200 or 302)
  - Workflow status shows green ✓

- [ ] **Step 4: Verify deployed application**

  Open `https://aie-web-test-2.azurewebsites.net` in a browser. Expected: the App Insights Explorer UI loads (or redirects to login). Confirm that the frontend can reach the API by selecting an environment and running a query.

---

### Lessons Learned — End-to-End Validation

These gaps were discovered during the first successful end-to-end run and are documented here so future environment setups (staging, production) don't repeat them.

#### 1. NextAuth v5 renamed the Azure AD provider — update redirect URIs accordingly

NextAuth v4 used `azure-ad` as the provider ID; NextAuth v5 renamed it to `microsoft-entra-id`. The callback path NextAuth sends in the OAuth redirect request is:

```
/api/auth/callback/microsoft-entra-id
```

Any App Registration redirect URI using the old `azure-ad` suffix will produce `AADSTS50011` and block login entirely. This is easy to miss because the old URI is syntactically valid — Azure accepts it, it just never matches.

**Fix:** In the App Registration → Authentication → Redirect URIs, ensure the value is:
```
https://<app-hostname>/api/auth/callback/microsoft-entra-id
```

Not `azure-ad`. Not `azuread`. `microsoft-entra-id`.

#### 2. Every runtime env var needs both a Key Vault secret AND an App Service app setting

Secrets added to Key Vault are invisible to the App Service unless there is a corresponding app setting that references them. The pattern is:

| App setting name | App setting value |
|---|---|
| `AppRegistrationTenantId` | `@Microsoft.KeyVault(VaultName=kv-aie-test-2;SecretName=AppRegistrationTenantId)` |

During this setup, `AppRegistrationTenantId` was added to Key Vault but the matching app setting was never created. The app launched, KV references for the other three settings resolved fine, and the error only surfaced at OAuth callback time — making it harder to connect the symptom to the cause.

**Fix for future environments:** treat Key Vault and App Settings as a pair. When adding a secret to KV, immediately add the matching `@Microsoft.KeyVault(...)` app setting. Use the portal Configuration blade as the checklist — every secret the app reads at runtime must appear there with a green status icon.

#### 3. Stop/start (not restart) forces Key Vault reference re-evaluation

After a role assignment change, App Service may show red Key Vault reference icons even after a restart. A full `stop` followed by `start` clears the cached resolution state and forces a fresh evaluation. This is not a permissions issue — it is a stale cache. Allow 2-3 minutes after `start` before checking the portal.

#### 4. `NEXT_PUBLIC_*` variables must be Docker build args — App Service app settings have no effect

Next.js replaces `NEXT_PUBLIC_*` variables with literal string values at Webpack build time. By the time the container runs on App Service, the bundle is already compiled. Setting a `NEXT_PUBLIC_*` app setting (including a Key Vault reference) on the App Service does nothing — the running app reads the value baked in at image build time.

**Fix:** Pass every `NEXT_PUBLIC_*` variable as a `build-args` entry in the `docker/build-push-action` step. For secrets, source them from GitHub Actions secrets (`${{ secrets.NAME }}`); for URLs, source from variables (`${{ vars.NAME }}`).

#### 5. GitHub Actions environment-level variables are only available to jobs that declare `environment:`

A job without `environment: <name>` cannot read `vars.*` scoped to that environment — the variable resolves to an empty string with no error. This bit us with `vars.WEBAPP_API` in the `build-and-push` job: the frontend image was built with a blank API URL because only the `deploy` job declared `environment: test`.

**Fix:** Any job that reads environment-level variables must declare `environment: <name>`. For `ci-test.yml` this means both `build-and-push` and `deploy` carry `environment: test`. This also applies when adding staging/production environments — each environment's build job must declare its own environment name.

---

### Final: Close-out

This plan is not complete until the close-out protocol in `manifest.md` has been followed. Do not mark this plan as complete without completing close-out.
