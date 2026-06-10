// Proxy + text extractor for a single NSE filing PDF.
//
// The browser can't fetch nsearchives.nseindia.com directly (CORS, and NSE
// gates archive downloads behind a warmed cookie + Referer). This route runs
// server-side: it warms an NSE session, downloads the PDF, and extracts text.
// First it tries the embedded text layer (pdf.js). If the filing is a scanned
// image with no text layer, it falls back to OCR (render the first pages with
// pdf.js + @napi-rs/canvas, recognise English text with tesseract.js). The
// *analysis* of the resulting text — the trigger read, key words and key
// sentences — then runs in the browser (app/lib/pdfReader.js).
//
// Scope is locked to *.nseindia.com (SSRF guard): this is a PDF text reader,
// not an open proxy.

import os from "node:os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MAX_PAGES = 8;
const MAX_CHARS = 24000;
const OCR_PAGES = 3; // OCR is slow (~2-3s/page); the substance is up front.
const MIN_TEXT = 60; // below this many real characters we treat it as scanned.

function allowed(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:") return false;
    return u.hostname === "nseindia.com" || u.hostname.endsWith(".nseindia.com");
  } catch {
    return false;
  }
}

// Warm an NSE session so the archive host serves the file, returning a Cookie
// header value (best-effort — many archive URLs serve without it too).
async function warmCookies() {
  try {
    const res = await fetch("https://www.nseindia.com/", {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      cache: "no-store",
    });
    const jar = typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : (res.headers.get("set-cookie") ? [res.headers.get("set-cookie")] : []);
    return jar.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
  } catch {
    return "";
  }
}

// pdf.js detaches the ArrayBuffer it is handed, so every consumer gets a fresh
// copy (.slice()) and the source Uint8Array stays reusable across passes.
async function loadDoc(u8, extra = {}) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs.getDocument({
    data: u8.slice(),
    isEvalSupported: false,
    disableFontFace: true,
    ...extra,
  }).promise;
}

// Embedded text layer (instant when present; empty for scanned/image PDFs).
async function extractText(u8) {
  const doc = await loadDoc(u8, { useSystemFonts: true });
  const nPages = doc.numPages;
  const parts = [];
  let chars = 0;
  for (let p = 1; p <= Math.min(nPages, MAX_PAGES); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Rebuild line structure: pdf.js flags end-of-line items, which lets the
    // reader find the "Subject:" line and split sentences sensibly.
    let line = "";
    const lines = [];
    for (const it of content.items) {
      if (!("str" in it)) continue;
      line += it.str;
      if (it.hasEOL) {
        lines.push(line);
        line = "";
      } else if (it.str) {
        line += " ";
      }
    }
    if (line) lines.push(line);
    parts.push(lines.join("\n"));
    chars += parts[parts.length - 1].length;
    if (chars > MAX_CHARS) break;
  }
  await doc.cleanup().catch(() => {});
  return { text: parts.join("\n").trim().slice(0, MAX_CHARS), nPages };
}

// OCR fallback for scanned English filings: rasterise the first pages and run
// tesseract. Heavy, so it is only reached when there's no embedded text.
async function ocrText(u8) {
  const { createCanvas } = await import("@napi-rs/canvas");
  const { createWorker } = await import("tesseract.js");

  class NodeCanvasFactory {
    create(width, height) {
      const canvas = createCanvas(width, height);
      return { canvas, context: canvas.getContext("2d") };
    }
    reset(cc, width, height) { cc.canvas.width = width; cc.canvas.height = height; }
    destroy(cc) { if (cc.canvas) { cc.canvas.width = 0; cc.canvas.height = 0; } cc.canvas = null; cc.context = null; }
  }

  const doc = await loadDoc(u8, { CanvasFactory: NodeCanvasFactory });
  const nPages = doc.numPages;
  const worker = await createWorker("eng", 1, { cachePath: os.tmpdir() });
  const parts = [];
  try {
    for (let p = 1; p <= Math.min(nPages, OCR_PAGES); p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(viewport.width, viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const png = canvas.toBuffer("image/png");
      const { data: { text } } = await worker.recognize(png);
      if (text) parts.push(text);
      if (parts.join("").length > MAX_CHARS) break;
    }
  } finally {
    await worker.terminate().catch(() => {});
    await doc.cleanup().catch(() => {});
  }
  return { text: parts.join("\n").trim().slice(0, MAX_CHARS), nPages };
}

export async function GET(request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url || !allowed(url)) {
    return Response.json({ ok: false, error: "Only NSE filing URLs can be read." }, { status: 400 });
  }

  try {
    const cookie = await warmCookies();
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Referer: "https://www.nseindia.com/",
        Accept: "application/pdf,*/*",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return Response.json({ ok: false, error: `Filing fetch failed (HTTP ${res.status}).` }, { status: 502 });
    }
    const buf = await res.arrayBuffer();
    const bytes = buf.byteLength;
    if (!buf || bytes < 200) {
      return Response.json({ ok: false, error: "Filing was empty." }, { status: 502 });
    }
    const u8 = new Uint8Array(buf);

    let { text, nPages } = await extractText(u8);
    let ocr = false;
    if (text.replace(/\s/g, "").length < MIN_TEXT) {
      try {
        const r = await ocrText(u8);
        if (r.text.replace(/\s/g, "").length >= MIN_TEXT) {
          text = r.text;
          nPages = r.nPages;
          ocr = true;
        }
      } catch {
        /* OCR is best-effort; fall through with whatever (little) text we have */
      }
    }

    return Response.json({ ok: true, text, nPages, hasText: Boolean(text), ocr, bytes });
  } catch (err) {
    return Response.json(
      { ok: false, error: "Could not read this filing." },
      { status: 500 },
    );
  }
}
