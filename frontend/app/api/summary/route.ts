import { dateRangeErrorResponse, readDateRange } from "@/lib/date-range";
import { getStore } from "@/lib/runtime-store";

export const runtime = "nodejs";

export function GET(request: Request) {
  try {
    const range = readDateRange(new URL(request.url).searchParams);
    return Response.json(getStore().getSummary(range));
  } catch (error) {
    return dateRangeErrorResponse(error);
  }
}
