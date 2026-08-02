# Security Policy

## Supported versions

| Version | Status |
| --- | --- |
| `1.0.7` | Current public npm release; supported until `1.0.8` is published |
| `main` / `1.0.8` candidate | Pre-release source; security reports are accepted |
| Older releases | Unsupported |

Operon CLI communicates with Operon's live Agent Runtime inside Obsidian. The
CLI does not maintain a second task database, but it can read vault-derived
data and submit reviewed mutation plans. Please treat transport, local storage,
vault identity, authorization, plan recovery, and package integrity issues as
security-sensitive.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/hasanyilmaz/operon-cli/security/advisories/new).
Do not open a public issue for a suspected vulnerability.

Include the affected Operon CLI, Operon, Obsidian, Node.js, and operating-system
versions; the security boundary involved; a minimal reproduction; and the
expected impact. Redact task content, vault paths, request payloads,
authentication material, consent records, plan files, and recovery-store
contents.

If private reporting is temporarily unavailable, wait for the repository
security channel to be restored instead of publishing sensitive details.
There is no guaranteed response-time SLA, but valid reports will be reviewed
and coordinated before public disclosure.

## Out of scope

- Public support questions without a security impact
- Vulnerabilities in unsupported Operon CLI releases
- Reports that require publishing real vault contents or credentials
- Social engineering, denial-of-service testing, or destructive testing

Ordinary bugs and platform feedback can use the public issue tracker after all
sensitive data has been removed.
