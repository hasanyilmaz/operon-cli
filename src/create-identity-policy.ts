import type { CreateTaskSpecV1 } from '../vendor/operon-plugin-v1/src/agent-runtime/contracts/v1';
import type { IdentityPlaceholderCreateSpecV1 } from '../vendor/operon-plugin-v1/src/agent-runtime/extensions/task-workflows-v1/contracts';

export function withFileTaskIdentityPlaceholderPolicyV1(
	spec: CreateTaskSpecV1,
	capabilityAvailable: boolean,
): CreateTaskSpecV1 | IdentityPlaceholderCreateSpecV1 {
	if (
		!capabilityAvailable
		|| spec.items.length === 0
		|| !spec.items.every(item => item.target.representation === 'file')
	) return spec;
	const items = spec.items.map(item => {
		return {
			...item,
			target: {
				...item.target,
				identityPlaceholderPolicy: 'resolve-operon-id-v1' as const,
			},
		};
	});
	return { ...spec, items } as IdentityPlaceholderCreateSpecV1;
}
