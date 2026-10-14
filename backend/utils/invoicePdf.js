/**
 * invoicePdf.js - the customer's invoice as a file they can keep.
 *
 * WHY A SECOND RENDERER EXISTS AT ALL
 *   `web/src/components/orders/Bill.jsx` draws this same document in HTML and
 *   says, in its own header, that a PDF library was deliberately left out: the
 *   browser makes the file for nothing. That is still true of the LAYOUT. What
 *   it never gave is a FILE - the button opens a print dialog, and the person
 *   who wants `CJ-26-27-00007.pdf` to send to an accountant has to find their
 *   way through it. This gives that one click (Rajat, 4 Oct 2026).
 *
 *   The cost is honest and worth naming: the invoice is now drawn in two
 *   places, and the day GST arrives both have to learn the same new columns.
 *   `tests/invoicePdf.test.mjs` is the guard - every assertion there compares
 *   the file against the PAYLOAD the page is sent, never against a figure the
 *   test worked out itself, so a drift shows up as a failure and not as a
 *   customer holding two different numbers.
 *
 * WHAT IS NOT DECIDED HERE
 *   Nothing. The invoice number, the document's class, the tax split and the
 *   place of supply are all settled in `utils/invoice.js` and arrive on the
 *   payload. This file prints what it is given. A number computed here would
 *   be a second opinion, and two opinions on a bill is the whole problem.
 *
 * THE RUPEE SIGN
 *   pdfkit's built-in fonts are the 14 standard PDF ones, and none of them has
 *   U+20B9. Embedding a face that does means committing a ~400 KB binary, so
 *   the file says "Rs" - which is what most Indian invoices print anyway. Drop
 *   a .ttf in and point `RUPEE_FONT` at it and the glyph turns on by itself;
 *   nothing else changes.
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/** A face with U+20B9 in it, if one is ever committed. */
const RUPEE_FONT = path.join(__dirname, '..', 'assets', 'invoice.ttf');
const hasRupeeFont = () => {
  try {
    return fs.existsSync(RUPEE_FONT);
  } catch {
    return false;
  }
};

/*
 * The sentences, in one place. The test asserts on these rather than on
 * re-typed copies, so a reworded footer cannot quietly pass.
 */
const TEXT = {
  noGst: (seller) => `${seller} is not registered under GST. This is not a tax invoice; no GST has been charged on this sale.`,
  issuedBy: (platform) => `Issued by ${platform}, the marketplace, on behalf of the seller. Delivery is arranged and charged by ${platform}.`,
  questions: (business) => `Returns follow the policy at ${business.tradeName}. Questions: ${business.email || ''}${business.phone ? ` · ${business.phone}` : ''}`,
};

const r2 = (n) => Math.round(n * 100) / 100;
const inr = (n) => Number(r2(n)).toLocaleString('en-IN');
// IST, not the box's UTC (utils/ist): an invoice dated near midnight would
// otherwise carry the previous day on a tax document.
const on = (d) => (d ? require('./ist').istDate(d, { day: 'numeric', month: 'long', year: 'numeric' }) : '');

/** One page per seller: a seller's document is never half of another's. */
const groupBySeller = (order) => {
  const live = (order.items || []).filter((i) => i.status !== 'cancelled');
  const groups = new Map();
  for (const item of live) {
    const key = String(item.sellerId || '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()].map(([key, items]) => ({ key, items }));
};

const INK = '#111111';
const GREY = '#666666';
const RULE = '#dddddd';

/**
 * @param {object} data   `{ order, sellers, business, customer }` - exactly what
 *                        getOrderDetails sends the Bill page.
 * @param {object} [opts] `{ compress }` - off in tests so the text can be read.
 * @returns {Promise<Buffer>}
 */
const buildInvoicePdf = ({ order, sellers = {}, business = {}, customer = {} }, opts = {}) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, compress: opts.compress !== false, info: { Title: `Invoice ${order.orderNumber || ''}`.trim() } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const money = hasRupeeFont() ? (n) => `₹${inr(n)}` : (n) => `Rs ${inr(n)}`;
    if (hasRupeeFont()) {
      try {
        doc.registerFont('body', RUPEE_FONT);
      } catch {
        /* a bad font file must not cost the customer their invoice */
      }
    }
    const regular = doc._fontFamilies?.body ? 'body' : 'Helvetica';
    const bold = doc._fontFamilies?.body ? 'body' : 'Helvetica-Bold';

    const address = order.shippingAddressId || null;
    const groups = groupBySeller(order);
    const L = doc.page.margins.left;
    const R = doc.page.width - doc.page.margins.right;

    groups.forEach((g, gi) => {
      if (gi > 0) doc.addPage();
      const s = sellers[g.key] || {};
      const taxed = Boolean(s.gstin);
      const invoice = (order.invoices || []).find((x) => String(x.sellerId) === g.key) || null;

      // ---- who sold it, and what this document is ----------------------
      doc.font(regular).fontSize(8).fillColor(GREY).text('Sold by', L, 48);
      doc.font(bold).fontSize(14).fillColor(INK).text(s.legalName || s.businessName || 'Seller');
      if (s.businessName && s.legalName && s.legalName !== s.businessName) doc.font(regular).fontSize(8).fillColor(GREY).text(`trading as ${s.businessName}`);
      doc.font(regular).fontSize(8).fillColor(GREY);
      for (const line of s.address || []) doc.text(line);
      doc.text(s.gstin ? `GSTIN ${s.gstin}` : s.enrolled ? `GST enrolment ${s.enrolled}` : 'Not registered under GST');

      const headTop = 48;
      doc.font(bold).fontSize(11).fillColor(INK).text(taxed ? 'Tax Invoice' : 'Invoice', L, headTop, { width: R - L, align: 'right' });
      if (invoice?.number) doc.font(regular).fontSize(10).text(invoice.number, L, doc.y, { width: R - L, align: 'right' });
      doc.font(regular).fontSize(8).fillColor(GREY);
      doc.text(`Order ${order.orderNumber || ''}${groups.length > 1 ? ` · ${gi + 1} of ${groups.length}` : ''}`, L, doc.y, { width: R - L, align: 'right' });
      doc.text(invoice?.issuedAt ? `Issued ${on(invoice.issuedAt)} · ordered ${on(order.createdAt)}` : `Ordered ${on(order.createdAt)}`, L, doc.y, { width: R - L, align: 'right' });
      if (taxed && s.tax?.scheme) doc.text(`Place of supply: ${address?.state || ''} (${s.tax.scheme === 'igst' ? 'inter-state' : 'intra-state'})`, L, doc.y, { width: R - L, align: 'right' });

      let y = Math.max(doc.y, 150) + 14;
      doc.moveTo(L, y).lineTo(R, y).strokeColor(RULE).stroke();
      y += 14;

      // ---- billed to, and how it was paid ------------------------------
      doc.font(regular).fontSize(8).fillColor(GREY).text('Billed to', L, y);
      doc.font(regular).fontSize(9).fillColor(INK);
      if (customer.name) doc.text(customer.name, L, doc.y);
      if (address) {
        doc.text(address.street || '', L, doc.y);
        doc.text(`${address.city || ''}, ${address.state || ''} ${address.zipCode || ''}`.trim(), L, doc.y);
        if (address.phoneNumber) doc.text(address.phoneNumber, L, doc.y);
      }
      const payTop = y;
      doc.font(regular).fontSize(8).fillColor(GREY).text('Payment', L, payTop, { width: R - L, align: 'right' });
      doc.font(regular).fontSize(9).fillColor(INK).text(order.paymentMethod === 'cod' ? 'Cash on delivery' : 'Paid online', L, doc.y, { width: R - L, align: 'right' });
      if (order.paymentStatus && order.paymentStatus !== 'paid') doc.fontSize(9).fillColor(GREY).text(order.paymentStatus, L, doc.y, { width: R - L, align: 'right' });
      doc.fontSize(8).fillColor(GREY).text(`Collected through ${business.tradeName || ''}`, L, doc.y, { width: R - L, align: 'right' });

      y = doc.y + 18;
      doc.moveTo(L, y).lineTo(R, y).strokeColor(RULE).stroke();
      y += 12;

      // ---- the lines ----------------------------------------------------
      // Columns only a registered seller may show (CGST Rule 46); an
      // unregistered one's document must not carry a tax column at all.
      const cols = taxed
        ? [{ k: 'name', x: L, w: 170 }, { k: 'hsn', x: L + 176, w: 46 }, { k: 'qty', x: L + 226, w: 26, a: 'right' }, { k: 'price', x: L + 256, w: 56, a: 'right' }, { k: 'taxable', x: L + 316, w: 62, a: 'right' }, { k: 'gst', x: L + 382, w: 56, a: 'right' }, { k: 'amount', x: L + 442, w: 57, a: 'right' }]
        : [{ k: 'name', x: L, w: 300 }, { k: 'qty', x: L + 310, w: 34, a: 'right' }, { k: 'price', x: L + 348, w: 70, a: 'right' }, { k: 'amount', x: L + 422, w: 77, a: 'right' }];
      const HEAD = { name: 'Item', hsn: 'HSN', qty: 'Qty', price: 'Price', taxable: 'Taxable', gst: 'GST', amount: 'Amount' };

      doc.font(regular).fontSize(8).fillColor(GREY);
      for (const c of cols) doc.text(HEAD[c.k], c.x, y, { width: c.w, align: c.a || 'left' });
      y = doc.y + 6;
      doc.moveTo(L, y).lineTo(R, y).strokeColor(RULE).stroke();
      y += 8;

      let goods = 0;
      let discount = 0;
      for (const item of g.items) {
        const line = r2(item.price * item.quantity);
        goods += line;
        discount += item.discountAmount || 0;
        const t = (s.tax?.lines || {})[String(item._id)] || null;
        const cell = {
          name: item.name,
          hsn: item.hsn || 'not set',
          qty: String(item.quantity),
          price: money(item.price),
          taxable: t ? inr(t.taxable) : '-',
          gst: t ? `${inr(t.tax)}${t.rate ? ` (${t.rate}%)` : ''}` : '-',
          amount: money(line),
        };
        doc.font(regular).fontSize(9).fillColor(INK);
        const before = y;
        let bottom = y;
        for (const c of cols) {
          doc.text(cell[c.k], c.x, before, { width: c.w, align: c.a || 'left' });
          bottom = Math.max(bottom, doc.y);
        }
        y = bottom + 7;
        doc.moveTo(L, y - 3).lineTo(R, y - 3).strokeColor(RULE).stroke();
      }

      // ---- what it comes to ---------------------------------------------
      // Delivery is the PLATFORM's line, not a seller's, so it is shown once -
      // on the first document - exactly as the page shows it.
      const subtotal = r2(goods - discount);
      const shipping = gi === 0 ? Number(order.shippingCharges || 0) : 0;
      const rows = [['Item total', money(subtotal)]];
      if (discount > 0) rows.splice(0, 0, ['Items', money(goods)], ['Discount', `- ${money(discount)}`]);
      if (taxed && s.tax?.totals) {
        const tt = s.tax.totals;
        rows.push(['Taxable value', inr(tt.taxable)]);
        if (tt.igst) rows.push(['IGST', inr(tt.igst)]);
        if (tt.cgst) rows.push(['CGST', inr(tt.cgst)]);
        if (tt.sgst) rows.push(['SGST', inr(tt.sgst)]);
      }
      if (gi === 0) rows.push(['Delivery', money(shipping)]);
      rows.push(['Total', money(subtotal + shipping)]);

      y += 8;
      for (const [label, value] of rows) {
        const last = label === 'Total';
        doc.font(last ? bold : regular).fontSize(last ? 10 : 9).fillColor(last ? INK : GREY);
        doc.text(label, R - 250, y, { width: 150, align: 'right' });
        doc.fillColor(INK).text(value, R - 95, y, { width: 95, align: 'right' });
        y = doc.y + 4;
      }

      // ---- what the document is, in words --------------------------------
      y += 14;
      doc.moveTo(L, y).lineTo(R, y).strokeColor(RULE).stroke();
      y += 12;
      doc.font(regular).fontSize(8).fillColor(GREY);
      if (!taxed) {
        doc.text(TEXT.noGst(s.legalName || s.businessName || 'This seller'), L, y, { width: R - L });
        y = doc.y + 8;
      }
      doc.text(TEXT.issuedBy(business.tradeName || 'the marketplace'), L, y, { width: R - L });
      doc.text(TEXT.questions(business), L, doc.y + 4, { width: R - L });
    });

    doc.end();
  });

/** The file name a person expects to see in Downloads. */
const invoiceFileName = (order) => {
  const first = (order.invoices || [])[0];
  const base = first?.number || order.orderNumber || 'invoice';
  return `${String(base).replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`;
};

module.exports = { buildInvoicePdf, invoiceFileName, TEXT };
