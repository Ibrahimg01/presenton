import { NextResponse } from "next/server";

// Hosted deployments configure provider credentials on the server only.
// Never return a configuration file containing secrets to a browser.
export async function GET() {
  return NextResponse.json({ error: "Configure provider credentials on the server" }, { status: 403 });
}

export async function POST() {
  return NextResponse.json({ error: "Configure provider credentials on the server" }, { status: 403 });
}
