export type VisitorSessionStatus = "active" | "expired" | "ended";

export interface VisitorSession {
	id: string;
	visitor_id: string;
	destination_id: string | null;
	started_at: string;
	last_activity_at: string;
	expires_at: string;
	status: VisitorSessionStatus;
}
