import { dateRangeErrorResponse, readDateRange } from "@/lib/date-range";
import { getStore } from "@/lib/runtime-store";

export const runtime = "nodejs";

export function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  let range: ReturnType<typeof readDateRange>;

  try {
    range = readDateRange(searchParams);
  } catch (error) {
    return dateRangeErrorResponse(error);
  }

  return Response.json(getStore().getSummary(range));
}
