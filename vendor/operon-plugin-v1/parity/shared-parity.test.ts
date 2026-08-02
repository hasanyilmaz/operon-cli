import assert from 'node:assert/strict';

import {
	canonicalizeReminderRuleList,
	parseAbsoluteReminder,
	parseReminderOffsetInput,
	parseReminderRule,
	resolveReminderRule,
} from '../src/core/reminder-rules';
import {
	parseRepeatRule,
	serializeRepeatRule,
} from '../src/core/repeat-rule';
import {
	isCanonicalPathWithinRootV1,
	normalizeCanonicalVaultPathForIdentityV1,
} from '../src/agent-runtime/transport/vault-path-identity';
import {
	compareOperonVersions,
	isValidOperonVersion,
} from '../../../src/semver';

for (const anchor of [
	'datetimeStart',
	'datetimeEnd',
	'dateStarted',
	'dateScheduled',
	'dateDue',
]) {
	const parsed = parseReminderRule(`${anchor}.1d2h30m`);
	assert.equal(parsed.ok, true);
	if (parsed.ok) assert.equal(parsed.value.canonical, `${anchor}.1d2h30m`);
}
assert.deepEqual(parseReminderOffsetInput('1w 2d 3h 4m'), {
	ok: true,
	value: { calendarDays: 9, clockMinutes: 184, canonical: '1w2d3h4m' },
});
assert.deepEqual(parseReminderOffsetInput('0m'), {
	ok: true,
	value: { calendarDays: 0, clockMinutes: 0, canonical: '0m' },
});
assert.deepEqual(parseReminderRule('dateDue.1h60m'), {
	ok: true,
	value: {
		raw: 'dateDue.1h60m',
		anchor: 'dateDue',
		offset: { calendarDays: 0, clockMinutes: 120, canonical: '2h' },
		canonical: 'dateDue.2h',
	},
});
assert.deepEqual(parseReminderOffsetInput('1w 7d'), {
	ok: true,
	value: { calendarDays: 14, clockMinutes: 0, canonical: '2w' },
});
assert.deepEqual(parseReminderOffsetInput('000m'), {
	ok: true,
	value: { calendarDays: 0, clockMinutes: 0, canonical: '0m' },
});
assert.equal(parseReminderRule('unknown.1d').ok, false);
assert.equal(parseReminderRule('dateDue.1d.extra').ok, false);
assert.equal(parseReminderOffsetInput('1h 30').ok, false);
assert.equal(parseReminderOffsetInput('999999999999999999999d').ok, false);
assert.deepEqual(parseReminderRule('dateDue.1h 30m'), {
	ok: false,
	raw: 'dateDue.1h 30m',
	reason: 'invalid-offset',
});
for (const input of ['dateDue.-1m', 'dateDue.1.5h', 'dateDue.1s', 'DateDue.30m']) {
	assert.equal(parseReminderRule(input).ok, false, input);
}
const leapReminder = parseAbsoluteReminder('2024-02-29T12:30:15');
assert.equal(leapReminder.ok, true);
if (leapReminder.ok) assert.equal(leapReminder.value.localDatetime, '2024-02-29T12:30:15');
const normalizedSeconds = parseAbsoluteReminder('2024-02-29T12:30');
assert.equal(normalizedSeconds.ok, true);
if (normalizedSeconds.ok) assert.equal(normalizedSeconds.value.localDatetime, '2024-02-29T12:30:00');
assert.equal(parseAbsoluteReminder('2023-02-29T12:30').ok, false);
assert.equal(parseAbsoluteReminder('2024-02-30T12:34').ok, false);
assert.equal(parseAbsoluteReminder('2026-01-01T10:00Z').ok, false);
if (process.env.TZ === 'Europe/Berlin') {
	assert.equal(parseAbsoluteReminder('2026-03-29T02:30').ok, false);
}
if (process.env.TZ === 'America/New_York') {
	assert.equal(parseAbsoluteReminder('2026-03-08T02:30').ok, false);
}
assert.deepEqual(
	canonicalizeReminderRuleList(['dateDue.1d', 'dateDue.1d', 'dateScheduled.2h']).canonicalRules,
	['dateDue.1d', 'dateScheduled.2h'],
);
const dstResult = resolveReminderRule('datetimeStart.1d', {
	datetimeStart: '2026-03-29T12:00:00',
});
assert.equal(dstResult.status, 'resolved');
if (dstResult.status === 'resolved') {
	assert.equal(dstResult.localDatetime, '2026-03-28T12:00:00');
	const expectedEpochByTimezone: Readonly<Record<string, number>> = {
		UTC: Date.UTC(2026, 2, 28, 12),
		'Europe/Berlin': Date.UTC(2026, 2, 28, 11),
		'America/New_York': Date.UTC(2026, 2, 28, 16),
	};
	assert.equal(dstResult.epochMs, expectedEpochByTimezone[process.env.TZ ?? 'UTC']);
}

const repeatShapeByFrequency = {
	day: '',
	week: '|days=fr,mo,mo',
	month: '|monthdays=15,1,15',
	year: '|month=2|monthdays=29',
} as const;
for (const mode of ['schedule', 'done', 'count'] as const) {
	for (const frequency of ['day', 'week', 'month', 'year'] as const) {
		const shape = mode === 'done' ? '' : repeatShapeByFrequency[frequency];
		const count = mode === 'count' ? '|count=5' : '';
		const raw = `mode=${mode}|freq=${frequency}|interval=2${count}${shape}`;
		const parsed = parseRepeatRule(raw);
		assert.ok(parsed, raw);
		assert.deepEqual(parseRepeatRule(serializeRepeatRule(parsed)), parsed, raw);
	}
}
assert.equal(
	serializeRepeatRule(parseRepeatRule('freq=week|mode=schedule|days=fr,mo,mo|interval=1')!),
	'mode=schedule|freq=week|interval=1|days=mo,fr',
);
assert.equal(parseRepeatRule('mode=schedule|unknown=value|freq=day|interval=1'), null);
assert.equal(parseRepeatRule('mode=count|freq=day|interval=1'), null);
assert.equal(parseRepeatRule('mode=schedule|freq=month|interval=1|monthdays=32'), null);
assert.equal(parseRepeatRule('mode=schedule||freq=day|interval=1')?.mode, 'schedule');
assert.deepEqual(
	parseRepeatRule('MODE=SCHEDULE|FREQ=WEEK|INTERVAL=1|DAYS=FR,MO,MO'),
	{ mode: 'schedule', freq: 'week', interval: 1, days: ['mo', 'fr'] },
);
assert.deepEqual(
	parseRepeatRule('mode=schedule|freq=day|interval=1|interval=2'),
	{ mode: 'schedule', freq: 'day', interval: 2 },
);
for (const input of [
	'mode=done|freq=day|interval=1|count=5',
	'mode=schedule|freq=day|interval=1|count=5',
	'mode=schedule|freq=year|interval=1|month=13|monthdays=1',
	'mode=schedule|freq=day',
]) assert.equal(parseRepeatRule(input), null, input);

assert.equal(normalizeCanonicalVaultPathForIdentityV1('/Vault/Cafe\u0301', 'darwin'), '/Vault/Café');
assert.equal(normalizeCanonicalVaultPathForIdentityV1('C:/Users/Hasan/Vault', 'win32'), 'c:\\users\\hasan\\vault');
assert.equal(
	normalizeCanonicalVaultPathForIdentityV1('\\\\?\\C:\\Vault\\CAFE\u0301', 'win32'),
	'c:\\vault\\café',
);
assert.equal(
	normalizeCanonicalVaultPathForIdentityV1('\\\\?\\UNC\\Server\\Share\\Vault', 'win32'),
	'\\\\server\\share\\vault',
);
assert.equal(isCanonicalPathWithinRootV1('/vault/root', '/vault/root/task.md', 'darwin'), true);
assert.equal(isCanonicalPathWithinRootV1('/vault', '/vault', 'darwin'), true);
assert.equal(isCanonicalPathWithinRootV1('/vault/root', '/vault/root-other/task.md', 'darwin'), false);
assert.equal(isCanonicalPathWithinRootV1('/Vault/Root', '/vault/root/task.md', 'darwin'), false);
assert.equal(isCanonicalPathWithinRootV1('C:\\Vault\\Root', 'c:\\vault\\root\\task.md', 'win32'), true);
assert.equal(isCanonicalPathWithinRootV1('C:\\Vault\\Root', 'D:\\Vault\\Root\\task.md', 'win32'), false);
assert.equal(isCanonicalPathWithinRootV1('C:\\Vault\\Root', 'C:\\Vault\\RootOther\\task.md', 'win32'), false);
assert.equal(isCanonicalPathWithinRootV1('\\\\Server\\Share\\Vault', '\\\\server\\share\\vault\\task.md', 'win32'), true);
assert.equal(isCanonicalPathWithinRootV1('\\\\Server\\Share\\Vault', '\\\\server\\share\\vault-other\\task.md', 'win32'), false);
assert.equal(isCanonicalPathWithinRootV1('\\\\?\\C:\\Vault\\Root', 'c:\\vault\\root\\task.md', 'win32'), true);
assert.throws(() => normalizeCanonicalVaultPathForIdentityV1('', 'darwin'), /VAULT_PATH_UNAVAILABLE/u);
assert.throws(() => normalizeCanonicalVaultPathForIdentityV1('/vault\0bad', 'darwin'), /VAULT_PATH_UNAVAILABLE/u);
assert.throws(() => isCanonicalPathWithinRootV1('', '/vault/task.md', 'darwin'), /VAULT_PATH_UNAVAILABLE/u);
assert.throws(() => isCanonicalPathWithinRootV1('bad\0path', '/vault/task.md', 'darwin'), /VAULT_PATH_UNAVAILABLE/u);

for (const valid of [
	'1.0.0',
	'1.0.0-beta.1',
	'1.0.0-alpha-beta.2+build.7',
	'999999999999999999999999.0.0',
	' 1.2.3 ',
]) assert.equal(isValidOperonVersion(valid), true);
for (const invalid of ['1.0', '01.0.0', '1.0.0-01', 'v1.0.0', 'latest', 'beta']) {
	assert.equal(isValidOperonVersion(invalid), false);
}
assert.ok(compareOperonVersions('1.0.0-beta.2', '1.0.0-beta.10') < 0);
assert.ok(compareOperonVersions('1.0.0-beta', '1.0.0') < 0);
assert.equal(compareOperonVersions('1.0.0+one', '1.0.0+two'), 0);
assert.ok(compareOperonVersions('999999999999999999999999.0.0', '2.0.0') > 0);
assert.equal(
	compareOperonVersions('1.0.0-999999999999999999999999999999999999', '1.0.0-10'),
	1,
);
assert.equal(compareOperonVersions('latest', 'beta'), 0);

console.log(JSON.stringify({ status: 'passed', timezone: process.env.TZ ?? 'default' }));
