import { getStore } from "@/lib/runtime-store";

export const runtime = "nodejs";

export function POST() {
  return Response.json(getStore().startSession());
}
