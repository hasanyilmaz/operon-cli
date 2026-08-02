## Summary

Describe the change and why it is needed.

## Risk and compatibility

- Runtime V1 or snapshot impact:
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
- [ ] Package version, `private` flag, publish settings, tags, and releases are unchanged
- [ ] No credential, vault content, personal path, or generated package archive is included

## Security reporting

If this pull request contains sensitive vulnerability details, stop and use
GitHub private vulnerability reporting instead.
