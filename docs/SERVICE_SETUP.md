# Focus Quest service setup

This file is the durable baseline for opening and maintaining Focus Quest across Codex, VS Code, Git, and hosting.

## Current baseline

| Area | Expected state |
| --- | --- |
| Service name | Focus Quest |
| Repository | `hoya0328/focus-quest` |
| Default branch | `main` |
| VS Code workspace | `Focus Quest.code-workspace` |
| VS Code extension | Official `openai.chatgpt` extension |
| Application | TypeScript, React, Next.js, Phaser, CSS, PWA |
| Sites project | Existing `.openai/hosting.json` project; preserve its ID |
| GitHub Pages | Existing public demo deployment |

## "서비스 세팅" execution

When the phrase is used:

1. Inspect the project root, package manifest, Git status, remotes, hosting metadata, and existing VS Code settings.
2. Preserve the framework, lockfile, history, remotes, hosting ID, and unrelated changes.
3. Create or repair:
   - `.gitignore`
   - `<Service Name>.code-workspace`
   - `.vscode/settings.json`
   - root `AGENTS.md`
   - essential `docs/` project context
4. Open the named workspace and verify the official Codex extension is active.
5. Parse new configuration files and inspect `git diff --check` and `git status --short`.
6. Fix failed checks and rerun only those checks.
7. Commit setup rules when Git recording was requested. Push only to an already-authorized remote.
8. Report completed, repaired, and unresolved work.

## VS Code view

Keep these areas easy to find:

- `app`: screens, styles, and adventure scene components
- `public`: characters, backgrounds, sprites, and PWA assets
- `lib`: reusable product logic
- `db` and `worker`: server and persistence groundwork
- `tests`: focused automated checks
- `docs`: product decisions and working rules

Hide generated dependencies, caches, build output, temporary archives, internal deployment artifacts, and local tooling folders in Explorer. Hiding never means deleting.

## Working promises

- Announce time and token estimates before substantial work.
- Do not silently stall.
- Stop and retry a hung process instead of waiting indefinitely.
- Minimize validation when requested; avoid unnecessary full-suite runs.
- Preserve user changes and avoid destructive Git operations.
- Keep PC and mobile behavior, animation continuity, and scene-level reward detail in acceptance criteria.
- Do not claim completion without checking the relevant result.
