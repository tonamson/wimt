import { getStore } from "@/lib/runtime-store";

export const runtime = "nodejs";

export function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 100);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  return Response.json({
    items: getStore().listRequests(
      Number.isFinite(limit) ? Math.min(limit, 200) : 100,
      Number.isFinite(offset) ? offset : 0,
    ),
  });
}
