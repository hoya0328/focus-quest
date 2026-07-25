# Focus Quest project instructions

## Service setup trigger

- When the user says **"서비스 세팅"**, use `$service-setup`.
- Execute the complete audit → repair → verification flow. Do not stop at instructions.
- Before substantial work, report estimated elapsed time and approximate token share.
- Report completed, repaired, and unresolved items with evidence.

## Communication and continuity

- Never wait silently during tool work. Send a concise update within 60 seconds.
- If a process hangs, stop the exact process and retry once with a bounded alternative.
- Preserve finished work across tasks through checked-in documentation, not long chat history.
- Ask only when a missing choice would materially change the product or authorize an external or destructive action.

## Git

- Inspect `git status --short` before editing.
- Preserve unrelated user changes and existing history.
- Never use destructive reset or checkout commands unless explicitly requested.
- Keep secrets, environment files, dependencies, caches, generated builds, logs, and archives out of Git.
- Use concise English commit messages describing the outcome.
- Push only to an existing authorized remote. Do not create a public repository without explicit authorization.

## VS Code

- Keep a service-named `.code-workspace` file and open the project through it.
- Keep `.vscode/settings.json` configured so the Explorer emphasizes working source files.
- Hide generated clutter without deleting or physically moving files.
- Keep the official Codex extension available for editor-attached work.

## Focus Quest architecture

- Preserve TypeScript, React, Next.js, Phaser, CSS, PWA, package manager, and lockfile unless an architecture change is explicitly approved.
- Use Phaser for animated adventure scenes and CSS for normal application UI.
- Keep PC and mobile layouts responsive.
- Keep success events inside the active scene. Avoid rectangular sprite clipping and disconnected character, path, tool, or destination positions.
- Use original Focus Quest art direction; references may guide mood but must not be copied.

## Validation and deployment

- Match validation effort to risk. Do not run the full suite when a focused check is sufficient or the user asked to minimize testing.
- For setup-only changes, validate configuration syntax, workspace activation, Git diff, and status.
- Preserve `.openai/hosting.json` and its project ID exactly.
- Use Sites tooling for this hosted project. Deploy only when publication is part of the request.
- When publishing, push the exact validated source state before saving and deploying a version.

See `docs/SERVICE_SETUP.md` for the current baseline and verification checklist.
