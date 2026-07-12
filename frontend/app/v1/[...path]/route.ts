import { proxyAiRequest } from "@/lib/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: Context) {
  return proxy(request, context);
}

export async function POST(request: Request, context: Context) {
  return proxy(request, context);
}

export async function PUT(request: Request, context: Context) {
  return proxy(request, context);
}

export async function DELETE(request: Request, context: Context) {
  return proxy(request, context);
}

async function proxy(request: Request, context: Context) {
  const { path } = await context.params;
  return proxyAiRequest(request, path);
}
