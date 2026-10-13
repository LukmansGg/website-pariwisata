import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createHmac } from "node:crypto";

let minuteLimiter: Ratelimit | undefined;
let dailyLimiter: Ratelimit | undefined;

function getLimiters() {
	const url = process.env.UPSTASH_REDIS_REST_URL;
	const token = process.env.UPSTASH_REDIS_REST_TOKEN;
	if (!url || !token) throw new Error("AI rate limit is not configured");
	if (!minuteLimiter || !dailyLimiter) {
		const redis = new Redis({ url, token });
		minuteLimiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(12, "60 s"), prefix: "tourism-ai-minute", analytics: false });
		dailyLimiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(80, "24 h"), prefix: "tourism-ai-daily", analytics: false });
	}
	return { minuteLimiter, dailyLimiter };
}

function digest(value: string) {
	return createHmac("sha256", process.env.UPSTASH_REDIS_REST_TOKEN!).update(value).digest("hex");
}

export async function checkAiChatLimit(ipAddress: string) {
	const { minuteLimiter: byMinute, dailyLimiter: byDay } = getLimiters();
	const key = digest(ipAddress);
	const [minute, daily] = await Promise.all([byMinute.limit(key), byDay.limit(key)]);
	return {
		allowed: minute.success && daily.success,
		resetAt: Math.max(minute.reset, daily.reset),
	};
}
