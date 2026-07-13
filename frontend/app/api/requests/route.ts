import { dateRangeErrorResponse, readDateRange } from "@/lib/date-range";
import { getStore } from "@/lib/runtime-store";

export const runtime = "nodejs";

export function GET(request: Request) {
  const url = new URL(request.url);
  let range: ReturnType<typeof readDateRange>;

  try {
    range = readDateRange(url.searchParams);
  } catch (error) {
    return dateRangeErrorResponse(error);
  }

  const requestedLimit = Number(url.searchParams.get("limit") ?? 15);
  const requestedCursor = Number(url.searchParams.get("cursor"));
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(0, Math.min(requestedLimit, 200))
    : 15;
  const cursor =
    Number.isFinite(requestedCursor) && requestedCursor > 0
      ? requestedCursor
      : undefined;
  const rows = getStore().listRequests(limit + 1, cursor, range);
  const items = rows.slice(0, limit);

  return Response.json({
    items,
    nextCursor:
      rows.length > limit && items.length > 0 ? items.at(-1)!.id : null,
  });
}
