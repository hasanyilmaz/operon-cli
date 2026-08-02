import { localToday, toLocalDate } from './local-time';

export type RepeatMode = 'schedule' | 'done' | 'count';
export type RepeatFrequency = 'day' | 'week' | 'month' | 'year';
export type RepeatWeekday = 'mo' | 'tu' | 'we' | 'th' | 'fr' | 'sa' | 'su';

export interface RepeatRule {
	mode: RepeatMode;
	freq: RepeatFrequency;
	interval: number;
	count?: number;
	days?: RepeatWeekday[];
	monthdays?: number[];
	month?: number;
	setpos?: number;
}

export interface NextRepeatOptions {
	anchorDate: string;
	skipDates?: Iterable<string>;
	repeatEnd?: string;
}

export interface RepeatRangeOptions {
	anchorDate: string;
	rangeStart: string;
	rangeEnd: string;
	repeatEnd?: string;
	skipDates?: Iterable<string>;
	maxCount?: number;
}

export interface RepeatRuleSummaryLabels {
	noRepeat: string;
	every: Record<RepeatFrequency, string>;
	everyInterval: Record<RepeatFrequency, string>;
	whenDone: string;
	remaining: string;
	weekOn: string;
	monthOnDay: string;
	monthOnPositionWeekday: string;
	yearOnMonthDays: string;
	monthFallback: string;
	ordinalDay: string;
	itemSeparator: string;
	twoItemSeparator: string;
	finalItemSeparator: string;
	countSeparator: string;
	weekdayLabels: Record<RepeatWeekday, string>;
	ordinalLabels: Record<number, string>;
	monthLabels: ReadonlyArray<string>;
}

const TOKEN_ORDER: ReadonlyArray<keyof RepeatRule> = [
	'mode',
	'freq',
	'interval',
	'count',
	'days',
	'monthdays',
	'month',
	'setpos',
];

const VALID_MODES = new Set<RepeatMode>(['schedule', 'done', 'count']);
const VALID_FREQS = new Set<RepeatFrequency>(['day', 'week', 'month', 'year']);
const WEEKDAY_ORDER: RepeatWeekday[] = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
const WEEKDAY_INDEX = new Map<RepeatWeekday, number>(WEEKDAY_ORDER.map((day, index) => [day, index]));
const WEEKDAY_LABELS: Record<RepeatWeekday, string> = {
	mo: 'Monday',
	tu: 'Tuesday',
	we: 'Wednesday',
	th: 'Thursday',
	fr: 'Friday',
	sa: 'Saturday',
	su: 'Sunday',
};
const ORDINAL_LABELS: Record<number, string> = {
	1: 'first',
	2: 'second',
	3: 'third',
	4: 'fourth',
	'-1': 'last',
};
const MONTH_LABELS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
] as const;
export const DEFAULT_REPEAT_RULE_SUMMARY_LABELS: RepeatRuleSummaryLabels = {
	noRepeat: 'No repeat',
	every: {
		day: 'Every day',
		week: 'Every week',
		month: 'Every month',
		year: 'Every year',
	},
	everyInterval: {
		day: 'Every {{interval}} days',
		week: 'Every {{interval}} weeks',
		month: 'Every {{interval}} months',
		year: 'Every {{interval}} years',
	},
	whenDone: '{{prefix}} when done',
	remaining: '{{count}} remaining',
	weekOn: '{{prefix}} on {{days}}',
	monthOnDay: '{{prefix}} on day {{days}}',
	monthOnPositionWeekday: '{{prefix}} on the {{position}} {{weekday}}',
	yearOnMonthDays: '{{prefix}} on {{month}} {{days}}',
	monthFallback: 'Month {{month}}',
	ordinalDay: '{{day}}{{suffix}}',
	itemSeparator: ', ',
	twoItemSeparator: ' and ',
	finalItemSeparator: ', and ',
	countSeparator: ', ',
	weekdayLabels: WEEKDAY_LABELS,
	ordinalLabels: ORDINAL_LABELS,
	monthLabels: MONTH_LABELS,
};

function normalizeKey(raw: string): string {
	return raw.trim().toLowerCase();
}

function normalizeValue(raw: string): string {
	return raw.trim().toLowerCase();
}

function parsePositiveInt(value: string): number | null {
	if (!/^\d+$/.test(value.trim())) return null;
	const parsed = Number.parseInt(value.trim(), 10);
	if (!Number.isInteger(parsed) || parsed < 1) return null;
	return parsed;
}

function parseSignedInt(value: string): number | null {
	if (!/^-?\d+$/.test(value.trim())) return null;
	const parsed = Number.parseInt(value.trim(), 10);
	if (!Number.isInteger(parsed)) return null;
	return parsed;
}

function parseWeekdays(value: string): RepeatWeekday[] | null {
	const tokens = value.split(',').map(token => normalizeValue(token)).filter(Boolean);
	if (tokens.length === 0) return null;
	const deduped = new Set<RepeatWeekday>();
	for (const token of tokens) {
		if (!WEEKDAY_INDEX.has(token as RepeatWeekday)) return null;
		deduped.add(token as RepeatWeekday);
	}
	return [...deduped].sort((a, b) => (WEEKDAY_INDEX.get(a) ?? 0) - (WEEKDAY_INDEX.get(b) ?? 0));
}

function parseMonthDays(value: string): number[] | null {
	const tokens = value.split(',').map(token => token.trim()).filter(Boolean);
	if (tokens.length === 0) return null;
	const deduped = new Set<number>();
	for (const token of tokens) {
		const parsed = parsePositiveInt(token);
		if (!parsed || parsed > 31) return null;
		deduped.add(parsed);
	}
	return [...deduped].sort((a, b) => a - b);
}

function hasScheduleLikeShape(rule: RepeatRule): boolean {
	const hasDays = !!rule.days?.length;
	const hasMonthDays = !!rule.monthdays?.length;
	const hasMonth = Number.isInteger(rule.month);
	const hasSetpos = Number.isInteger(rule.setpos);

	if (rule.freq === 'day') {
		return !hasDays && !hasMonthDays && !hasMonth && !hasSetpos;
	}

	if (rule.freq === 'week') {
		if (hasMonthDays || hasMonth || hasSetpos) return false;
		return !rule.days || rule.days.length > 0;
	}

	if (rule.freq === 'month') {
		if (hasMonth) return false;
		if (hasMonthDays && (hasDays || hasSetpos)) return false;
		if (hasDays || hasSetpos) {
			if (!hasDays || rule.days!.length !== 1) return false;
			if (!hasSetpos || ![1, 2, 3, 4, -1].includes(rule.setpos!)) return false;
			return true;
		}
		return hasMonthDays;
	}

	if (rule.freq === 'year') {
		if (hasDays || hasSetpos) return false;
		if (!hasMonth || !rule.month || rule.month < 1 || rule.month > 12) return false;
		return hasMonthDays;
	}

	return false;
}

function validateRule(rule: RepeatRule): boolean {
	if (!VALID_MODES.has(rule.mode)) return false;
	if (!VALID_FREQS.has(rule.freq)) return false;
	if (!Number.isInteger(rule.interval) || rule.interval < 1) return false;

	const hasCount = Number.isInteger(rule.count);
	if (rule.mode === 'done') {
		if (hasCount) return false;
		const hasDays = !!rule.days?.length;
		const hasMonthDays = !!rule.monthdays?.length;
		const hasMonth = Number.isInteger(rule.month);
		const hasSetpos = Number.isInteger(rule.setpos);
		return !hasDays && !hasMonthDays && !hasMonth && !hasSetpos;
	}

	if (rule.mode === 'schedule' && hasCount) return false;
	if (rule.mode === 'count' && (!hasCount || !rule.count || rule.count < 1)) return false;

	return hasScheduleLikeShape(rule);
}

export function parseRepeatRule(raw: string | null | undefined): RepeatRule | null {
	if (!raw) return null;
	const trimmed = raw.trim();
	if (!trimmed) return null;

	const parsed: Partial<RepeatRule> = {};
	for (const token of trimmed.split('|')) {
		const segment = token.trim();
		if (!segment) continue;
		const eqIndex = segment.indexOf('=');
		if (eqIndex <= 0) return null;
		const key = normalizeKey(segment.slice(0, eqIndex));
		const value = segment.slice(eqIndex + 1).trim();
		if (!value) return null;

		switch (key) {
			case 'mode':
				parsed.mode = normalizeValue(value) as RepeatMode;
				break;
			case 'freq':
				parsed.freq = normalizeValue(value) as RepeatFrequency;
				break;
			case 'interval': {
				const interval = parsePositiveInt(value);
				if (!interval) return null;
				parsed.interval = interval;
				break;
			}
			case 'count': {
				const count = parsePositiveInt(value);
				if (!count) return null;
				parsed.count = count;
				break;
			}
			case 'days': {
				const days = parseWeekdays(value);
				if (!days) return null;
				parsed.days = days;
				break;
			}
			case 'monthdays': {
				const monthdays = parseMonthDays(value);
				if (!monthdays) return null;
				parsed.monthdays = monthdays;
				break;
			}
			case 'month': {
				const month = parsePositiveInt(value);
				if (!month || month > 12) return null;
				parsed.month = month;
				break;
			}
			case 'setpos': {
				const setpos = parseSignedInt(value);
				if (!setpos) return null;
				parsed.setpos = setpos;
				break;
			}
			default:
				return null;
		}
	}

	if (!parsed.mode || !parsed.freq || !parsed.interval) return null;
	const rule: RepeatRule = {
		mode: parsed.mode,
		freq: parsed.freq,
		interval: parsed.interval,
		...(parsed.count ? { count: parsed.count } : {}),
		...(parsed.days?.length ? { days: parsed.days } : {}),
		...(parsed.monthdays?.length ? { monthdays: parsed.monthdays } : {}),
		...(parsed.month ? { month: parsed.month } : {}),
		...(typeof parsed.setpos === 'number' ? { setpos: parsed.setpos } : {}),
	};
	return validateRule(rule) ? rule : null;
}

export function serializeRepeatRule(rule: RepeatRule): string {
	if (!validateRule(rule)) {
		throw new Error('Invalid repeat rule');
	}

	const values: Partial<Record<keyof RepeatRule, string>> = {
		mode: rule.mode,
		freq: rule.freq,
		interval: String(rule.interval),
	};
	if (rule.count) values.count = String(rule.count);
	if (rule.days?.length) values.days = rule.days.join(',');
	if (rule.monthdays?.length) values.monthdays = rule.monthdays.join(',');
	if (rule.month) values.month = String(rule.month);
	if (typeof rule.setpos === 'number') values.setpos = String(rule.setpos);

	return TOKEN_ORDER
		.map(key => values[key] ? `${key}=${values[key]}` : null)
		.filter((value): value is string => !!value)
		.join('|');
}

function applyTemplate(template: string, vars: Record<string, string | number>): string {
	return template.replace(/\{\{(\w+)\}\}/gu, (_, key: string) => String(vars[key] ?? ''));
}

function formatEvery(freq: RepeatFrequency, interval: number, labels: RepeatRuleSummaryLabels): string {
	if (interval === 1) {
		return labels.every[freq];
	}
	return applyTemplate(labels.everyInterval[freq], { interval });
}

function formatList(values: string[], labels: RepeatRuleSummaryLabels): string {
	if (values.length === 0) return '';
	if (values.length === 1) return values[0];
	if (values.length === 2) return `${values[0]}${labels.twoItemSeparator}${values[1]}`;
	return `${values.slice(0, -1).join(labels.itemSeparator)}${labels.finalItemSeparator}${values[values.length - 1]}`;
}

function formatOrdinal(day: number, labels: RepeatRuleSummaryLabels): string {
	const mod100 = day % 100;
	if (mod100 >= 11 && mod100 <= 13) {
		return applyTemplate(labels.ordinalDay, { day, suffix: 'th' });
	}
	const mod10 = day % 10;
	const suffix = mod10 === 1 ? 'st' : mod10 === 2 ? 'nd' : mod10 === 3 ? 'rd' : 'th';
	return applyTemplate(labels.ordinalDay, { day, suffix });
}

export function formatRepeatRuleSummary(rule: RepeatRule | null | undefined): string {
	return formatRepeatRuleSummaryWithLabels(rule, DEFAULT_REPEAT_RULE_SUMMARY_LABELS);
}

export function formatRepeatRuleSummaryWithLabels(
	rule: RepeatRule | null | undefined,
	labels: RepeatRuleSummaryLabels,
): string {
	if (!rule) return labels.noRepeat;
	const prefix = formatEvery(rule.freq, rule.interval, labels);

	if (rule.mode === 'done') {
		return applyTemplate(labels.whenDone, { prefix });
	}

	let summary = prefix;
	if (rule.freq === 'week' && rule.days?.length) {
		summary = applyTemplate(labels.weekOn, {
			prefix,
			days: formatList(rule.days.map(day => labels.weekdayLabels[day]), labels),
		});
	} else if (rule.freq === 'month' && rule.monthdays?.length) {
		summary = applyTemplate(labels.monthOnDay, {
			prefix,
			days: formatList(rule.monthdays.map(day => String(day)), labels),
		});
	} else if (rule.freq === 'month' && rule.days?.length && typeof rule.setpos === 'number') {
		const ordinal = labels.ordinalLabels[rule.setpos] ?? `${rule.setpos}`;
		summary = applyTemplate(labels.monthOnPositionWeekday, {
			prefix,
			position: ordinal,
			weekday: labels.weekdayLabels[rule.days[0]],
		});
	} else if (rule.freq === 'year' && rule.month && rule.monthdays?.length) {
		const monthLabel = labels.monthLabels[rule.month - 1] ?? applyTemplate(labels.monthFallback, { month: rule.month });
		summary = applyTemplate(labels.yearOnMonthDays, {
			prefix,
			month: monthLabel,
			days: formatList(rule.monthdays.map(day => formatOrdinal(day, labels)), labels),
		});
	}

	if (rule.mode === 'count' && rule.count) {
		return `${summary}${labels.countSeparator}${applyTemplate(labels.remaining, { count: rule.count })}`;
	}

	return summary;
}

function extractDatePart(value: string | null | undefined): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
	if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed.slice(0, 10);
	return null;
}

function parseDate(value: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const [year, month, day] = value.split('-').map(Number);
	const date = new Date(year, month - 1, day, 12, 0, 0, 0);
	if (Number.isNaN(date.getTime())) return null;
	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
	return date;
}

function startOfWeek(date: Date): Date {
	const copy = new Date(date);
	const day = copy.getDay();
	const diff = day === 0 ? -6 : 1 - day;
	copy.setDate(copy.getDate() + diff);
	copy.setHours(12, 0, 0, 0);
	return copy;
}

function daysBetween(a: Date, b: Date): number {
	return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function weeksBetween(a: Date, b: Date): number {
	return Math.floor(daysBetween(startOfWeek(a), startOfWeek(b)) / 7);
}

function monthsBetween(a: Date, b: Date): number {
	return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function lastDayOfMonth(year: number, monthIndex: number): number {
	return new Date(year, monthIndex + 1, 0, 12, 0, 0, 0).getDate();
}

function addMonthsClamped(date: Date, months: number): Date {
	const year = date.getFullYear();
	const monthIndex = date.getMonth();
	const targetMonthIndex = monthIndex + months;
	const targetYear = year + Math.floor(targetMonthIndex / 12);
	const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
	const day = Math.min(date.getDate(), lastDayOfMonth(targetYear, normalizedMonth));
	return new Date(targetYear, normalizedMonth, day, 12, 0, 0, 0);
}

function addYearsClamped(date: Date, years: number): Date {
	const targetYear = date.getFullYear() + years;
	const monthIndex = date.getMonth();
	const day = Math.min(date.getDate(), lastDayOfMonth(targetYear, monthIndex));
	return new Date(targetYear, monthIndex, day, 12, 0, 0, 0);
}

function computeNthWeekdayOfMonth(year: number, monthIndex: number, weekday: RepeatWeekday, setpos: number): Date | null {
	const targetWeekday = weekday === 'su' ? 0 : (WEEKDAY_INDEX.get(weekday) ?? 0) + 1;
	if (setpos === -1) {
		const date = new Date(year, monthIndex + 1, 0, 12, 0, 0, 0);
		while (date.getDay() !== targetWeekday) {
			date.setDate(date.getDate() - 1);
		}
		return date;
	}

	const first = new Date(year, monthIndex, 1, 12, 0, 0, 0);
	while (first.getDay() !== targetWeekday) {
		first.setDate(first.getDate() + 1);
	}
	first.setDate(first.getDate() + (setpos - 1) * 7);
	if (first.getMonth() !== monthIndex) return null;
	return first;
}

function computeNextDaily(baseDate: Date, interval: number): Date {
	const date = new Date(baseDate);
	date.setDate(date.getDate() + interval);
	return date;
}

function computeNextWeekly(baseDate: Date, interval: number, days: RepeatWeekday[]): Date | null {
	const normalizedDays = days.length
		? new Set(days)
		: new Set<RepeatWeekday>([WEEKDAY_ORDER[(baseDate.getDay() + 6) % 7]]);
	const candidate = new Date(baseDate);
	for (let step = 0; step < 800; step++) {
		candidate.setDate(candidate.getDate() + 1);
		const weekday = WEEKDAY_ORDER[(candidate.getDay() + 6) % 7];
		if (!normalizedDays.has(weekday)) continue;
		if (weeksBetween(baseDate, candidate) % interval !== 0) continue;
		return new Date(candidate);
	}
	return null;
}

function computeNextMonthlyByMonthDays(baseDate: Date, interval: number, monthdays: number[]): Date | null {
	for (let offset = 0; offset < 240; offset++) {
		const monthDate = addMonthsClamped(new Date(baseDate.getFullYear(), baseDate.getMonth(), 1, 12, 0, 0, 0), offset);
		if (monthsBetween(baseDate, monthDate) % interval !== 0) continue;
		const year = monthDate.getFullYear();
		const monthIndex = monthDate.getMonth();
		const maxDay = lastDayOfMonth(year, monthIndex);
		for (const day of monthdays) {
			if (day > maxDay) continue;
			const candidate = new Date(year, monthIndex, day, 12, 0, 0, 0);
			if (candidate.getTime() <= baseDate.getTime()) continue;
			return candidate;
		}
	}
	return null;
}

function computeNextMonthlyByWeekday(baseDate: Date, interval: number, weekday: RepeatWeekday, setpos: number): Date | null {
	for (let offset = 0; offset < 240; offset++) {
		const monthDate = addMonthsClamped(new Date(baseDate.getFullYear(), baseDate.getMonth(), 1, 12, 0, 0, 0), offset);
		if (monthsBetween(baseDate, monthDate) % interval !== 0) continue;
		const candidate = computeNthWeekdayOfMonth(monthDate.getFullYear(), monthDate.getMonth(), weekday, setpos);
		if (!candidate) continue;
		if (candidate.getTime() <= baseDate.getTime()) continue;
		return candidate;
	}
	return null;
}

function computeNextYearly(baseDate: Date, interval: number, month: number, monthdays: number[]): Date | null {
	const normalizedMonthIndex = month - 1;
	for (let offset = 0; offset < 50; offset++) {
		const year = baseDate.getFullYear() + offset;
		if (offset % interval !== 0) continue;
		const maxDay = lastDayOfMonth(year, normalizedMonthIndex);
		for (const day of monthdays) {
			if (day > maxDay) continue;
			const candidate = new Date(year, normalizedMonthIndex, day, 12, 0, 0, 0);
			if (candidate.getTime() <= baseDate.getTime()) continue;
			return candidate;
		}
	}
	return null;
}

function computeNextDateFromAnchor(rule: RepeatRule, anchorDate: string): string | null {
	const baseDate = parseDate(anchorDate);
	if (!baseDate) return null;

	if (rule.mode === 'done') {
		if (rule.freq === 'day') return toLocalDate(computeNextDaily(baseDate, rule.interval));
		if (rule.freq === 'week') return toLocalDate(computeNextDaily(baseDate, rule.interval * 7));
		if (rule.freq === 'month') return toLocalDate(addMonthsClamped(baseDate, rule.interval));
		if (rule.freq === 'year') return toLocalDate(addYearsClamped(baseDate, rule.interval));
		return null;
	}

	if (rule.freq === 'day') {
		return toLocalDate(computeNextDaily(baseDate, rule.interval));
	}
	if (rule.freq === 'week') {
		const next = computeNextWeekly(baseDate, rule.interval, rule.days ?? []);
		return next ? toLocalDate(next) : null;
	}
	if (rule.freq === 'month' && rule.monthdays?.length) {
		const next = computeNextMonthlyByMonthDays(baseDate, rule.interval, rule.monthdays);
		return next ? toLocalDate(next) : null;
	}
	if (rule.freq === 'month' && rule.days?.[0] && typeof rule.setpos === 'number') {
		const next = computeNextMonthlyByWeekday(baseDate, rule.interval, rule.days[0], rule.setpos);
		return next ? toLocalDate(next) : null;
	}
	if (rule.freq === 'year' && rule.month && rule.monthdays?.length) {
		const next = computeNextYearly(baseDate, rule.interval, rule.month, rule.monthdays);
		return next ? toLocalDate(next) : null;
	}

	return null;
}

function buildSkipSet(skipDates?: Iterable<string>): Set<string> {
	const skipSet = new Set<string>();
	for (const value of skipDates ?? []) {
		const datePart = extractDatePart(value);
		if (datePart) skipSet.add(datePart);
	}
	return skipSet;
}

export function isRepeatDateBeyondEnd(nextDate: string, repeatEnd: string | null | undefined): boolean {
	const next = extractDatePart(nextDate);
	const end = extractDatePart(repeatEnd);
	if (!next || !end) return false;
	return next > end;
}

export function calculateNextRepeatDate(rule: RepeatRule, options: NextRepeatOptions): string | null {
	const skipSet = buildSkipSet(options.skipDates);
	let anchor = extractDatePart(options.anchorDate) ?? localToday();
	for (let guard = 0; guard < 500; guard++) {
		const next = computeNextDateFromAnchor(rule, anchor);
		if (!next) return null;
		if (isRepeatDateBeyondEnd(next, options.repeatEnd)) return null;
		if (!skipSet.has(next)) return next;
		anchor = next;
	}
	return null;
}

export function listRepeatOccurrencesInRange(rule: RepeatRule, options: RepeatRangeOptions): string[] {
	if (rule.mode === 'done') return [];
	const anchor = extractDatePart(options.anchorDate);
	const rangeStart = extractDatePart(options.rangeStart);
	const rangeEnd = extractDatePart(options.rangeEnd);
	if (!anchor || !rangeStart || !rangeEnd || rangeStart > rangeEnd) return [];

	const skipSet = buildSkipSet(options.skipDates);
	const maxCount = Number.isInteger(options.maxCount) && (options.maxCount ?? 0) >= 0
		? (options.maxCount as number)
		: null;
	if (maxCount === 0) return [];

	const results: string[] = [];
	let current = anchor;
	let emitted = 0;
	for (let guard = 0; guard < 5000; guard++) {
		const next = computeNextDateFromAnchor(rule, current);
		if (!next) break;
		if (isRepeatDateBeyondEnd(next, options.repeatEnd)) break;
		current = next;

		const skipped = skipSet.has(next);
		if (!skipped) {
			emitted += 1;
			if (maxCount !== null && emitted > maxCount) break;
			if (next >= rangeStart && next <= rangeEnd) {
				results.push(next);
			}
		}

		if (next > rangeEnd) break;
	}

	return results;
}

export function calculateRepeatEndFromCount(
	rule: RepeatRule,
	anchorDate: string,
	occurrenceCount: number,
	skipDates?: Iterable<string>,
): string | null {
	const anchor = extractDatePart(anchorDate);
	if (!anchor) return null;
	if (!Number.isInteger(occurrenceCount) || occurrenceCount < 1) return null;

	const skipSet = buildSkipSet(skipDates);
	let current = anchor;
	for (let index = 1; index < occurrenceCount; index++) {
		let found: string | null = null;
		for (let guard = 0; guard < 500; guard++) {
			const next = computeNextDateFromAnchor(rule, current);
			if (!next) return null;
			current = next;
			if (skipSet.has(next)) continue;
			found = next;
			break;
		}
		if (!found) return null;
		current = found;
	}
	return current;
}

export function calculateRepeatCountFromEnd(
	rule: RepeatRule,
	anchorDate: string,
	repeatEnd: string,
	skipDates?: Iterable<string>,
): number | null {
	const anchor = extractDatePart(anchorDate);
	const end = extractDatePart(repeatEnd);
	if (!anchor || !end) return null;
	if (end <= anchor) return 1;

	const skipSet = buildSkipSet(skipDates);
	let current = anchor;
	let count = 1;
	for (let guard = 0; guard < 500; guard++) {
		const next = computeNextDateFromAnchor(rule, current);
		if (!next) return null;
		if (next > end) return count;
		current = next;
		if (skipSet.has(next)) continue;
		count += 1;
		if (current === end) return count;
	}
	return null;
}
