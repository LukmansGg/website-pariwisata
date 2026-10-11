import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VisitorSession } from "./visitor-session.types";

export async function createOrResumeVisitorSession(
	supabase: SupabaseClient,
	destinationId: string,
): Promise<VisitorSession> {
	const { data, error } = await supabase.rpc(
		"create_or_resume_visitor_session",
		{
			p_destination_id: destinationId,
		},
	);

	if (error) {
		throw new Error(`Gagal membuat sesi pengunjung: ${error.message}`);
	}

	if (!data || typeof data !== "object" || !("id" in data)) {
		throw new Error("Respons sesi pengunjung tidak valid.");
	}

	return data as VisitorSession;
}
