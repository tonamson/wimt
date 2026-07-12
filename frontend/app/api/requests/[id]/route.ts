import { getStore } from "@/lib/runtime-store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const item = getStore().getRequest(Number(id));

  if (!item) {
    return Response.json({ error: "request not found" }, { status: 404 });
  }

  return Response.json(item);
}
