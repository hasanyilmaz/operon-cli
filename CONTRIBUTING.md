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
- Do not introduce plugin-relative imports, network-dependent build inputs,
  production dependencies, Runtime V2, or a second shared npm package.
- Do not manually edit generated schemas, declarations, manifests, or snapshot
  identities. Use the repository generation checks and explain any intentional
  refresh in the pull request.
- Do not change the package version, package publication boundary, publishing workflow,
  provenance settings, tags, or release metadata in an ordinary contribution.
- Production builds must keep persistent read enabled and frame timing disabled.

## Pull requests

Pull requests target `main`. The public validation workflow runs without
secrets or release artifacts on Ubuntu, macOS, and Windows. External contributor
workflows require maintainer approval before execution.

Describe the behavior change, security and compatibility impact, tests run, and
whether the 41-entry npm package inventory changes. Maintainers may request a
full canonical hosted matrix before accepting release-sensitive work.

Contributions are accepted under the repository's GPL-3.0-or-later license.
