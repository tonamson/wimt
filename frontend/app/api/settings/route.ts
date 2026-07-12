import { getStore } from "@/lib/runtime-store";

export const runtime = "nodejs";

export function GET() {
  return Response.json(getStore().getSettings());
}

export async function POST(request: Request) {
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
}

function validateUrl(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const url = new URL(value);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("upstream URL must be http or https");
  }

  return url.toString().replace(/\/$/, "");
}
