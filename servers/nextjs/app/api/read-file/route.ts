import { siteDirectory } from "@/utils/site-context";
import { NextResponse } from "next/server";
import { readDocumentText } from "@/utils/document-files";

export async function POST(request: Request) {
  try {
    const { filePath } = await request.json();
    const content = readDocumentText(filePath, await siteDirectory("temp"));
    return NextResponse.json({ content }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Document is not accessible" }, { status: 403 });
  }
}
