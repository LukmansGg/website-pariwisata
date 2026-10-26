export type QrMissionPoint = {
	id: string;
	isRequired: boolean;
	requires: readonly string[];
};

export function summarizeQrMissionProgress(
	points: readonly QrMissionPoint[],
	scannedPointIds: readonly string[],
) {
	const scannedIds = new Set(scannedPointIds);
	const foundIds = new Set<string>();
	let changed = true;

	while (changed) {
		changed = false;
		for (const point of points) {
			if (
				scannedIds.has(point.id) &&
				!foundIds.has(point.id) &&
				point.requires.every((requiredId) => foundIds.has(requiredId))
			) {
				foundIds.add(point.id);
				changed = true;
			}
		}
	}

	const requiredPoints = points.filter((point) => point.isRequired);
	const foundRequiredCount = requiredPoints.filter((point) => foundIds.has(point.id)).length;
	const scannedRequiredCount = requiredPoints.filter((point) => scannedIds.has(point.id)).length;
	const pendingRequiredCount = requiredPoints.filter(
		(point) => scannedIds.has(point.id) && !foundIds.has(point.id),
	).length;
	const bonusFoundCount = points.filter(
		(point) => !point.isRequired && foundIds.has(point.id),
	).length;

	return {
		scannedIds,
		foundIds,
		requiredCount: requiredPoints.length,
		foundRequiredCount,
		scannedRequiredCount,
		pendingRequiredCount,
		bonusFoundCount,
		completionPercent: requiredPoints.length
			? Math.round((foundRequiredCount / requiredPoints.length) * 100)
			: 0,
		completed: requiredPoints.length > 0 && foundRequiredCount === requiredPoints.length,
	};
}
