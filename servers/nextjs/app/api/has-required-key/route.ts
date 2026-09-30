import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ hasKey: Boolean(process.env.OPENAI_API_KEY?.trim()) },
    { headers: { "Cache-Control": "no-store" } });
}
