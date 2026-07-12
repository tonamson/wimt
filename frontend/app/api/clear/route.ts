import { getStore } from "@/lib/runtime-store";

export const runtime = "nodejs";

export function POST() {
  getStore().clearRequests();
  return Response.json({ ok: true });
}
