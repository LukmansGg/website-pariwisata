export type FeatureScope = "global" | "destination";

export interface FeatureManifest {
	id: string;
	name: string;
	version: string;
	description: string;

	dependencies: string[];
	permissions: string[];
	scopes: FeatureScope[];
}

export interface FeatureStatus {
	id: string;
	enabled: boolean;
	scope: FeatureScope;
	destinationId?: string;
}
