import { getStore } from "@/lib/runtime-store";

export const runtime = "nodejs";

export function GET() {
  return Response.json(getStore().getSummary());
}
