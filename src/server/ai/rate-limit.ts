import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createHmac } from "node:crypto";

let minuteLimiter: Ratelimit | undefined;
let dailyLimiter: Ratelimit | undefined;
let redisClient: Redis | undefined;

function getRedisClient() {
	const url = process.env.UPSTASH_REDIS_REST_URL;
	const token = process.env.UPSTASH_REDIS_REST_TOKEN;
	if (!url || !token) throw new Error("AI rate limit is not configured");
	if (!redisClient) redisClient = new Redis({ url, token });
	return redisClient;
}

function getLimiters() {
	if (!minuteLimiter || !dailyLimiter) {
		const redis = getRedisClient();
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

export async function reserveOpenRouterFallback() {
	const configuredLimit = Number(process.env.OPENROUTER_DAILY_FALLBACK_LIMIT ?? 40);
	const dailyLimit = Number.isInteger(configuredLimit) && configuredLimit >= 1 && configuredLimit <= 49 ? configuredLimit : 40;
	const redis = getRedisClient();
	const date = new Date().toISOString().slice(0, 10);
	const key = `tourism-ai-openrouter-fallback:${date}`;
	const count = await redis.incr(key);
	if (count === 1) await redis.expire(key, 172_800);
	return { allowed: count <= dailyLimit, remaining: Math.max(0, dailyLimit - count), resetAt: Date.now() + 86_400_000 };
}
