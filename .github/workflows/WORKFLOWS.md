# GitHub Actions Workflows Documentation

This document explains each workflow defined in `.github/workflows/`, the reasoning behind them, and the steps required to pass all checks.

---

## Table of Contents

- [Overview](#overview)
- [Workflows](#workflows)
  - [CI — Continuous Integration (`ci.yml`)](#ci--continuous-integration-ciyml)
  - [PR Title Check (`pr-title-check.yml`)](#pr-title-check-pr-title-checkyml)
  - [PR Label Check (`pr-label-check.yml`)](#pr-label-check-pr-label-checkyml)
  - [Release on Merge (`release.yml`)](#release-on-merge-releaseyml)
- [Getting All Green Checks](#getting-all-green-checks)
- [Workflow Interaction Diagram](#workflow-interaction-diagram)

---

## Overview

The workflows in this repository enforce code quality, consistent pull request conventions, and an automated release process. Together they form a full CI/CD pipeline that:

1. Keeps the codebase healthy on every push or PR (linting, type-checking, tests, build).
2. Enforces naming and labelling conventions so PRs carry enough information for automated releases.
3. Automatically bumps the version and publishes a GitHub Release whenever a PR is merged into `main`.

---

## Workflows

### CI — Continuous Integration (`ci.yml`)

**Triggers:** Every push to `main` and every pull request.

**Why it exists:** This is the core quality gate. It prevents broken, type-unsafe, or untested code from landing in the repository.

**Concurrency:** Only one CI run per branch is active at a time; new pushes cancel previous in-progress runs to save runner minutes.

| Job | Command | What it checks |
|---|---|---|
| `lint` | `npm run lint` (ESLint) | Code style and potential errors |
| `typecheck` | `npx tsc --noEmit` | TypeScript type correctness |
| `test` | `npm run test` (Jest) | Unit tests |
| `build` | `npm run build` (Next.js) | Production build succeeds |
| `validate-tags` | Custom shell script | All local Git tags are pushed to remote |

The `build` job caches the `.next/cache` directory keyed by `package-lock.json` and source files, so subsequent builds are faster.

The `validate-tags` job ensures that no local-only Git tags exist that could cause version conflicts with the [Release workflow](#release-on-merge-releaseyml).

---

### PR Title Check (`pr-title-check.yml`)

**Triggers:** When a pull request is opened, edited, synchronised, or reopened.

**Why it exists:** A consistent PR title format allows automated tooling (changelogs, release notes, traceability) to link every change back to a ticket. It also keeps the Git history readable.

**Required format:**

```
[TICKET-123]: Description starting with an uppercase or lowercase letter
```

**Rules:**
- Must start with `[`
- Followed by one or more letters (project key, e.g. `MSI`)
- Then a hyphen `-` and one or more digits (ticket number)
- Then `]:` (closing bracket and colon)
- Then a single space
- Then a description beginning with an alphabetic character

**Valid examples:**
```
[MSI-42]: Add user authentication
[PROJ-1]: Fix crash on startup
```

**Invalid examples:**
```
Fix bug                        # no ticket reference
[MSI-42] Add something         # missing colon after bracket
[MSI-]: Some text              # missing ticket number
[123-MSI]: Some text           # letters and numbers reversed
```

---

### PR Label Check (`pr-label-check.yml`)

**Triggers:** When a pull request is opened, edited, synchronised, reopened, labelled, or unlabelled.

**Why it exists:** The [Release workflow](#release-on-merge-releaseyml) reads the PR label to decide how to bump the semantic version. Without a valid label, the release cannot proceed deterministically.

**Required — at least one of these labels must be applied:**

| Label | Meaning | Version bump |
|---|---|---|
| `major` | Breaking change | `1.0.0` → `2.0.0` |
| `minor` | New feature, backward-compatible | `1.0.0` → `1.1.0` |
| `patch` | Small backward-compatible fix | `1.0.0` → `1.0.1` |
| `bug` | Bug fix (treated as `patch`) | `1.0.0` → `1.0.1` |
| `same version` | No release needed | No bump, release skipped |

---

### Release on Merge (`release.yml`)

**Triggers:** When a pull request targeting `main` is **closed and merged**.

**Why it exists:** Releases are fully automated so the team never manually edits `package.json` version strings, creates tags, or writes release notes. Every merged PR either bumps the version or explicitly opts out via the `same version` label.

**What it does (in order):**

1. **Determines bump type** — reads the PR label (`major`, `minor`, `patch`/`bug`, or `same version`).
2. **Skips** all remaining steps if the label is `same version`.
3. **Configures Git** identity for the bot commit.
4. **Bumps the version** in `package.json` (and `package-lock.json` if present) using `npm version`.
5. **Commits, tags, and pushes** — commits the version bump with the message `chore(release): vX.Y.Z [skip ci]`, rebases on the latest `main` to avoid race conditions, then pushes the commit and the new Git tag.
6. **Creates a GitHub Release** using `gh release create --generate-notes`, which auto-generates release notes from merged PR titles and commit messages.

**Required secret:** `PAT_TOKEN` — a GitHub Personal Access Token with `contents: write` permission, stored as a repository secret. This is needed because the default `GITHUB_TOKEN` cannot push commits that trigger further workflows.

---

## Getting All Green Checks

Follow these steps in order before opening or updating a pull request:

### 1. Fix linting errors

```bash
npm ci
npm run lint
```

Resolve every ESLint error reported. Warnings will not fail the job, but errors will.

### 2. Fix TypeScript errors

```bash
npx tsc --noEmit
```

Ensure there are zero type errors. The job runs with the settings in `tsconfig.json`.

### 3. Pass all tests

```bash
npm run test
```

All Jest tests in `__tests__/` must pass. Add or update tests if you change behaviour.

### 4. Ensure the production build succeeds

```bash
npm run build
```

Fix any build errors (missing environment variables, broken imports, etc.).

### 5. Push all local Git tags to remote

```bash
git push origin --tags
```

The `validate-tags` job fails if any local tag is not present on the remote. Run this before pushing your branch.

### 6. Format the PR title correctly

When opening (or editing) the pull request, set the title to:

```
[TICKET-123]: Your description here
```

Replace `TICKET-123` with the actual project key and issue number (e.g. `MSI-47`).

### 7. Apply a release label

In the GitHub UI (or via the API), apply **exactly one** of the following labels to the PR:

| Scenario | Label to apply |
|---|---|
| Breaking / incompatible API change | `major` |
| New feature, no breaking change | `minor` |
| Bug fix or small patch | `patch` or `bug` |
| Chore / docs / no release needed | `same version` |

Once all seven steps are complete, all workflow checks should show a ✅.

> **Note:** The Release workflow only runs after the PR is merged. It does not appear as a required check on the PR itself, so green checks on the PR guarantee a successful release once merged — provided `PAT_TOKEN` is configured as a repository secret.

---

## Workflow Interaction Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    Pull Request opened                    │
└───────────────────────────┬──────────────────────────────┘
                            │
          ┌─────────────────┼──────────────────┐
          ▼                 ▼                  ▼
  ┌───────────────┐ ┌──────────────┐ ┌────────────────────┐
  │  CI workflow  │ │ PR Title     │ │  PR Label Check    │
  │               │ │ Check        │ │                    │
  │ • lint        │ │              │ │ Requires one of:   │
  │ • typecheck   │ │ [KEY-123]:   │ │ major / minor /    │
  │ • test        │ │  Description │ │ patch / bug /      │
  │ • build       │ │              │ │ same version       │
  │ • validate    │ └──────────────┘ └────────────────────┘
  │   tags        │
  └───────────────┘
                            │
          ┌─────────────────▼──────────────────┐
          │           PR merged to main         │
          └─────────────────┬──────────────────┘
                            ▼
                  ┌─────────────────┐
                  │ Release on Merge│
                  │                 │
                  │ 1. Read label   │
                  │ 2. npm version  │
                  │ 3. Commit & tag │
                  │ 4. Push to main │
                  │ 5. GitHub       │
                  │    Release      │
                  └─────────────────┘
```

