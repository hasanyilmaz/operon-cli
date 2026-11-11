# Changelog

## 1.3.1

### Fixed

- Read Operon manifests and Runtime descriptors on Windows when older libuv versions report the same volume serial differently for the path and the open handle. [#26](https://github.com/hasanyilmaz/operon-cli/issues/26)
- Count unresolved apply operations against the recovery quota. Verified successful operations remain recoverable for 24 hours and no longer block new applies. [#28](https://github.com/hasanyilmaz/operon-cli/issues/28)

### Maintenance

- Update the transitive development dependency `brace-expansion` from 5.0.9 to 5.0.12. [PR #31](https://github.com/hasanyilmaz/operon-cli/pull/31)

## 1.3.0

### Added

- Sync the CLI with the Operon 4.6.0 Runtime V1 contracts. File Task lists, details, and Finder show the display title when present, with the filename-based description as a fallback.
- Create File Tasks with `task create file --title`. Operon applies its configured filename rule to new tasks in the configured folder. Typed exact-path creation preserves the supplied path.
- Set or clear a File Task title with `task update --title` or `--clear-title` while preserving its filename, path, and ID.
- Select a device's Obsidian config folder with `setup --config-dir`. Setup saves the selection in the local profile, and `doctor` can check either that selection or an explicit folder. [#17](https://github.com/hasanyilmaz/operon-cli/issues/17)

### Fixed

- Keep Obsidian CLI stdin open until the subprocess exits so apply and recovery can receive their replies on native Linux. [#24](https://github.com/hasanyilmaz/operon-cli/issues/24), [PR #25](https://github.com/hasanyilmaz/operon-cli/pull/25)

### Maintenance

- Update the transitive development dependency `fast-uri` from 3.1.5 to 3.1.9. [PR #27](https://github.com/hasanyilmaz/operon-cli/pull/27)

### Compatibility

- File Task title writes require the capabilities introduced in Operon 4.6.0.
- After saving a profile with `configDir`, use a separate `OPERON_CONFIG_HOME` when running CLI 1.2.0.
