import type { AstroCookies } from "astro";

const COOKIE_NAME = "project_access_token";
const SIGNED_MESSAGE = "unlocked";

function getRuntimeEnv(locals: App.Locals): Record<string, string | undefined> {
	// Cloudflare Workers runtime (production)
	const cfEnv = (locals as unknown as { runtime?: { env?: Record<string, string> } }).runtime?.env;
	if (cfEnv) return cfEnv;
	// Local Node dev — Vite loads .env files into import.meta.env
	return import.meta.env as Record<string, string | undefined>;
}

async function computeHmac(secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(SIGNED_MESSAGE),
	);
	return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function makeUnlockCookieValue(locals: App.Locals): Promise<string> {
	const env = getRuntimeEnv(locals);
	const secret = env.PRIVATE_ACCESS_SECRET ?? "";
	return computeHmac(secret);
}

export async function isUnlocked(cookies: AstroCookies, locals: App.Locals): Promise<boolean> {
	const token = cookies.get(COOKIE_NAME)?.value;
	if (!token) return false;
	const expected = await makeUnlockCookieValue(locals);
	return token === expected;
}

export function verifyPassword(submitted: string, locals: App.Locals): boolean {
	const env = getRuntimeEnv(locals);
	const password = env.PRIVATE_ACCESS_PASSWORD ?? "";
	if (!password || !submitted) return false;
	// Constant-time comparison to prevent timing attacks
	if (submitted.length !== password.length) return false;
	let diff = 0;
	for (let i = 0; i < password.length; i++) {
		diff |= submitted.charCodeAt(i) ^ password.charCodeAt(i);
	}
	return diff === 0;
}
