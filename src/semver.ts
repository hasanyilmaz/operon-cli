interface ParsedVersion {
	numbers: string[];
	prerelease: string[];
}

const SEMVER_PATTERN =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

export function isValidOperonVersion(version: string): boolean {
	const match = SEMVER_PATTERN.exec(version.trim());
	if (!match) return false;
	const prerelease = match[4]?.split('.') ?? [];
	return prerelease.every(identifier => (
		!/^\d+$/u.test(identifier)
		|| identifier === '0'
		|| !identifier.startsWith('0')
	));
}

function parseVersion(version: string): ParsedVersion {
	const match = SEMVER_PATTERN.exec(version.trim());
	if (!match || !isValidOperonVersion(version)) {
		return { numbers: ['0', '0', '0'], prerelease: [] };
	}
	return {
		numbers: [match[1], match[2], match[3]],
		prerelease: match[4]?.split('.') ?? [],
	};
}

function compareNumericIdentifier(left: string, right: string): number {
	if (left.length !== right.length) return Math.sign(left.length - right.length);
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function comparePrereleaseIdentifier(left: string, right: string): number {
	const leftIsNumber = /^\d+$/u.test(left);
	const rightIsNumber = /^\d+$/u.test(right);
	if (leftIsNumber && rightIsNumber) return compareNumericIdentifier(left, right);
	if (leftIsNumber) return -1;
	if (rightIsNumber) return 1;
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

export function compareOperonVersions(left: string, right: string): number {
	const leftVersion = parseVersion(left);
	const rightVersion = parseVersion(right);
	const length = Math.max(leftVersion.numbers.length, rightVersion.numbers.length, 3);
	for (let index = 0; index < length; index += 1) {
		const comparison = compareNumericIdentifier(
			leftVersion.numbers[index] ?? '0',
			rightVersion.numbers[index] ?? '0',
		);
		if (comparison !== 0) return comparison;
	}
	if (leftVersion.prerelease.length === 0 && rightVersion.prerelease.length === 0) return 0;
	if (leftVersion.prerelease.length === 0) return 1;
	if (rightVersion.prerelease.length === 0) return -1;
	const prereleaseLength = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length);
	for (let index = 0; index < prereleaseLength; index += 1) {
		const leftIdentifier = leftVersion.prerelease[index];
		const rightIdentifier = rightVersion.prerelease[index];
		if (leftIdentifier === undefined) return -1;
		if (rightIdentifier === undefined) return 1;
		const comparison = comparePrereleaseIdentifier(leftIdentifier, rightIdentifier);
		if (comparison !== 0) return comparison;
	}
	return 0;
}
