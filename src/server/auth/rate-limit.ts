import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createHmac } from "node:crypto";

const window = 15 * 60;
let emailLimiter: Ratelimit | undefined;
let ipLimiter: Ratelimit | undefined;

function limiters() {
	const url = process.env.UPSTASH_REDIS_REST_URL;
	const token = process.env.UPSTASH_REDIS_REST_TOKEN;
	if (!url || !token) throw new Error("Login rate limit is not configured");
	if (!emailLimiter || !ipLimiter) {
		const redis = new Redis({ url, token });
		emailLimiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3, `${window} s`), prefix: "staff-login-email", analytics: false });
		ipLimiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, `${window} s`), prefix: "staff-login-ip", analytics: false });
	}
	return { emailLimiter, ipLimiter };
}

function digest(value: string) {
	return createHmac("sha256", process.env.UPSTASH_REDIS_REST_TOKEN!).update(value).digest("hex");
}

export async function checkLoginLimit(email: string, ip: string) {
	const { emailLimiter: byEmail, ipLimiter: byIp } = limiters();
	const results = await Promise.all([
		byEmail.limit(digest(email)),
		byIp.limit(digest(ip)),
	]);
	return {
		allowed: results.every((result) => result.success),
		attemptsRemaining: Math.max(0, Math.min(...results.map((result) => result.remaining))),
		resetAt: Math.max(...results.map((result) => result.reset)),
	};
}
