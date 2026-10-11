import type {
	FeatureManifest,
	FeatureScope,
	FeatureStatus,
} from "./feature.types";

export class FeatureRegistry {
	private readonly features = new Map<string, FeatureManifest>();
	private readonly enabledScopes = new Set<string>();

	register(manifest: FeatureManifest): void {
		if (this.features.has(manifest.id)) {
			throw new Error(`Feature already registered: ${manifest.id}`);
		}

		if (!manifest.id.trim() || !manifest.version.trim()) {
			throw new Error("Feature id and version are required");
		}

		this.features.set(manifest.id, manifest);
	}

	get(id: string): FeatureManifest {
		const feature = this.features.get(id);

		if (!feature) {
			throw new Error(`Feature not found: ${id}`);
		}

		return feature;
	}

	list(): FeatureManifest[] {
		return [...this.features.values()];
	}

	enable(id: string, scope: FeatureScope, destinationId?: string): void {
		const feature = this.get(id);

		if (!feature.scopes.includes(scope)) {
			throw new Error(`Scope ${scope} is not supported by ${id}`);
		}

		if (scope === "destination" && !destinationId) {
			throw new Error("destinationId is required for destination scope");
		}

		if (scope === "global" && destinationId) {
			throw new Error("Global scope must not have a destinationId");
		}

		for (const dependencyId of feature.dependencies) {
			const dependency = this.get(dependencyId);

			if (!this.isEnabled(dependencyId, scope, destinationId)) {
				throw new Error(`Dependency ${dependency.id} is not enabled for ${id}`);
			}
		}

		this.enabledScopes.add(this.scopeKey(id, scope, destinationId));
	}

	disable(id: string, scope: FeatureScope, destinationId?: string): void {
		this.get(id);
		this.enabledScopes.delete(this.scopeKey(id, scope, destinationId));
	}

	isEnabled(id: string, scope: FeatureScope, destinationId?: string): boolean {
		const key = this.scopeKey(id, scope, destinationId);

		if (this.enabledScopes.has(key)) {
			return true;
		}

		// Global features may also be used at a destination.
		return (
			scope === "destination" &&
			this.enabledScopes.has(this.scopeKey(id, "global"))
		);
	}

	getStatuses(): FeatureStatus[] {
		return [...this.enabledScopes].map((key) => {
			const [id, scope, ...destinationParts] = key.split(":");

			return {
				id,
				scope: scope as FeatureScope,
				enabled: true,
				...(destinationParts.length
					? { destinationId: destinationParts.join(":") }
					: {}),
			};
		});
	}

	private scopeKey(
		id: string,
		scope: FeatureScope,
		destinationId?: string,
	): string {
		if (scope === "destination" && !destinationId) {
			throw new Error("destinationId is required for destination scope");
		}

		return scope === "global"
			? `${id}:global`
			: `${id}:destination:${destinationId}`;
	}
}
