import type { APIContext } from "astro";
import { makeUnlockCookieValue, verifyPassword } from "../../lib/access";

export const prerender = false;

const COOKIE_NAME = "project_access_token";
const COOKIE_OPTIONS = {
	httpOnly: true,
	sameSite: "lax" as const,
	path: "/",
	maxAge: 60 * 60 * 24 * 365,
};

function setUnlockCookie(cookies: APIContext["cookies"], value: string, secure: boolean) {
	cookies.set(COOKIE_NAME, value, { ...COOKIE_OPTIONS, secure });
}

function safeSlug(value: string | null): string | null {
	return value && /^[a-z0-9-]+$/i.test(value) ? value : null;
}

export async function POST({ request, cookies, locals, redirect }: APIContext) {
	const data = await request.formData();
	const password = String(data.get("password") ?? "");
	const from = safeSlug(String(data.get("from") ?? ""));

	if (!(await verifyPassword(password, locals))) {
		const dest = from ? `/projects/${from}?error=1` : "/work?error=1";
		return redirect(dest);
	}

	const token = await makeUnlockCookieValue(locals);
	setUnlockCookie(cookies, token, import.meta.env.PROD);

	return redirect(from ? `/projects/${from}` : "/work");
}

export async function GET({ url, cookies, locals, redirect }: APIContext) {
	const token = String(url.searchParams.get("token") ?? "");
	const from = safeSlug(url.searchParams.get("from"));

	if (!(await verifyPassword(token, locals))) {
		return redirect("/work");
	}

	const cookieValue = await makeUnlockCookieValue(locals);
	setUnlockCookie(cookies, cookieValue, import.meta.env.PROD);

	return redirect(from ? `/projects/${from}` : "/work");
}
