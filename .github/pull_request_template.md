## Summary

Describe the change and why it is needed.

## Risk and compatibility

- Primary CLI change class (`C3 > C2 > C1 > C0` precedence):
- Secondary CLI change class, if any:
- Runtime API, capability, or snapshot impact:
- CLI support impact (current, lagging, incompatible, or unknown):
- CLI command/help or storage/transport impact:
- Windows, macOS, or Linux impact:
- Security boundary impact:

## Validation

- [ ] `npm test`
- [ ] `git diff --check`
- [ ] Relevant focused tests
- [ ] Workflow policy guard, if `.github/workflows/**` changed

## Package boundary

- [ ] No plugin-relative production/build/type import was introduced
- [ ] No production or optional dependency was added
- [ ] Generated contract artifacts are unchanged, or the reviewed refresh is explained
- [ ] C0/C1 changes keep the Runtime snapshot unchanged, or this is an explicit C2 catch-up
- [ ] A primary C3 change lists C2 as secondary if it also refreshes the Runtime snapshot
- [ ] Any C2 snapshot source is an already integrated or released immutable Plugin identity
- [ ] Package version, publication boundary, publish settings, tags, and releases are unchanged
- [ ] No credential, vault content, personal path, or generated package archive is included

## Security reporting

If this pull request contains sensitive vulnerability details, stop and use
GitHub private vulnerability reporting instead.
