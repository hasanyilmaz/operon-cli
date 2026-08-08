import type { CreateTaskSpecV1 } from '../vendor/operon-plugin-v1/src/agent-runtime/contracts/v1';

export function withFileTaskIdentityPlaceholderPolicyV1(
	spec: CreateTaskSpecV1,
	capabilityAvailable: boolean,
): CreateTaskSpecV1 {
	if (!capabilityAvailable) return spec;
	let changed = false;
	const items = spec.items.map(item => {
		if (
			item.target.representation !== 'file'
			|| item.target.identityPlaceholderPolicy === 'resolve-operon-id-v1'
		) return item;
		changed = true;
		return {
			...item,
			target: {
				...item.target,
				identityPlaceholderPolicy: 'resolve-operon-id-v1' as const,
			},
		};
	});
	return changed ? { ...spec, items } : spec;
}
