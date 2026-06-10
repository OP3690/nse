// Proxy + text extractor for a single NSE filing PDF.
//
// The browser can't fetch nsearchives.nseindia.com directly (CORS, and NSE
// gates archive downloads behind a warmed cookie + Referer). This route runs
// server-side: it warms an NSE session, downloads the PDF, and extracts the
// first few pages of text with pdf.js. The *analysis* of that text — the
// trigger read, key words and key sentences — then runs in the browser
// (app/lib/pdfReader.js), so the "advanced read" is genuinely client-side.
//
// Scope is locked to *.nseindia.com (SSRF guard): this is a PDF text reader,
// not an open proxy.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MAX_PAGES = 8;
const MAX_CHARS = 24000;

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

async function extractText(buf) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;
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
    const bytes = buf.byteLength; // capture before pdf.js detaches the buffer
    if (!buf || bytes < 200) {
      return Response.json({ ok: false, error: "Filing was empty." }, { status: 502 });
    }
    const { text, nPages } = await extractText(buf);
    return Response.json({
      ok: true,
      text,
      nPages,
      hasText: Boolean(text),
      bytes,
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: "Could not read this filing (it may be a scanned image)." },
      { status: 500 },
    );
  }
}
