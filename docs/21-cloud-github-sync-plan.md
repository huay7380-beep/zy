# Cloud GitHub Sync Plan

## Purpose

`huay7380-beep/zy` is the cloud source mirror for the local `D:\zhineng`
system. It preserves source code, schemas, documents, process-tree definitions,
stable examples, and governance metadata in GitHub.

## Remote

- Repository: `huay7380-beep/zy`
- URL: `https://github.com/huay7380-beep/zy.git`
- Local clone used for publishing: `D:\zbx\zy`

## Sync Boundary

Versioned in Git:

- source code under `packages/`, `scripts/`, `schemas/`, `docs/`, `examples/`,
  `knowledge/`, `views/`, and registered project modules
- process-tree and Obsidian governance surfaces
- stable templates and sample inputs
- sync manifests that describe excluded local artifacts

Excluded from Git:

- `third_party/**`
- `**/node_modules/**`
- `**/runtime/**`
- `tmp/**`
- `.git/**`
- local `.env*` files
- model weights, installers, binary libraries, generated logs, and caches

## Commands

```powershell
npm.cmd run cloud:sync:manifest
npm.cmd run process-tree:validate
```

## Current External Write Gate

The local mirror can be prepared without external writes. Pushing requires the
local command-line Git credential for `huay7380-beep` to be available. GitHub
Desktop has the repository clone, but PortableGit still needs a usable
credential/token before `git push -u origin main` can complete.

