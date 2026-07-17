import { getStore } from "@/lib/runtime-store";

export const runtime = "nodejs";

export function GET() {
  const settings = getStore().getSettings();
  const proxyPublicBaseUrl = process.env.PROXY_PUBLIC_BASE_URL?.replace(
    /\/$/,
    "",
  );

  return Response.json({
    ...settings,
    // Optional public CLI entry (normally WIMT on :4393). UI uses this for
    // proxy URL copy/export; falls back to the page origin when unset.
    proxyPublicBaseUrl: proxyPublicBaseUrl || null,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const settings = {
      openaiUpstreamBaseUrl: validateUrl(body.openaiUpstreamBaseUrl),
      anthropicUpstreamBaseUrl: validateUrl(body.anthropicUpstreamBaseUrl),
      defaultProvider:
        body.defaultProvider === "openai" ||
        body.defaultProvider === "anthropic" ||
        body.defaultProvider === "auto"
          ? body.defaultProvider
          : undefined,
    };

    return Response.json(getStore().updateSettings(settings));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid settings payload";
    return Response.json({ error: message }, { status: 400 });
  }
}

function validateUrl(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("upstream URL must be a valid http(s) URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("upstream URL must be http or https");
  }

  return url.toString().replace(/\/$/, "");
}
