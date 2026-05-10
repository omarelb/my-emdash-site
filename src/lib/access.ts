import type { AstroCookies } from "astro";

const COOKIE_NAME = "project_access_token";
const SIGNED_MESSAGE = "unlocked";

async function getRuntimeEnv(_locals: App.Locals): Promise<Record<string, string | undefined>> {
	// Cloudflare Workers runtime (production) — Astro v6 removed locals.runtime.env;
	// import from cloudflare:workers instead. Dynamic import so local Node dev
	// doesn't try to resolve the Workers-only module at build time.
	try {
		const mod = (await import(/* @vite-ignore */ "cloudflare:workers")) as {
			env?: Record<string, string | undefined>;
		};
		if (mod?.env) return mod.env;
	} catch {
		// not running on Cloudflare — fall through
	}
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
	const env = await getRuntimeEnv(locals);
	const secret = env.PRIVATE_ACCESS_SECRET ?? "";
	return computeHmac(secret);
}

export async function isUnlocked(cookies: AstroCookies, locals: App.Locals): Promise<boolean> {
	const token = cookies.get(COOKIE_NAME)?.value;
	if (!token) return false;
	const expected = await makeUnlockCookieValue(locals);
	return token === expected;
}

export async function verifyPassword(submitted: string, locals: App.Locals): Promise<boolean> {
	const env = await getRuntimeEnv(locals);
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
