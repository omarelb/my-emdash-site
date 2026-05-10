/**
 * Proxy for the emdash forms submit endpoint.
 *
 * The plugin API wraps its response in { data: ... } but the forms plugin's
 * own client-side JS expects the payload at the top level. This relay unwraps it.
 */
import type { APIContext } from "astro";

export const prerender = false;

export async function POST({ request }: APIContext) {
	const contentType = request.headers.get("content-type") ?? "";

	let body: BodyInit;
	const headers: Record<string, string> = {};

	if (contentType.includes("multipart/form-data")) {
		body = await request.formData();
	} else {
		headers["Content-Type"] = "application/json";
		body = await request.text();
	}

	// Use the SELF service binding when on Cloudflare to avoid same-zone
	// loop protection (error 1042) on loopback fetches.
	async function selfFetch(input: URL, init: RequestInit): Promise<Response> {
		try {
			const mod = (await import(/* @vite-ignore */ "cloudflare:workers")) as {
				env?: { SELF?: { fetch: (req: Request) => Promise<Response> } };
			};
			const self = mod?.env?.SELF;
			if (self) return self.fetch(new Request(input.toString(), init));
		} catch { /* not on Cloudflare */ }
		return fetch(input, init);
	}

	const upstream = await selfFetch(
		new URL("/_emdash/api/plugins/emdash-forms/submit", request.url),
		{ method: "POST", headers, body },
	);

	const json = (await upstream.json()) as { data?: unknown } | unknown;

	// Unwrap { data: ... } envelope if present
	const payload =
		json && typeof json === "object" && "data" in (json as object)
			? (json as { data: unknown }).data
			: json;

	return new Response(JSON.stringify(payload), {
		status: upstream.ok ? 200 : upstream.status,
		headers: { "Content-Type": "application/json" },
	});
}
