/* =========================================================
   PaginaPDF v2.0.0b — script.js
   Robust print-block removal + reliable PDF generation
   ========================================================= */

"use strict";

// ─── DOM refs ───────────────────────────────────────────────
const $ = (s) => document.querySelector(s);
const tabs              = document.querySelectorAll(".tab-btn");
const panes             = document.querySelectorAll(".tab-pane");
const urlInput          = $("#urlInput");
const htmlInput         = $("#htmlInput");
const fileInput         = $("#fileInput");
const fileNameInput     = $("#fileNameInput");
const formatInput       = $("#formatInput");
const orientationInput  = $("#orientationInput");
const qualityInput      = $("#qualityInput");
const readableModeInput = $("#readableModeInput");
const rightsInput       = $("#rightsInput");
const loadUrlButton     = $("#loadUrlButton");
const loadHtmlButton    = $("#loadHtmlButton");
const loadFileButton    = $("#loadFileButton");
const generateButton    = $("#generateButton");
const clearButton       = $("#clearButton");
const statusBox         = $("#statusBox");
const previewFrame      = $("#previewFrame");
const emptyPreview      = $("#emptyPreview");
const loadingVeil       = $("#loadingVeil");
const loadingMsg        = $("#loadingMsg");
const previewTitle      = $("#previewTitle");
const previewState      = $("#previewState");
const modeContinuousBtn = $("#modeContinuousBtn");
const modePagesBtn      = $("#modePagesBtn");
const fullscreenBtn     = $("#fullscreenBtn");
const pageCountBadge    = $("#pageCountBadge");
const fullscreenModal   = $("#fullscreenModal");
const modalTitle        = $("#modalTitle");
const modalPageCount    = $("#modalPageCount");
const modalModeContinuousBtn = $("#modalModeContinuousBtn");
const modalModePagesBtn = $("#modalModePagesBtn");
const closeModalBtn     = $("#closeModalBtn");
const modalFrame        = $("#modalFrame");
const reportBox         = $("#printBlockReport");
const reportCountEl     = $("#reportCount");
const reportListEl      = $("#reportList");
const diffPanel         = $("#diffPanel");
const diffBefore        = $("#diffBefore");
const diffAfter         = $("#diffAfter");
const screenReport      = $("#screenReport");
const screenStats       = $("#screenStats");
const ocrTextBox        = $("#ocrTextBox");
const screenLinkList    = $("#screenLinkList");

// ─── State ──────────────────────────────────────────────────
let hasPreview = false;
let currentTitle = "pagina-pdf";
let currentPreviewMode = "continuous";
let lastCleanHtml = "";
let lastDetection = null;
let lastRemoved = [];
let lastDiffData = [];   // { before: string, after: string, label: string }[]

// =========================================================
// TAB SWITCHING
// =========================================================
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    tabs.forEach((t) => {
      const active = t === tab;
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", String(active));
    });
    panes.forEach((p) => p.classList.toggle("active", p.dataset.pane === target));
  });
});

// =========================================================
// EVENT BINDINGS
// =========================================================
rightsInput.addEventListener("change", updateGenerateState);
loadUrlButton.addEventListener("click", loadFromUrl);
loadHtmlButton.addEventListener("click", loadFromTextArea);
loadFileButton.addEventListener("click", loadFromFile);
generateButton.addEventListener("click", generateScreenPdf);
clearButton.addEventListener("click", clearAll);

modeContinuousBtn.addEventListener("click", () => setPreviewMode("continuous"));
modePagesBtn.addEventListener("click", () => setPreviewMode("pages"));
modalModeContinuousBtn.addEventListener("click", () => setPreviewMode("continuous"));
modalModePagesBtn.addEventListener("click", () => setPreviewMode("pages"));

fullscreenBtn.addEventListener("click", openFullscreenPreview);
closeModalBtn.addEventListener("click", closeFullscreenPreview);

formatInput.addEventListener("change", updatePreviewPagination);
orientationInput.addEventListener("change", updatePreviewPagination);

urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); loadFromUrl(); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !fullscreenModal.hidden) closeFullscreenPreview();
});

// =========================================================
// UI UTILITIES
// =========================================================
function setBusy(busy, msg = "Preparazione contenuto...") {
  loadingVeil.hidden = !busy;
  if (loadingMsg) loadingMsg.textContent = msg;
  loadUrlButton.disabled  = busy;
  loadHtmlButton.disabled = busy;
  loadFileButton.disabled = busy;
  generateButton.disabled = busy || !hasPreview || !rightsInput.checked;
}

function setStatus(message, type = "") {
  statusBox.textContent = message;
  statusBox.className = `status-box ${type}`.trim();
}

function updateGenerateState() {
  generateButton.disabled = !hasPreview || !rightsInput.checked;
  if (hasPreview && !rightsInput.checked) previewState.textContent = "Conferma diritti";
  else if (hasPreview)                    previewState.textContent = "Pronto";
}

// =========================================================
// LOADERS
// =========================================================
async function loadFromUrl() {
  let url;
  try { url = normalizeHttpUrl(urlInput.value.trim()); }
  catch (e) { setStatus(e.message, "error"); return; }

  setBusy(true, "Recupero pagina pubblica...");
  setStatus("Recupero della pagina in corso...");
  try {
    const html = await fetchPublicHtml(url);
    const title = getTitleFromHtml(html) || hostnameToTitle(url);
    await preparePreview(html, url, title);
    const n = lastRemoved.length;
    setStatus(`Anteprima pronta.${n > 0 ? ` ${n} blocchi stampa rimossi.` : ""} Conferma i diritti e genera il PDF.`, "success");
  } catch (e) { setStatus(e.message, "error"); }
  finally { setBusy(false); updateGenerateState(); }
}

async function loadFromTextArea() {
  const raw = htmlInput.value.trim();
  if (!raw) { setStatus("Incolla prima HTML o testo.", "error"); return; }
  setBusy(true, "Analisi contenuto...");
  try {
    const html = looksLikeHtml(raw) ? raw : textToHtml(raw);
    const title = getTitleFromHtml(html) || "contenuto-incollato";
    await preparePreview(html, window.location.href, title);
    const n = lastRemoved.length;
    setStatus(`Contenuto preparato.${n > 0 ? ` ${n} blocchi stampa rimossi.` : ""} Conferma i diritti.`, "success");
  } catch (e) { setStatus(e.message, "error"); }
  finally { setBusy(false); updateGenerateState(); }
}

async function loadFromFile() {
  const file = fileInput.files?.[0];
  if (!file) { setStatus("Scegli un file HTML, HTM o TXT.", "error"); return; }
  setBusy(true, "Lettura file locale...");
  try {
    const text = await file.text();
    const html = looksLikeHtml(text) ? text : textToHtml(text);
    const title = getTitleFromHtml(html) || stripExtension(file.name);
    await preparePreview(html, window.location.href, title);
    const n = lastRemoved.length;
    setStatus(`File letto.${n > 0 ? ` ${n} blocchi stampa rimossi.` : ""} Conferma i diritti.`, "success");
  } catch (e) { setStatus(`Errore lettura file: ${e.message}`, "error"); }
  finally { setBusy(false); updateGenerateState(); }
}

// =========================================================
// URL FETCH (CORS + triple proxy fallback)
// =========================================================
function normalizeHttpUrl(v) {
  if (!v) throw new Error("Inserisci un URL pubblico.");
  const wp = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  const u = new URL(wp);
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Solo URL http/https.");
  return u.href;
}

async function fetchPublicHtml(url) {
  // Diretto
  try {
    const r = await fetch(url, { mode: "cors", credentials: "omit" });
    if (r.ok) { const t = await r.text(); if (t.trim().length > 0) return t; }
  } catch (_) {}
  setStatus("Recupero diretto bloccato (CORS). Provo via proxy...");

  const proxies = [
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`
  ];
  for (const p of proxies) {
    try {
      const r = await fetch(p);
      if (r.ok) { const t = await r.text(); if (t.trim().length > 50) return t; }
    } catch (_) {}
  }
  throw new Error("Impossibile leggere l'URL. Usa la scheda 'HTML / Testo' e incolla manualmente la sorgente (Ctrl+U).");
}

// =========================================================
// PRINT-BLOCK DETECTOR & REMOVER (v2.0.0b)
// =========================================================

function extractMediaPrintBlocks(css) {
  const blocks = [];
  const re = /@media[^{]*\bprint\b[^{]*\{/gi;
  let match;
  while ((match = re.exec(css)) !== null) {
    const start = match.index;
    let depth = 1, i = match.index + match[0].length;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    blocks.push({ start, end: i, body: css.slice(start, i) });
  }
  return blocks;
}

function neutralizeMediaPrintBlock(body) {
  const inner = body.replace(/^@media[^{]*\{/, "").replace(/\}\s*$/, "");
  let c = inner
    .replace(/display\s*:\s*none\s*!?\s*important?\s*;?/gi, "")
    .replace(/visibility\s*:\s*hidden\s*!?\s*important?\s*;?/gi, "")
    .replace(/opacity\s*:\s*0\s*!?\s*important?\s*;?/gi, "")
    .replace(/(max-)?height\s*:\s*0\s*!?\s*important?\s*;?/gi, "")
    .replace(/filter\s*:\s*(blur|grayscale)\([^)]*\)[^;]*;?/gi, "")
    .replace(/transform\s*:\s*scale\(\s*0\s*\)[^;]*;?/gi, "")
    .replace(/font-size\s*:\s*0\s*!?\s*important?\s*;?/gi, "")
    .replace(/color\s*:\s*transparent\s*!?\s*important?\s*;?/gi, "")
    .replace(/content\s*:\s*none\s*!?\s*important?\s*;?/gi, "")
    .replace(/overflow\s*:\s*hidden\s*!?\s*important?\s*;?/gi, "");
  if (!/[a-z-]+\s*:/i.test(c)) return "";
  return "@media print {" + c + "}";
}

function detectPrintBlockers(rawHtml, doc) {
  const found = [];
  const seen = new Set();
  const add = (id, where, sample) => {
    const k = id + "|" + where;
    if (seen.has(k)) return;
    seen.add(k);
    found.push({ id, where, sample: (sample || "").slice(0, 100).replace(/\s+/g, " ").trim() });
  };

  extractMediaPrintBlocks(rawHtml).forEach((b, i) => {
    const bd = b.body;
    if (/display\s*:\s*none/i.test(bd))       add("media-print-hide", "CSS", bd);
    if (/visibility\s*:\s*hidden/i.test(bd))  add("media-print-vis",  "CSS", bd);
    if (/opacity\s*:\s*0/i.test(bd))          add("media-print-opa",  "CSS", bd);
    if (/(max-)?height\s*:\s*0/i.test(bd))    add("media-print-h0",   "CSS", bd);
    if (/filter\s*:\s*(blur|grayscale)/i.test(bd)) add("media-print-filter", "CSS", bd);
    add("media-print-block", `CSS (blocco ${i+1})`, bd);
  });

  doc.querySelectorAll("style").forEach((s, idx) => {
    extractMediaPrintBlocks(s.textContent || "").forEach((b) => {
      const bd = b.body;
      if (/display\s*:\s*none/i.test(bd))       add("media-print-hide", `<style #${idx+1}>`, bd);
      if (/visibility\s*:\s*hidden/i.test(bd))  add("media-print-vis",  `<style #${idx+1}>`, bd);
    });
  });

  const all = rawHtml;
  if (/window\.onbeforeprint\s*=/i.test(all))                  add("onbeforeprint",    "JS", "window.onbeforeprint");
  if (/window\.onafterprint\s*=/i.test(all))                   add("onafterprint",     "JS", "window.onafterprint");
  if (/addEventListener\s*\(\s*['"]beforeprint/i.test(all))    add("event-beforeprint","JS", "addEventListener('beforeprint')");
  if (/addEventListener\s*\(\s*['"]afterprint/i.test(all))     add("event-afterprint", "JS", "addEventListener('afterprint')");
  if (/matchMedia\s*\(\s*['"]print['"]\s*\)/i.test(all))       add("matchmedia",       "JS", "matchMedia('print')");
  if (/window\.print\s*=\s*function/i.test(all))               add("override-print",   "JS", "override window.print()");
  if (/user-select\s*:\s*none/i.test(all))                     add("user-select-none", "CSS", "user-select: none");
  if (/-webkit-user-select\s*:\s*none/i.test(all))             add("webkit-us-none",   "CSS", "-webkit-user-select: none");

  doc.querySelectorAll("[onbeforeprint],[onafterprint]").forEach((el) => {
    add("attr-onprint", `<${el.tagName.toLowerCase()}>`, "attributo inline");
  });
  doc.querySelectorAll("[style]").forEach((el) => {
    const s = el.getAttribute("style") || "";
    if (/display\s*:\s*none/i.test(s))      add("inline-dn", `<${el.tagName.toLowerCase()}>`, s);
    if (/visibility\s*:\s*hidden/i.test(s)) add("inline-vh", `<${el.tagName.toLowerCase()}>`, s);
    if (/user-select\s*:\s*none/i.test(s))  add("inline-us", `<${el.tagName.toLowerCase()}>`, s);
  });

  return { found, total: found.length };
}

/**
 * Rimuove tutti i blocchi stampa. Salva i dati prima/dopo per il diff.
 */
function removePrintBlockers(doc, rawHtml) {
  const removed = new Set();
  const diffs = []; // { before, after, label }

  // 1) Pulisci <style> con parser annidato
  doc.querySelectorAll("style").forEach((styleEl, idx) => {
    let css = styleEl.textContent || "";
    if (!css.trim()) return;
    const blocks = extractMediaPrintBlocks(css).reverse();
    blocks.forEach((b) => {
      const neutral = neutralizeMediaPrintBlock(b.body);
      diffs.push({
        label: `<style #${idx+1}> — @media print`,
        before: b.body.trim(),
        after: neutral ? neutral.trim() : "(completamente rimosso)"
      });
      css = css.slice(0, b.start) + neutral + css.slice(b.end);
      removed.add("media-print-block");
    });

    const orig = css;
    css = css
      .replace(/user-select\s*:\s*none\s*!?\s*important?\s*;?/gi, (m) => { diffs.push({ label: `<style #${idx+1}> — user-select`, before: m.trim(), after: "user-select: text;" }); return "user-select: text;"; })
      .replace(/-webkit-user-select\s*:\s*none\s*!?\s*important?\s*;?/gi, (m) => { diffs.push({ label: `<style #${idx+1}> — -webkit-user-select`, before: m.trim(), after: "-webkit-user-select: text;" }); return "-webkit-user-select: text;"; })
      .replace(/print-color-adjust\s*:\s*economy/gi, "print-color-adjust: exact")
      .replace(/-webkit-print-color-adjust\s*:\s*economy/gi, "-webkit-print-color-adjust: exact");
    if (css !== orig) removed.add("css-globale");
    styleEl.textContent = css;
  });

  // 2) Attributi style inline
  doc.querySelectorAll("[style]").forEach((el) => {
    let s = el.getAttribute("style") || "";
    const orig = s;
    s = s
      .replace(/display\s*:\s*none\s*!?\s*important?\s*;?/gi, "")
      .replace(/visibility\s*:\s*hidden\s*!?\s*important?\s*;?/gi, "visibility: visible;")
      .replace(/user-select\s*:\s*none\s*!?\s*important?\s*;?/gi, "user-select: text;")
      .replace(/-webkit-user-select\s*:\s*none\s*!?\s*important?\s*;?/gi, "-webkit-user-select: text;")
      .replace(/opacity\s*:\s*0\s*!?\s*important?\s*;?/gi, "")
      .replace(/pointer-events\s*:\s*none\s*!?\s*important?\s*;?/gi, "");
    if (s.trim() !== orig.trim()) {
      diffs.push({ label: `<${el.tagName.toLowerCase()}> — style inline`, before: orig.trim(), after: s.trim() || "(rimosso)" });
      el.setAttribute("style", s.trim());
      removed.add("inline-style");
    }
  });

  // 3) Attributi onbeforeprint/onafterprint
  doc.querySelectorAll("[onbeforeprint],[onafterprint]").forEach((el) => {
    const tag = el.tagName.toLowerCase();
    const bp = el.getAttribute("onbeforeprint");
    const ap = el.getAttribute("onafterprint");
    if (bp) { diffs.push({ label: `<${tag}> — onbeforeprint`, before: `onbeforeprint="${bp}"`, after: "(rimosso)" }); el.removeAttribute("onbeforeprint"); }
    if (ap) { diffs.push({ label: `<${tag}> — onafterprint`,  before: `onafterprint="${ap}"`,  after: "(rimosso)" }); el.removeAttribute("onafterprint"); }
    removed.add("attr-onprint");
  });

  // 4) Override CSS finale
  const ov = doc.createElement("style");
  ov.id = "paginapdf-print-override";
  ov.textContent = `
    /* PaginaPDF v2.0.0b – Print override */
    @media print, screen {
      *, *::before, *::after {
        user-select: text !important;
        -webkit-user-select: text !important;
        pointer-events: auto !important;
      }
    }
    @media print {
      html, body {
        display: block !important; visibility: visible !important;
        opacity: 1 !important; height: auto !important;
        max-height: none !important; overflow: visible !important;
        filter: none !important; background: #fff !important;
      }
      * {
        visibility: visible !important; opacity: 1 !important;
        filter: none !important; print-color-adjust: exact !important;
        -webkit-print-color-adjust: exact !important;
      }
    }`;
  doc.head.appendChild(ov);
  removed.add("override-injected");

  return { doc, removed: Array.from(removed), diffs };
}

// =========================================================
// SANITIZE
// =========================================================
function sanitizeHtml(rawHtml, baseUrl, readableMode) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, "text/html");
  const base = createSafeBase(baseUrl);

  lastDetection = detectPrintBlockers(rawHtml, doc);
  const { removed, diffs } = removePrintBlockers(doc, rawHtml);
  lastRemoved = removed;
  lastDiffData = diffs;

  doc.querySelectorAll("script, iframe, object, embed, applet, form, noscript, meta[http-equiv='refresh']").forEach((n) => n.remove());

  doc.querySelectorAll("*").forEach((el) => {
    [...el.attributes].forEach((a) => {
      const nm = a.name.toLowerCase();
      const vl = (a.value || "").trim();
      if (nm.startsWith("on")) el.removeAttribute(a.name);
      if (["href", "src", "poster", "xlink:href"].includes(nm)) {
        if (/^javascript:|^data:text\/html/i.test(vl)) el.removeAttribute(a.name);
        else { try { el.setAttribute(a.name, absolutize(vl, base)); } catch (_) {} }
      }
    });
  });

  doc.querySelectorAll("link[href]").forEach((l) => {
    const rel = (l.getAttribute("rel") || "").toLowerCase();
    if (rel && !rel.includes("stylesheet") && !rel.includes("preload")) { l.remove(); return; }
    l.setAttribute("href", absolutize(l.getAttribute("href"), base));
  });

  doc.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src");
    if (src) { try { img.setAttribute("src", absolutize(src, base)); } catch (_) {} }
    img.setAttribute("loading", "eager");
    img.setAttribute("decoding", "sync");
    img.setAttribute("referrerpolicy", "no-referrer");
    if (!img.getAttribute("alt")) img.setAttribute("alt", "");
  });

  doc.querySelectorAll("a[href]").forEach((a) => {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noreferrer");
  });

  if (readableMode) {
    removeAdsAndNoise(doc);
    removeLikelyOverlays(doc);
    flattenFixedSticky(doc);
  }
  return doc;
}

function removeAdsAndNoise(doc) {
  const adWords = /(\bads?\b|advert|advertisement|sponsor|sponsored|promoted|promo|affiliate|taboola|outbrain|adservice|doubleclick|googlesyndication|google_ads|ad-container|ad-wrapper|banner-ad|native-ad)/i;
  doc.querySelectorAll("body *").forEach((el) => {
    const haystack = [
      el.id || "",
      el.className || "",
      el.getAttribute("aria-label") || "",
      el.getAttribute("role") || "",
      el.getAttribute("data-ad") || "",
      el.getAttribute("data-testid") || ""
    ].join(" ");

    const tag = el.tagName.toLowerCase();
    if (["article", "main", "body", "html"].includes(tag)) return;

    const looksLikeAd = adWords.test(haystack);
    const smallText = textLength(el) < 2200;
    const hasManyExternalFrames = el.querySelectorAll("iframe, ins, script").length > 0;
    if (looksLikeAd && (smallText || hasManyExternalFrames)) {
      el.remove();
    }
  });
}

function removeLikelyOverlays(doc) {
  const w = /(cookie|consent|gdpr|privacy|newsletter|subscribe|modal|popup|paywall|banner|notice|overlay|backdrop)/i;
  doc.querySelectorAll("body *").forEach((el) => {
    const ci = `${el.id || ""} ${el.className || ""}`;
    const st = el.getAttribute("style") || "";
    const fx = /position\s*:\s*(fixed|sticky)/i.test(st);
    if (fx && w.test(ci)) el.remove();
  });
}

function flattenFixedSticky(doc) {
  doc.querySelectorAll("style").forEach((s) => {
    s.textContent = (s.textContent || "")
      .replace(/position\s*:\s*fixed/gi, "position: static")
      .replace(/position\s*:\s*sticky/gi, "position: static");
  });
}

// =========================================================
// BUILD PREVIEW DOCUMENT
// =========================================================
function buildPreviewDocument(doc, title) {
  const headStyles = [];
  doc.head.querySelectorAll("style").forEach((s) => headStyles.push(s.outerHTML));
  doc.head.querySelectorAll('link[rel~="stylesheet"]').forEach((l) => headStyles.push(l.outerHTML));
  const safeTitle = escapeHtml(title || "PaginaPDF");
  const body = doc.body?.innerHTML?.trim() || "<p>Nessun contenuto disponibile.</p>";

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle}</title>
${headStyles.join("\n")}
<style>
:root{color-scheme:light}
html,body{margin:0;padding:0;background:#e9dfcf;color:#171512;font-family:Inter,-apple-system,Arial,sans-serif;line-height:1.6}
.pdf-page-host{width:100%;min-height:100vh;display:flex;justify-content:center;padding:20px 0;box-sizing:border-box}
.pdf-document{width:min(96%,820px);min-height:1100px;margin:0;padding:48px 52px;background:#fff!important;color:#171512!important;box-sizing:border-box;overflow-wrap:break-word;position:relative;box-shadow:0 8px 30px rgba(0,0,0,.18)}
.pdf-document *{max-width:100%!important;visibility:visible!important;opacity:1!important}
.pdf-document img,.pdf-document svg,.pdf-document video{max-width:100%!important;height:auto!important}
.pdf-document table{width:100%!important;border-collapse:collapse}
.pdf-document pre,.pdf-document code{white-space:pre-wrap;word-break:break-word}
.pdf-document a{color:#0d5eb8}
.pdf-document h1,.pdf-document h2,.pdf-document h3{line-height:1.2;margin:1em 0 .5em}
.pdf-document p{margin:.6em 0}
body.mode-pages .pdf-page-host{background:#25221d}
.page-divider{position:absolute;left:-52px;right:-52px;height:28px;background:#171512;border-top:2px dashed #f1b84b;border-bottom:2px dashed #f1b84b;display:flex;align-items:center;justify-content:center;color:#f1b84b;font-size:11px;font-weight:800;letter-spacing:2px;z-index:9999;pointer-events:none}
body.mode-continuous .page-divider{display:none}
@media print{body{background:#fff!important}.pdf-page-host{padding:0!important}.pdf-document{box-shadow:none!important;width:100%!important;padding:0!important}.page-divider{display:none!important}}
</style>
</head>
<body class="mode-continuous">
<div class="pdf-page-host">
<main class="pdf-document" id="pdfRoot">${body}</main>
</div>
</body>
</html>`;
}

// =========================================================
// PREPARE PREVIEW
// =========================================================
async function preparePreview(rawHtml, baseUrl, title) {
  const cleanDoc = sanitizeHtml(rawHtml, baseUrl, readableModeInput.checked);
  const html     = buildPreviewDocument(cleanDoc, title);
  lastCleanHtml  = html;

  currentTitle = slugify(title || "pagina-pdf");
  if (!fileNameInput.value || fileNameInput.value === "pagina-pdf.pdf")
    fileNameInput.value = ensurePdfExtension(`${currentTitle}.pdf`);

  previewFrame.srcdoc = html;
  await waitForFrame(previewFrame);
  await waitForImages(previewFrame.contentDocument);

  hasPreview = true;
  emptyPreview.hidden = true;
  previewTitle.textContent = title || "Anteprima PDF";
  previewState.textContent = rightsInput.checked ? "Pronto" : "Conferma diritti";
  fullscreenBtn.disabled = false;
  updatePreviewPagination();
  renderPrintBlockReport(lastDetection, lastRemoved);
  renderDiffPanel(lastDiffData);
}

// =========================================================
// REPORT BLOCCHI STAMPA
// =========================================================
function renderPrintBlockReport(detection, removed) {
  if (!reportBox) return;
  if (!detection || detection.total === 0) { reportBox.hidden = true; return; }

  const labels = {
    "media-print-hide":"@media print → display:none",
    "media-print-vis":"@media print → visibility:hidden",
    "media-print-opa":"@media print → opacity:0",
    "media-print-h0":"@media print → height:0",
    "media-print-filter":"@media print → filter",
    "media-print-block":"Blocco @media print",
    "onbeforeprint":"JS: window.onbeforeprint",
    "onafterprint":"JS: window.onafterprint",
    "event-beforeprint":"JS: addEventListener('beforeprint')",
    "event-afterprint":"JS: addEventListener('afterprint')",
    "matchmedia":"JS: matchMedia('print')",
    "override-print":"JS: override window.print()",
    "user-select-none":"CSS: user-select:none",
    "webkit-us-none":"CSS: -webkit-user-select:none",
    "inline-dn":"Inline: display:none",
    "inline-vh":"Inline: visibility:hidden",
    "inline-us":"Inline: user-select:none",
    "attr-onprint":"Attributo on*print"
  };

  const removedSet = new Set(removed);
  const isRemoved = (id) => {
    if (["onbeforeprint","onafterprint","event-beforeprint","event-afterprint","matchmedia","override-print"].includes(id)) return true;
    if (id.startsWith("media-print")) return removedSet.has("media-print-block");
    if (id.startsWith("inline-"))     return removedSet.has("inline-style");
    if (["user-select-none","webkit-us-none"].includes(id)) return removedSet.has("css-globale") || removedSet.has("override-injected");
    if (id === "attr-onprint") return removedSet.has("attr-onprint");
    return removedSet.has(id);
  };

  const rows = detection.found.map((f) => {
    const ok = isRemoved(f.id);
    const badge = ok
      ? `<span class="block-badge removed">RIMOSSO</span>`
      : `<span class="block-badge detected">RILEVATO</span>`;
    return `<li>${badge} <strong>${labels[f.id] || f.id}</strong> <span class="block-where">— ${f.where}</span></li>`;
  }).join("");

  const nRemoved = detection.found.filter((f) => isRemoved(f.id)).length;
  reportBox.hidden = false;
  reportCountEl.textContent = `${detection.total} rilevati · ${nRemoved} rimossi`;
  reportListEl.innerHTML = rows;
}

// =========================================================
// DIFF PANEL (prima / dopo)
// =========================================================
function renderDiffPanel(diffs) {
  if (!diffPanel || !diffBefore || !diffAfter) return;
  if (!diffs || diffs.length === 0) { diffPanel.hidden = true; return; }

  let beforeHtml = "";
  let afterHtml = "";

  diffs.forEach((d, i) => {
    beforeHtml += `<div class="diff-block">
      <div class="diff-label">${escapeHtml(d.label)}</div>
      <pre class="diff-code diff-removed">${escapeHtml(d.before)}</pre>
    </div>`;
    afterHtml += `<div class="diff-block">
      <div class="diff-label">${escapeHtml(d.label)}</div>
      <pre class="diff-code diff-added">${escapeHtml(d.after)}</pre>
    </div>`;
  });

  diffBefore.innerHTML = beforeHtml;
  diffAfter.innerHTML  = afterHtml;
  diffPanel.hidden = false;
}

// =========================================================
// PREVIEW MODE (continua / pagine)
// =========================================================
function setPreviewMode(mode) {
  currentPreviewMode = mode;
  const c = mode === "continuous";
  modeContinuousBtn.classList.toggle("active", c);
  modePagesBtn.classList.toggle("active", !c);
  modalModeContinuousBtn.classList.toggle("active", c);
  modalModePagesBtn.classList.toggle("active", !c);
  updatePreviewPagination();
}

function updatePreviewPagination() {
  if (!hasPreview) return;
  [previewFrame, modalFrame].forEach((frame) => {
    const d = frame.contentDocument;
    if (!d || !d.body) return;
    d.body.className = `mode-${currentPreviewMode}`;
    let c = d.getElementById("dividersContainer");
    if (c) c.remove();

    const root = d.querySelector(".pdf-document");
    if (!root) return;
    const sw = root.scrollWidth, sh = root.scrollHeight, cw = root.clientWidth || 820;
    let ratio = formatInput.value === "letter"
      ? (orientationInput.value === "landscape" ? 8.5/11 : 11/8.5)
      : (orientationInput.value === "landscape" ? 210/297 : 297/210);
    const ph = cw * ratio;
    const tp = Math.max(1, Math.ceil(sh / ph));

    if (frame === previewFrame) {
      pageCountBadge.textContent = `${tp} ${tp===1?"Pagina":"Pagine"}`;
      pageCountBadge.hidden = false;
      modalPageCount.textContent = pageCountBadge.textContent;
    }
    if (currentPreviewMode === "pages") {
      c = d.createElement("div"); c.id = "dividersContainer";
      for (let i = 1; i < tp; i++) {
        const div = d.createElement("div");
        div.className = "page-divider";
        div.style.top = `${i * ph}px`;
        div.textContent = `=== FINE PAGINA ${i} · INIZIO PAGINA ${i+1} ===`;
        c.appendChild(div);
      }
      root.appendChild(c);
    }
  });
}

// =========================================================
// FULLSCREEN
// =========================================================
async function openFullscreenPreview() {
  if (!hasPreview) return;
  fullscreenModal.hidden = false;
  modalTitle.textContent = previewTitle.textContent;
  modalFrame.srcdoc = previewFrame.srcdoc;
  await waitForFrame(modalFrame);
  await waitForImages(modalFrame.contentDocument);
  updatePreviewPagination();
}
function closeFullscreenPreview() {
  fullscreenModal.hidden = true;
  modalFrame.removeAttribute("srcdoc");
}

// =========================================================
// SCREEN PDF GENERATION (v2.0.0b)
// =========================================================
async function generateScreenPdf() {
  if (!hasPreview)          { setStatus("Carica prima una fonte.", "error"); return; }
  if (!rightsInput.checked) { setStatus("Conferma i diritti prima.", "error"); return; }
  if (!window.html2canvas)  { setStatus("html2canvas non e caricato. Ricarica la pagina.", "error"); return; }

  const JsPDFClass = window.jspdf?.jsPDF || window.jsPDF;
  if (!JsPDFClass) { setStatus("jsPDF non e caricato. Ricarica la pagina.", "error"); return; }

  setBusy(true, "Cattura screenshot lungo...");
  setStatus("Screen PDF: catturo la pagina pulita, ricreo i link e preparo il testo riconosciuto...");

  try {
    const doc = previewFrame.contentDocument;
    if (!doc) throw new Error("Anteprima non accessibile.");

    const root = doc.querySelector(".pdf-document") || doc.body;
    if (!root || !root.textContent.trim()) throw new Error("Anteprima vuota.");

    doc.querySelectorAll(".page-divider, #dividersContainer").forEach((el) => el.remove());

    const renderScale = Math.min(Number.parseFloat(qualityInput.value) || 1.4, 1.6);
    await waitForImages(doc, root);

    // Nasconde immagini che non sono caricabili: evita canvas vuote o tainted.
    root.querySelectorAll("img").forEach((img) => {
      if (!img.complete || img.naturalWidth === 0) img.style.display = "none";
    });

    const linkRects = collectLinkRects(root);
    const rootCssWidth = Math.max(root.scrollWidth, root.clientWidth, root.getBoundingClientRect().width, 1);
    const rootCssHeight = Math.max(root.scrollHeight, root.clientHeight, root.getBoundingClientRect().height, 1);

    const canvas = await window.html2canvas(root, {
      scale: renderScale,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: Math.max(root.scrollWidth, root.clientWidth, 820),
      width: Math.max(root.scrollWidth, root.clientWidth, 820),
      height: root.scrollHeight,
      scrollX: 0,
      scrollY: 0,
      imageTimeout: 6000
    });

    if (!canvas.width || !canvas.height) throw new Error("Screenshot vuoto.");

    setBusy(true, "Creo PDF a pagina unica...");

    const maxPdfSide = 14400;
    const pageScale = Math.min(1, maxPdfSide / Math.max(canvas.width, canvas.height));
    const pageW = Math.max(1, Math.round(canvas.width * pageScale));
    const pageH = Math.max(1, Math.round(canvas.height * pageScale));
    const orientation = pageW > pageH ? "landscape" : "portrait";
    const cssToCanvasX = canvas.width / rootCssWidth;
    const cssToCanvasY = canvas.height / rootCssHeight;

    const pdf = new JsPDFClass({
      orientation,
      unit: "px",
      format: [pageW, pageH],
      compress: true,
      hotfixes: ["px_scaling"]
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    if (!imgData || imgData.length < 1000) throw new Error("Screenshot non valido: immagine PDF vuota.");

    pdf.addImage(imgData, "JPEG", 0, 0, pageW, pageH, undefined, "FAST");

    linkRects.forEach((link) => {
      const x = clamp(link.x * cssToCanvasX * pageScale, 0, pageW);
      const y = clamp(link.y * cssToCanvasY * pageScale, 0, pageH);
      const w = clamp(link.w * cssToCanvasX * pageScale, 0, pageW - x);
      const h = clamp(link.h * cssToCanvasY * pageScale, 0, pageH - y);
      if (w > 2 && h > 2) pdf.link(x, y, w, h, { url: link.href });
    });

    const ocrText = await recognizeScreenText(canvas, root);
    addSearchableTextLayer(pdf, ocrText, pageW, pageH);

    const fileName = ensurePdfExtension(fileNameInput.value || `${currentTitle}-screen.pdf`);
    pdf.save(fileName);

    renderScreenReport({
      canvas,
      links: linkRects,
      text: ocrText,
      pageW,
      pageH,
      fileName
    });

    setStatus(`Screen PDF generato: ${fileName}. Link associati: ${linkRects.length}.`, "success");
  } catch (e) {
    console.error("[PaginaPDF screen] errore:", e);
    setStatus(`Errore Screen PDF: ${e.message}. Prova con HTML incollato o con una pagina piu semplice.`, "error");
  } finally {
    setBusy(false);
    updateGenerateState();
  }
}

function collectLinkRects(root) {
  const rootRect = root.getBoundingClientRect();
  const maxW = Math.max(root.scrollWidth, root.clientWidth, rootRect.width, 1);
  const maxH = Math.max(root.scrollHeight, root.clientHeight, rootRect.height, 1);
  const links = [];
  root.querySelectorAll("a[href]").forEach((a) => {
    const href = a.href || a.getAttribute("href");
    if (!href || href.startsWith("javascript:")) return;

    const rects = Array.from(a.getClientRects()).filter((rect) => rect.width >= 2 && rect.height >= 2);
    const sourceRects = rects.length ? rects : [a.getBoundingClientRect()];
    sourceRects.forEach((rect) => {
      const x1 = clamp(rect.left - rootRect.left, 0, maxW);
      const y1 = clamp(rect.top - rootRect.top, 0, maxH);
      const x2 = clamp(rect.right - rootRect.left, 0, maxW);
      const y2 = clamp(rect.bottom - rootRect.top, 0, maxH);
      const w = x2 - x1;
      const h = y2 - y1;
      if (w < 2 || h < 2) return;
      links.push({
        href,
        text: (a.textContent || a.getAttribute("aria-label") || href).replace(/\s+/g, " ").trim().slice(0, 90),
        x: x1,
        y: y1,
        w,
        h
      });
    });
  });
  return mergeDuplicateLinkRects(links);
}

function mergeDuplicateLinkRects(links) {
  const out = [];
  const seen = new Set();
  links.forEach((link) => {
    const key = [link.href, Math.round(link.x), Math.round(link.y), Math.round(link.w), Math.round(link.h)].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    out.push(link);
  });
  return out;
}

async function recognizeScreenText(canvas, root) {
  const domText = (root.innerText || root.textContent || "").replace(/\n{3,}/g, "\n\n").trim();

  // OCR reale opzionale: se Tesseract non e disponibile o la pagina e enorme,
  // uso il testo DOM, che e spesso piu accurato di OCR per pagine HTML.
  if (!window.Tesseract) return domText;

  const pixels = canvas.width * canvas.height;
  if (pixels > 18000000) return domText;

  try {
    setBusy(true, "OCR del testo nello screenshot...");
    const small = downscaleCanvas(canvas, 1800);
    const result = await Promise.race([
      window.Tesseract.recognize(small, "ita+eng"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("OCR timeout")), 15000))
    ]);
    const text = result?.data?.text?.trim();
    return text || domText;
  } catch (_) {
    return domText;
  }
}

function downscaleCanvas(canvas, maxWidth) {
  if (canvas.width <= maxWidth) return canvas;
  const ratio = maxWidth / canvas.width;
  const out = document.createElement("canvas");
  out.width = Math.round(canvas.width * ratio);
  out.height = Math.round(canvas.height * ratio);
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

function addSearchableTextLayer(pdf, text, pageW, pageH) {
  if (!text) return;
  try {
    pdf.setFontSize(1);
    pdf.setTextColor(255, 255, 255);
    const lines = pdf.splitTextToSize(text.slice(0, 12000), Math.max(20, pageW - 20));
    pdf.text(lines, 10, Math.max(10, pageH - 10));
  } catch (_) {}
}

function renderScreenReport({ canvas, links, text, pageW, pageH, fileName }) {
  if (!screenReport) return;
  screenReport.hidden = false;
  if (screenStats) {
    screenStats.textContent = `${Math.round(canvas.width)}x${Math.round(canvas.height)} px · ${links.length} link · ${fileName}`;
  }
  if (ocrTextBox) {
    ocrTextBox.textContent = text ? text.slice(0, 5000) : "Nessun testo riconosciuto.";
  }
  if (screenLinkList) {
    screenLinkList.innerHTML = links.length
      ? links.slice(0, 80).map((l) => `<li><a href="${escapeHtml(l.href)}" target="_blank" rel="noreferrer">${escapeHtml(l.text || l.href)}</a></li>`).join("")
      : "<li>Nessun link trovato nel contenuto renderizzato.</li>";
  }
}

// =========================================================
// LEGACY PDF GENERATION (v2.0.0b)
// =========================================================
async function generatePdf() {
  if (!hasPreview)          { setStatus("Carica prima una fonte.", "error"); return; }
  if (!rightsInput.checked) { setStatus("Conferma i diritti prima.", "error"); return; }
  if (!lastCleanHtml)       { setStatus("Nessun contenuto. Ricarica la fonte.", "error"); return; }
  if (!window.html2pdf)     { setStatus("Libreria non caricata. Ricarica.", "error"); return; }

  setBusy(true, "Generazione PDF in corso...");
  setStatus("Generazione PDF — non chiudere la pagina...");

  // Cleanup preventivo
  document.querySelectorAll("#pdfGenFrame").forEach(el => el.remove());

  let genFrame = null;

  try {
    const fileName = ensurePdfExtension(fileNameInput.value || `${currentTitle}.pdf`);
    const scale = Number.parseFloat(qualityInput.value) || 1.7;

    // ── STRATEGIA legacy v2.0.0b ──────────────────────────────
    // Problema: html2pdf/html2canvas NON funziona con:
    //   - elementi off-screen (left:-9999px) → canvas vuota
    //   - iframe con sandbox → non può accedere al DOM
    //   - iframe srcdoc → cross-origin in alcuni browser
    //
    // SOLUZIONE DEFINITIVA:
    //   1. Crea un iframe SENZA sandbox tramite document.write()
    //   2. L'iframe è quasi invisibile (opacity:0.01, z-index:-1)
    //      ma tecnicamente ON-SCREEN (position:fixed, top:0, left:0)
    //   3. Chiama html2pdf DENTRO l'iframe usando lo script iniettato
    //   4. Il PDF viene generato nel contesto dell'iframe
    //      (stesso documento = nessun problema cross-origin)
    //   5. Il blob risultante viene scaricato dalla pagina padre
    // ──────────────────────────────────────────────────────────

    genFrame = document.createElement("iframe");
    genFrame.id = "pdfGenFrame";
    genFrame.style.cssText = "position:fixed;top:0;left:0;width:860px;height:100vh;border:none;opacity:0.01;pointer-events:none;z-index:-1;";
    // NESSUN attributo sandbox!
    document.body.appendChild(genFrame);

    const gDoc = genFrame.contentDocument || genFrame.contentWindow.document;
    const gWin = genFrame.contentWindow;

    // Scrivi il contenuto pulito + lo script html2pdf nell'iframe
    gDoc.open();
    gDoc.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
</head><body style="margin:0;padding:0;background:#fff;">
<div id="pdfContent" style="width:820px;margin:0 auto;padding:48px 52px;background:#fff;color:#171512;box-sizing:border-box;font-family:Inter,-apple-system,Arial,sans-serif;line-height:1.6;overflow-wrap:break-word;">
</div></body></html>`);
    gDoc.close();

    // Aspetta che l'iframe carichi html2pdf
    await new Promise((resolve) => {
      let checks = 0;
      const interval = setInterval(() => {
        checks++;
        if (gWin.html2pdf || checks > 60) {
          clearInterval(interval);
          resolve();
        }
      }, 200);
    });

    if (!gWin.html2pdf) throw new Error("html2pdf non caricato nell'iframe di generazione.");

    // Inietta il body pulito (senza stili del sito principale che interferiscono)
    const parser = new DOMParser();
    const parsed = parser.parseFromString(lastCleanHtml, "text/html");
    const pdfRoot = parsed.querySelector(".pdf-document") || parsed.body;
    if (!pdfRoot || !pdfRoot.innerHTML.trim()) throw new Error("Contenuto vuoto.");

    // Copia anche gli stili dell'HTML pulito
    const stylesHtml = Array.from(parsed.querySelectorAll("style")).map(s => s.outerHTML).join("\n");

    const contentDiv = gDoc.getElementById("pdfContent");
    contentDiv.innerHTML = pdfRoot.innerHTML;

    // Inietta gli stili nel head dell'iframe
    const styleContainer = gDoc.createElement("div");
    styleContainer.innerHTML = stylesHtml;
    Array.from(styleContainer.children).forEach(s => gDoc.head.appendChild(s));

    // Aggiungi override per visibilità
    const ov = gDoc.createElement("style");
    ov.textContent = `
      * { visibility: visible !important; opacity: 1 !important; }
      img { max-width: 100% !important; height: auto !important; }
      .page-divider, #dividersContainer { display: none !important; }
    `;
    gDoc.head.appendChild(ov);

    // Aspetta rendering
    await new Promise(r => setTimeout(r, 500));

    // Aspetta immagini
    const imgs = Array.from(gDoc.images || []);
    await Promise.allSettled(imgs.map(img => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise(r => {
        const t = setTimeout(() => { img.style.display = "none"; r(); }, 3000);
        img.onload = () => { clearTimeout(t); r(); };
        img.onerror = () => { clearTimeout(t); img.style.display = "none"; r(); };
      });
    }));

    // Genera il PDF dentro il contesto dell'iframe
    const opt = {
      margin:    10,
      filename:  fileName,
      image:     { type: "jpeg", quality: 0.94 },
      html2canvas: {
        scale:           scale,
        useCORS:         true,
        allowTaint:      true,
        backgroundColor: "#ffffff",
        logging:         false,
        windowWidth:     820,
      },
      jsPDF: {
        unit: "mm",
        format: formatInput.value,
        orientation: orientationInput.value,
        compress: true,
      },
      pagebreak: { mode: ["css", "legacy"] },
    };

    // Genera come blob e scarica dalla pagina padre
    const pdfBlob = await gWin.html2pdf().set(opt).from(contentDiv).outputPdf("blob");

    // Download
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    setStatus(`PDF generato: ${fileName}`, "success");

  } catch (e) {
    console.error("[PaginaPDF] PDF error:", e);
    setStatus(`Errore PDF: ${e.message}. Prova con Ctrl+P dal pannello anteprima.`, "error");
  } finally {
    if (genFrame?.parentNode) genFrame.remove();
    document.querySelectorAll("#pdfGenFrame").forEach(el => el.remove());
    setBusy(false);
    updateGenerateState();
  }
}

// =========================================================
// CLEAR
// =========================================================
function clearAll() {
  urlInput.value = "";
  htmlInput.value = "";
  fileInput.value = "";
  rightsInput.checked = false;
  previewFrame.removeAttribute("srcdoc");
  hasPreview = false;
  lastCleanHtml = "";
  lastDetection = null;
  lastRemoved = [];
  lastDiffData = [];
  emptyPreview.hidden = false;
  previewTitle.textContent = "Nessuna anteprima";
  previewState.textContent = "In attesa";
  fullscreenBtn.disabled = true;
  pageCountBadge.hidden = true;
  if (reportBox)  reportBox.hidden = true;
  if (diffPanel)  diffPanel.hidden = true;
  if (screenReport) screenReport.hidden = true;
  if (ocrTextBox) ocrTextBox.textContent = "Il testo OCR o DOM apparira qui dopo la generazione.";
  if (screenLinkList) screenLinkList.innerHTML = "";
  setStatus("Carica una fonte per vedere l'anteprima.");
  updateGenerateState();
}

// =========================================================
// HELPERS
// =========================================================
function looksLikeHtml(v) { return /<\s*(html|body|article|main|section|div|p|h[1-6]|table|img|style|title|head)[\s>]/i.test(v); }

function textToHtml(text) {
  const s = escapeHtml(text);
  const p = s.split(/\n{2,}/).map(c => `<p>${c.replace(/\n/g,"<br>")}</p>`).join("\n");
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Testo importato</title></head><body><article>${p}</article></body></html>`;
}

function getTitleFromHtml(h) {
  const m = h.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1].trim()).slice(0,90) : "";
}
function createSafeBase(u) { try { return new URL(u, location.href); } catch(_) { return new URL(location.href); } }
function absolutize(v, b) {
  if (!v || v.startsWith("#") || v.startsWith("mailto:") || v.startsWith("tel:") || v.startsWith("data:")) return v;
  try { return new URL(v, b).href; } catch(_) { return v; }
}
function waitForFrame(f) {
  return new Promise(r => {
    let done = false;
    const fin = () => { if (done) return; done = true; r(); };
    f.addEventListener("load", () => requestAnimationFrame(fin), { once: true });
    setTimeout(fin, 1200);
  });
}
function waitForImages(doc, root) {
  const imgs = root ? Array.from(root.querySelectorAll("img")) : Array.from(doc.images || []);
  if (!imgs.length) return Promise.resolve();
  return Promise.allSettled(imgs.map(img => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise(r => {
      const t = setTimeout(r, 4500);
      img.onload  = () => { clearTimeout(t); r(); };
      img.onerror = () => { clearTimeout(t); r(); };
    });
  }));
}
function hostnameToTitle(u) { try { return new URL(u).hostname.replace(/^www\./,""); } catch(_) { return "pagina-web"; } }
function stripExtension(n) { return n.replace(/\.[^.]+$/,"") || "file-importato"; }
function ensurePdfExtension(v) { const c = (v||"").trim() || `${currentTitle}.pdf`; return /\.pdf$/i.test(c) ? c : `${c}.pdf`; }
function slugify(v) {
  return (v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,70) || "pagina-pdf";
}
function escapeHtml(v) {
  const m = {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"};
  return String(v).replace(/[&<>"']/g,c=>m[c]);
}
function decodeEntities(v) { const t=document.createElement("textarea"); t.innerHTML=v; return t.value; }
function textLength(el) { return (el.textContent||"").replace(/\s+/g," ").trim().length; }
function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }

// =========================================================
// INIT
// =========================================================
updateGenerateState();
console.log("[PaginaPDF v2.0.0b] pronto");
