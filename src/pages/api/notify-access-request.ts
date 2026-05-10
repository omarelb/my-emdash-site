import type { APIContext } from "astro";

export const prerender = false;

export async function POST({ request, locals }: APIContext) {
	const cfEnv = (locals as unknown as { runtime?: { env?: Record<string, string> } }).runtime?.env;
	const env: Record<string, string | undefined> = cfEnv ?? (import.meta.env as Record<string, string | undefined>);
	const webhookUrl = env.ACCESS_REQUEST_WEBHOOK_URL;

	if (!webhookUrl) {
		return new Response(JSON.stringify({ error: "Webhook not configured" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}

	let payload: Record<string, unknown>;
	try {
		payload = (await request.json()) as Record<string, unknown>;
	} catch {
		return new Response(JSON.stringify({ error: "Invalid request body" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const data = (payload.data ?? {}) as Record<string, unknown>;
	const name = String(data.name ?? "Unknown");
	const email = String(data.email ?? "");
	const message = String(data.message ?? "");

	const discordPayload = {
		content: `**Access request** from **${name}**${email ? ` (${email})` : ""}${message ? `\n> ${message}` : ""}`,
	};

	try {
		const res = await fetch(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(discordPayload),
		});

		if (!res.ok) {
			return new Response(JSON.stringify({ error: "Webhook delivery failed" }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			});
		}

		return new Response(JSON.stringify({ ok: true }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (err) {
		return new Response(JSON.stringify({ error: "Webhook request failed" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
}
