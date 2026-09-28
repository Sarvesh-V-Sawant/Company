/**
 * Minimal, dependency-free PDF writer (Phase 30.04).
 *
 * WHY HAND-ROLLED: the project has no PDF dependency, and adding one
 * (pdfkit/puppeteer) would mean a new npm install plus, in puppeteer's case, a
 * Chromium download that will not survive Vercel's bundle limits. This produces
 * a valid PDF 1.4 with the standard Helvetica fonts, which need no embedding.
 *
 * Scope on purpose: left-to-right text, a paginated table, headers and footers.
 * That is exactly what an altered order and a commission invoice need. It is not
 * a general-purpose layout engine.
 */

export interface PdfColumn {
  header: string;
  /** Share of the content width, relative to the sum of all widths. */
  width: number;
  align?: 'left' | 'right';
}

export interface PdfTable {
  columns: PdfColumn[];
  rows: string[][];
}

export interface PdfKeyValueBlock {
  heading?: string;
  pairs: Array<[string, string]>;
}

export interface PdfDocSpec {
  title: string;
  subtitle?: string;
  /** Company identity block, printed top-left under the title. */
  issuerLines?: string[];
  /** Two side-by-side metadata blocks, e.g. Bill To / Ship To. */
  blocks?: PdfKeyValueBlock[];
  table?: PdfTable;
  /** Totals printed right-aligned under the table. */
  totals?: Array<[string, string]>;
  footerLines?: string[];
}

// A4 in points.
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 42;
const CONTENT_W = PAGE_W - MARGIN * 2;

const FONT_REGULAR = 'F1';
const FONT_BOLD = 'F2';

/** Approximate Helvetica advance widths, in 1/1000 em, for width fitting. */
const AVG_CHAR_EM = 500;

function textWidth(text: string, size: number): number {
  return (text.length * AVG_CHAR_EM * size) / 1000;
}

/** Escapes the three characters that are special inside a PDF string literal. */
function escapePdfText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Replaces characters outside WinAnsi with safe equivalents. The standard-14
 * fonts cannot render arbitrary Unicode, and the rupee sign U+20B9 is not in
 * WinAnsi at all, so amounts are labelled "INR" instead of using a glyph that
 * would render as a blank box.
 */
function toWinAnsi(text: string): string {
  return text
    .replace(/\u20b9/g, 'INR ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2192/g, '->')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

/** Hard-wraps a string to fit a pixel width, breaking on spaces where possible. */
function wrapText(text: string, size: number, maxWidth: number): string[] {
  const clean = toWinAnsi(text);
  if (textWidth(clean, size) <= maxWidth) return [clean];

  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (textWidth(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    // A single word longer than the column still has to be broken.
    if (textWidth(word, size) > maxWidth) {
      const maxChars = Math.max(1, Math.floor((maxWidth * 1000) / (AVG_CHAR_EM * size)));
      let rest = word;
      while (textWidth(rest, size) > maxWidth) {
        lines.push(rest.slice(0, maxChars));
        rest = rest.slice(maxChars);
      }
      current = rest;
    } else {
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

/** Accumulates PDF content-stream operators for one page. */
class PageBuilder {
  private ops: string[] = [];

  text(x: number, y: number, value: string, size = 9, font = FONT_REGULAR): void {
    this.ops.push(
      'BT',
      `/${font} ${size} Tf`,
      `1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`,
      `(${escapePdfText(toWinAnsi(value))}) Tj`,
      'ET',
    );
  }

  textRight(xRight: number, y: number, value: string, size = 9, font = FONT_REGULAR): void {
    const clean = toWinAnsi(value);
    this.text(xRight - textWidth(clean, size), y, clean, size, font);
  }

  line(x1: number, y1: number, x2: number, y2: number, width = 0.5, gray = 0.75): void {
    this.ops.push(
      `${gray.toFixed(2)} G`,
      `${width.toFixed(2)} w`,
      `${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`,
    );
  }

  rect(x: number, y: number, w: number, h: number, gray = 0.93): void {
    this.ops.push(
      `${gray.toFixed(2)} g`,
      `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`,
      '0 g',
    );
  }

  build(): string {
    return this.ops.join('\n');
  }
}

/** Renders a document spec to PDF bytes. */
export function renderPdf(spec: PdfDocSpec): Uint8Array {
  const pages: PageBuilder[] = [];
  let page = new PageBuilder();
  pages.push(page);
  let y = PAGE_H - MARGIN;

  const newPage = (): void => {
    page = new PageBuilder();
    pages.push(page);
    y = PAGE_H - MARGIN;
  };

  const ensure = (needed: number): void => {
    if (y - needed < MARGIN + 40) newPage();
  };

  // ── Title
  page.text(MARGIN, y - 14, spec.title, 16, FONT_BOLD);
  y -= 24;
  if (spec.subtitle) {
    page.text(MARGIN, y - 10, spec.subtitle, 9.5);
    y -= 16;
  }

  // ── Issuer block
  if (spec.issuerLines?.length) {
    y -= 4;
    for (const line of spec.issuerLines) {
      ensure(12);
      page.text(MARGIN, y - 9, line, 8.5);
      y -= 11;
    }
  }

  y -= 6;
  page.line(MARGIN, y, PAGE_W - MARGIN, y, 0.8, 0.6);
  y -= 14;

  // ── Metadata blocks, laid out in two columns
  if (spec.blocks?.length) {
    const colW = CONTENT_W / 2 - 8;
    let blockTop = y;
    let lowest = y;

    spec.blocks.forEach((block, idx) => {
      const x = MARGIN + (idx % 2) * (colW + 16);
      if (idx % 2 === 0 && idx > 0) {
        blockTop = lowest - 8;
      }
      let by = blockTop;

      if (block.heading) {
        page.text(x, by - 9, block.heading, 9, FONT_BOLD);
        by -= 13;
      }
      for (const [k, v] of block.pairs) {
        for (const wrapped of wrapText(`${k}: ${v}`, 8.5, colW)) {
          page.text(x, by - 9, wrapped, 8.5);
          by -= 11;
        }
      }
      lowest = Math.min(lowest, by);
    });

    y = lowest - 10;
  }

  // ── Table
  if (spec.table && spec.table.columns.length > 0) {
    const totalUnits = spec.table.columns.reduce((s, c) => s + c.width, 0) || 1;
    const colWidths = spec.table.columns.map((c) => (c.width / totalUnits) * CONTENT_W);
    const colX: number[] = [];
    let acc = MARGIN;
    for (const w of colWidths) {
      colX.push(acc);
      acc += w;
    }

    const drawHeader = (): void => {
      ensure(26);
      page.rect(MARGIN, y - 16, CONTENT_W, 16);
      spec.table!.columns.forEach((col, i) => {
        const pad = 4;
        if (col.align === 'right') {
          page.textRight(colX[i] + colWidths[i] - pad, y - 11.5, col.header, 8.5, FONT_BOLD);
        } else {
          page.text(colX[i] + pad, y - 11.5, col.header, 8.5, FONT_BOLD);
        }
      });
      y -= 16;
      page.line(MARGIN, y, PAGE_W - MARGIN, y, 0.5, 0.6);
    };

    drawHeader();

    for (const row of spec.table.rows) {
      // Pre-wrap every cell so the row height is known before drawing.
      const wrapped = row.map((cell, i) =>
        wrapText(cell ?? '', 8.5, Math.max(20, colWidths[i] - 8)),
      );
      const lineCount = Math.max(1, ...wrapped.map((w) => w.length));
      const rowH = lineCount * 10.5 + 4;

      if (y - rowH < MARGIN + 40) {
        newPage();
        drawHeader();
      }

      wrapped.forEach((cellLines, i) => {
        const col = spec.table!.columns[i];
        cellLines.forEach((cellLine, li) => {
          const ty = y - 10 - li * 10.5;
          if (col?.align === 'right') {
            page.textRight(colX[i] + colWidths[i] - 4, ty, cellLine, 8.5);
          } else {
            page.text(colX[i] + 4, ty, cellLine, 8.5);
          }
        });
      });

      y -= rowH;
      page.line(MARGIN, y, PAGE_W - MARGIN, y, 0.3, 0.85);
    }
  }

  // ── Totals
  if (spec.totals?.length) {
    y -= 8;
    for (const [label, value] of spec.totals) {
      ensure(14);
      page.textRight(PAGE_W - MARGIN - 90, y - 9, label, 9, FONT_BOLD);
      page.textRight(PAGE_W - MARGIN, y - 9, value, 9);
      y -= 13;
    }
  }

  // ── Footer
  if (spec.footerLines?.length) {
    y -= 10;
    for (const line of spec.footerLines) {
      for (const wrapped of wrapText(line, 8, CONTENT_W)) {
        ensure(12);
        page.text(MARGIN, y - 8, wrapped, 8);
        y -= 10;
      }
    }
  }

  return assemblePdf(pages);
}

/** Serialises page content streams into a complete PDF file with a valid xref. */
function assemblePdf(pages: PageBuilder[]): Uint8Array {
  const pageCount = pages.length;

  // Object numbering: 1 Catalog, 2 Pages, 3 Font regular, 4 Font bold,
  // then for each page: page object, then its content stream.
  const firstPageObj = 5;
  const pageObjNums = pages.map((_, i) => firstPageObj + i * 2);
  const contentObjNums = pages.map((_, i) => firstPageObj + i * 2 + 1);

  const objects: string[] = [];

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(
    `<< /Type /Pages /Count ${pageCount} /Kids [${pageObjNums
      .map((n) => `${n} 0 R`)
      .join(' ')}] >>`,
  );
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  pages.forEach((p, i) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W.toFixed(2)} ${PAGE_H.toFixed(2)}] ` +
        `/Resources << /Font << /${FONT_REGULAR} 3 0 R /${FONT_BOLD} 4 0 R >> >> ` +
        `/Contents ${contentObjNums[i]} 0 R >>`,
    );
    const stream = p.build();
    // Length must be the byte length, not the character count.
    const byteLen = Buffer.byteLength(stream, 'latin1');
    objects.push(`<< /Length ${byteLen} >>\nstream\n${stream}\nendstream`);
  });

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];

  objects.forEach((body, idx) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${idx + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n`;
  out += '0000000000 65535 f \n';
  for (const off of offsets) {
    out += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  out +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(out, 'latin1'));
}

/** Formats a number as an Indian-style amount string without a currency glyph. */
export function formatAmount(value: number | undefined | null): string {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
