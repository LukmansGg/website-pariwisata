import { Redis } from "@upstash/redis";
import { createHmac } from "node:crypto";

const windowSeconds = 15 * 60;
const emailFailureLimit = 3;
const ipFailureLimit = 20;

let redisClient: Redis | undefined;

function redis() {
	const url = process.env.UPSTASH_REDIS_REST_URL;
	const token = process.env.UPSTASH_REDIS_REST_TOKEN;
	if (!url || !token) throw new Error("Login rate limit is not configured");
	redisClient ??= new Redis({ url, token });
	return redisClient;
}

function digest(value: string) {
	const token = process.env.UPSTASH_REDIS_REST_TOKEN;
	if (!token) throw new Error("Login rate limit is not configured");
	return createHmac("sha256", token).update(value).digest("hex");
}

function emailKey(email: string) {
	return `staff-login-failed-email-v2:${digest(email)}`;
}

function keys(email: string, ip: string) {
	return [
		emailKey(email),
		`staff-login-failed-ip-v2:${digest(ip)}`,
	] as const;
}

const readFailuresScript = `
local email_count = tonumber(redis.call('GET', KEYS[1]) or '0')
local email_ttl = redis.call('TTL', KEYS[1])
local ip_count = tonumber(redis.call('GET', KEYS[2]) or '0')
local ip_ttl = redis.call('TTL', KEYS[2])
return { email_count, email_ttl, ip_count, ip_ttl }
`;

const recordFailureScript = `
local window_seconds = tonumber(ARGV[1])
local email_count = redis.call('INCR', KEYS[1])
if email_count == 1 then redis.call('EXPIRE', KEYS[1], window_seconds) end
local email_ttl = redis.call('TTL', KEYS[1])
local ip_count = redis.call('INCR', KEYS[2])
if ip_count == 1 then redis.call('EXPIRE', KEYS[2], window_seconds) end
local ip_ttl = redis.call('TTL', KEYS[2])
return { email_count, email_ttl, ip_count, ip_ttl }
`;

type FailureCounts = [number | string, number | string, number | string, number | string];

function limitStatus(counts: FailureCounts) {
	const [emailCountRaw, emailTtlRaw, ipCountRaw, ipTtlRaw] = counts;
	const emailCount = Number(emailCountRaw) || 0;
	const emailTtl = Number(emailTtlRaw);
	const ipCount = Number(ipCountRaw) || 0;
	const ipTtl = Number(ipTtlRaw);
	const allowed = emailCount < emailFailureLimit && ipCount < ipFailureLimit;
	const attemptsRemaining = Math.max(
		0,
		Math.min(emailFailureLimit - emailCount, ipFailureLimit - ipCount),
	);
	const blockedTtls = [
		...(emailCount >= emailFailureLimit ? [emailTtl] : []),
		...(ipCount >= ipFailureLimit ? [ipTtl] : []),
	].filter((ttl) => Number.isFinite(ttl) && ttl >= 0);
	const ttl = blockedTtls.length ? Math.min(...blockedTtls) : Math.max(emailTtl, ipTtl, 0);
	return {
		allowed,
		attemptsRemaining,
		resetAt: Date.now() + (ttl >= 0 ? ttl : windowSeconds) * 1000,
	};
}

export async function checkLoginLimit(email: string, ip: string) {
	const counts = await redis().createScript<FailureCounts>(readFailuresScript).eval([...keys(email, ip)], []);
	return limitStatus(counts);
}

/** Call only after Supabase rejects the supplied credentials. */
export async function recordFailedLogin(email: string, ip: string) {
	const counts = await redis().createScript<FailureCounts>(recordFailureScript)
		.eval([...keys(email, ip)], [String(windowSeconds)]);
	return limitStatus(counts);
}

/** A valid password clears the account's failed-password counter. */
export async function clearLoginFailures(email: string) {
	await redis().del(emailKey(email));
}
