import puppeteer from "puppeteer";

import { sanitizeFilename } from "@/app/(presentation-generator)/utils/others";
import { NextResponse, NextRequest } from "next/server";

async function buildPayload(req: NextRequest) {
  if (req.method === "GET") {
    return {
      id: req.nextUrl.searchParams.get("id"),
      title: req.nextUrl.searchParams.get("title"),
      tenant: req.nextUrl.searchParams.get("tenant"),
    };
  }

  const body = await req.json();
  return {
    id: body.id as string | undefined,
    title: (body.title as string | undefined) ?? req.nextUrl.searchParams.get("title"),
    tenant:
      (body.tenant as string | undefined) ?? req.nextUrl.searchParams.get("tenant"),
  };
}

async function exportPdf(req: NextRequest) {
  const { id, title, tenant } = await buildPayload(req);

  if (!id) {
    return NextResponse.json(
      { error: "Missing Presentation ID" },
      { status: 400 }
    );
  }

  if (!tenant) {
    return NextResponse.json(
      { error: "Tenant ID is required" },
      { status: 400 }
    );
  }

  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-web-security",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-features=TranslateUI",
      "--disable-ipc-flooding-protection",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    page.setDefaultNavigationTimeout(300000);
    page.setDefaultTimeout(300000);

    const tenantQuery = `tenant=${encodeURIComponent(tenant)}`;
    const encodedId = encodeURIComponent(id);
    await page.goto(`http://localhost/pdf-maker?id=${encodedId}&${tenantQuery}`, {
      waitUntil: "networkidle0",
      timeout: 300000,
    });

    await page.waitForFunction('() => document.readyState === "complete"');

    try {
      await page.waitForFunction(
        `
        () => {
          const allElements = document.querySelectorAll('*');
          let loadedElements = 0;
          let totalElements = allElements.length;

          for (let el of allElements) {
              const style = window.getComputedStyle(el);
              const isVisible = style.display !== 'none' &&
                              style.visibility !== 'hidden' &&
                              style.opacity !== '0';

              if (isVisible && el.offsetWidth > 0 && el.offsetHeight > 0) {
                  loadedElements++;
              }
          }

          return (loadedElements / totalElements) >= 0.99;
        }
        `,
        { timeout: 300000 }
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.log("Warning: Some content may not have loaded completely:", error);
    }

    const pdfBuffer = await page.pdf({
      width: "1280px",
      height: "720px",
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    const pdfBody =
      pdfBuffer instanceof Uint8Array
        ? pdfBuffer
        : new Uint8Array(pdfBuffer as ArrayBufferLike);

    const sanitizedTitle = sanitizeFilename(title ?? "presentation");
    const filename = `${sanitizedTitle || "presentation"}.pdf`;

    return new NextResponse(pdfBody, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } finally {
    await browser.close();
  }
}

export async function POST(req: NextRequest) {
  return exportPdf(req);
}

export async function GET(req: NextRequest) {
  return exportPdf(req);
}
