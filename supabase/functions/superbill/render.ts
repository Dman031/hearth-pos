// supabase/functions/superbill/render.ts
//
// The PDF. PURE except for the pdf-lib binding, which is INJECTED rather than
// imported — see below. One page, US Letter, Helvetica.
//
// ─── WHY pdf-lib IS A PARAMETER ────────────────────────────────────────────
// The edge function runs on Deno and reaches pdf-lib through an `npm:` specifier;
// the verify script runs on Node and reaches it through node_modules. Neither
// specifier resolves in the other runtime. Rather than keep two copies of the
// layout — which would drift, and the drifted one would be the one nobody
// rendered — the layout lives here once and takes the library as an argument.
// Both callers pin the SAME version (pdf-lib 1.17.1), so the verify's bytes and
// the function's bytes come off the same code path.
//
// ─── NO GLYPHS. THIS IS A RULING, NOT A PREFERENCE ─────────────────────────
// StandardFonts encode as WinAnsi, which has no checkmark. A tick that renders
// as a hollow box on somebody's printer is worse than no tick at all, so
// provenance is carried by THREE devices and none of them is a symbol
// (ruling S8-7):
//   1. a hairline rule down the left edge of the verified block, and only it;
//   2. ALL-CAPS section headers that NAME the source of everything beneath them;
//   3. a "— verified with <source> on <date>" suffix that appears ONLY on
//      verified lines. Its absence on a clinician-provided line is the signal.
// Every character drawn is checked against WinAnsi before it reaches the page
// (see sanitise) — a stray smart quote would otherwise throw mid-render, after
// the upload path has already been decided.

import type { ComposedDoc, DocLine } from './compose.ts';
import { FOOTER_PARAGRAPHS, TITLE, headerLines } from './copy.ts';

/** The slice of pdf-lib this renderer uses. Structural, so either runtime fits. */
export interface PdfLib {
  PDFDocument: {
    create(): Promise<{
      embedFont(font: unknown): Promise<PdfFont>;
      addPage(size: [number, number]): PdfPage;
      save(): Promise<Uint8Array>;
    }>;
  };
  StandardFonts: { Helvetica: unknown; HelveticaBold: unknown };
  rgb(r: number, g: number, b: number): unknown;
}

interface PdfFont {
  widthOfTextAtSize(text: string, size: number): number;
}

interface PdfPage {
  drawText(text: string, opts: Record<string, unknown>): void;
  drawLine(opts: Record<string, unknown>): void;
}

// US Letter, in points.
const PAGE: [number, number] = [612, 792];
const MARGIN = 54;
const CONTENT_WIDTH = PAGE[0] - MARGIN * 2;

const SIZE = { title: 20, header: 10, section: 9, label: 10, note: 8, footer: 8 };
// PROXIMITY IS ATTRIBUTION. The "verified with …" suffix belongs to the value
// ABOVE it, and on a document a payer reads, an ambiguous attribution is the
// wrong kind of ambiguous. The first draft put 16pt above the note and 11pt
// below, so it sat nearer the NEXT row's label and the NPI suffix read as if it
// qualified Licence. The gaps are now 10 above / 20 below — a 1:2 ratio, so the
// binding is unmistakable without a rule or a bullet.
const LEAD = { header: 14, section: 22, line: 16, note: 11, footer: 11 };
/** Gap between a value and its own suffix. Deliberately the SMALLER of the two. */
const NOTE_ABOVE = 10;
/** Gap between a suffix and the next row's label. Deliberately the LARGER. */
const NOTE_BELOW = 20;
/** Where the label column ends and the value column begins. */
const VALUE_X = MARGIN + 132;
/** The verified block's rule sits here, and nothing else in the document does. */
const RULE_INSET = 10;

/**
 * WinAnsi safety. pdf-lib throws when a StandardFont is asked to draw a
 * character it cannot encode, and that throw would land AFTER we had decided to
 * issue — so unencodable characters are replaced here, loudly and predictably,
 * rather than allowed to fail a render that a person is waiting on. The three
 * substitutions below cover what actually appears in our copy and in typed
 * names; everything else outside Latin-1 becomes '?', which is visible and
 * therefore reportable, unlike a silent drop.
 */
export function sanitise(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    // The keep-set is written with EXPLICIT ESCAPES, deliberately: an earlier
    // draft used literal characters and a NUL byte reached the file, which made
    // the range start at U+0000 and would have admitted every control character
    // into a printed document. Latin-1 (U+0020-U+00FF, which already carries the
    // middle dot at 0xB7) plus the em dash, which WinAnsi has at 0x97 but which
    // sits outside that range in Unicode. Anything else becomes '?' - visible,
    // and therefore reportable, unlike a silent drop.
    .replace(/[^\u0020-\u00FF\u2014]/g, '?');
}

/** Greedy wrap to a pixel width. Long unbroken tokens are placed rather than dropped. */
export function wrap(text: string, font: PdfFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

export interface RenderOptions {
  /** The rendered issue date the header prints. */
  issued: string;
}

export async function renderSuperbill(
  lib: PdfLib,
  doc: ComposedDoc,
  opts: RenderOptions,
): Promise<Uint8Array> {
  const pdf = await lib.PDFDocument.create();
  const body = await pdf.embedFont(lib.StandardFonts.Helvetica);
  const bold = await pdf.embedFont(lib.StandardFonts.HelveticaBold);
  const page = pdf.addPage(PAGE);

  const ink = lib.rgb(0.12, 0.14, 0.08); // Field palette Ink #1E2415
  const stone = lib.rgb(0.52, 0.48, 0.42); // Stone #857B6A — notes and footer
  const rule = lib.rgb(0.35, 0.39, 0.19); // Moss-ish hairline for the verified block

  let y = PAGE[1] - MARGIN;

  const text = (s: string, x: number, size: number, font: PdfFont, color: unknown) => {
    page.drawText(sanitise(s), { x, y, size, font, color });
  };

  // ── title ────────────────────────────────────────────────────────────────
  text(TITLE, MARGIN, SIZE.title, bold, ink);
  y -= LEAD.header + 8;
  for (const line of headerLines(opts.issued)) {
    text(line, MARGIN, SIZE.header, body, stone);
    y -= LEAD.header;
  }
  y -= 10;

  // ── sections ─────────────────────────────────────────────────────────────
  for (const section of doc.sections) {
    const sectionTop = y + 4;
    text(section.heading, MARGIN, SIZE.section, bold, ink);
    y -= LEAD.section;

    for (const line of section.lines) {
      drawLine(line);
    }

    // Device 1: the hairline, drawn AFTER the block so it spans exactly what it
    // vouches for. Only `ruled` sections get one, which is the whole signal.
    if (section.ruled) {
      page.drawLine({
        start: { x: MARGIN - RULE_INSET, y: sectionTop },
        end: { x: MARGIN - RULE_INSET, y: y + LEAD.line - 4 },
        thickness: 1.2,
        color: rule,
      });
    }
    y -= 8;
  }

  // ── footer ───────────────────────────────────────────────────────────────
  y = Math.min(y, MARGIN + 118);
  page.drawLine({
    start: { x: MARGIN, y: y + 14 },
    end: { x: MARGIN + CONTENT_WIDTH, y: y + 14 },
    thickness: 0.5,
    color: stone,
  });
  for (const paragraph of FOOTER_PARAGRAPHS) {
    for (const line of wrap(sanitise(paragraph), body, SIZE.footer, CONTENT_WIDTH)) {
      text(line, MARGIN, SIZE.footer, body, stone);
      y -= LEAD.footer;
    }
    y -= 6;
  }

  return pdf.save();

  function drawLine(line: DocLine): void {
    text(line.label, MARGIN, SIZE.label, body, stone);
    const valueLines = wrap(sanitise(line.value), bold, SIZE.label, PAGE[0] - MARGIN - VALUE_X);
    for (const [i, part] of valueLines.entries()) {
      if (i > 0) y -= LEAD.line;
      text(part, VALUE_X, SIZE.label, bold, ink);
    }
    // Tighter above a suffix than below it, so the suffix reads as part of the
    // row it qualifies rather than as a heading for the next one.
    y -= line.note ? NOTE_ABOVE : LEAD.line;
    // Device 3: the suffix, and its ABSENCE on a clinician line is the signal.
    if (line.note) {
      text(line.note, VALUE_X, SIZE.note, body, stone);
      y -= NOTE_BELOW;
    }
  }
}
