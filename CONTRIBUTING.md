# Contributing to Operon CLI

Thank you for helping improve Operon CLI. Changes should preserve the
fail-closed boundary between the standalone CLI and Operon's live Runtime.

## Before starting

- Use GitHub private vulnerability reporting for security-sensitive findings.
- Open or reference an issue before proposing a user-visible behavior change.
- Keep changes narrow and do not include vault data, credentials, local paths,
  generated package archives, or unrelated formatting.

## Local validation

The canonical release toolchain is Node.js `24.18.0` with npm `11.12.1`.
Consumer compatibility is also tested on Node.js 22 and 26.

```bash
npm ci
npm test
git diff --check
```

Workflow changes must also pass the fail-closed policy guard:

```bash
node scripts/pull-request-validation.mjs workflow-check
node scripts/hosted-validation.mjs workflow-check
```

## Contract and package boundaries

- Runtime V1 remains canonical in the Operon plugin repository. The checked-in
  snapshot may change only through an explicit, reviewed snapshot refresh.
- Operon CLI is an optional Runtime consumer with an independent development,
  versioning, and release cadence. Plugin work and releases never wait for a
  CLI branch, package, snapshot refresh, or release, and CLI-local work never
  requires a Plugin change or re-release.
- Do not introduce plugin-relative imports, network-dependent build inputs,
  production dependencies, Runtime V2, or a second shared npm package.
- Do not manually edit generated schemas, declarations, manifests, or snapshot
  identities. Use the repository generation checks and explain any intentional
  refresh in the pull request.
- Do not change the package version, package publication boundary, publishing workflow,
  provenance settings, tags, or release metadata in an ordinary contribution.
- Production builds must keep persistent read enabled and frame timing disabled.

## CLI change classification

Choose one primary class using `C3 > C2 > C1 > C0` precedence and list any
secondary class when a change spans boundaries. C3 takes priority for a CLI
public break; C2 takes priority when the Runtime snapshot changes.

- `C0 — CLI Local`: help, completion, profiles, configuration, terminal UX, or
  local storage behavior that does not change Runtime admission. Keep the
  checked-in Runtime snapshot unchanged.
- `C1 — Runtime Facing`: decoder, routing, capability guard, or transport work
  against the existing checked-in Runtime snapshot. Keep that snapshot
  unchanged and validate only the support already claimed by the CLI.
- `C2 — Runtime Catch-up`: explicitly add support for an already integrated or
  released Runtime API or capability. Refresh the snapshot once from that
  immutable provider identity and run the manual `Windows pair validation`
  workflow (`.github/workflows/windows-pair-validation.yml`) with exact
  `plugin_sha` and `cli_sha` inputs.
- `C3 — CLI Breaking`: change the CLI's own public command, output,
  configuration, or local plan-store contract. A CLI major-version decision is
  independent of the Runtime API major.

A newer Runtime capability may remain unsupported by this CLI until a later C2
workstream. Missing capabilities and incompatible Runtime versions must refuse
before mutation; they must never trigger a silent fallback. Historical exact
Plugin–CLI pair evidence remains immutable and manual rather than a normal PR or
Plugin release gate.

## Pull requests

Pull requests target `main`. The public validation workflow runs without
secrets or release artifacts on Ubuntu, macOS, and Windows. External contributor
workflows require maintainer approval before execution.

Describe the C0–C3 classification, behavior change, security and compatibility
impact, tests run, snapshot impact, and whether the canonical npm package
inventory changes. Maintainers may request a full canonical hosted matrix
before accepting release-sensitive work.

Contributions are accepted under the repository's GPL-3.0-or-later license.
