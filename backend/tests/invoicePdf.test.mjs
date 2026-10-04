/**
 * The customer's invoice as a REAL file (4 Oct 2026).
 *
 * WHY THIS EXISTS AT ALL
 *   `Bill.jsx` says in its own header that there is no PDF library on purpose:
 *   "the browser makes better PDFs than a bundled generator, for nothing."
 *   That reasoning still holds for the LAYOUT - and the page is now clean,
 *   because the shop's header and footer stopped printing with it (ShopChrome,
 *   same day). What it does not give is a FILE: the button opens a print
 *   dialog, and a person who wants `CJ-26-27-00007.pdf` to attach to an email
 *   or hand to an accountant has to know their way around that dialog.
 *   Rajat: "asli pdf download hona chahiye download button pe."
 *
 * WHAT IS ACTUALLY DEFENDED HERE
 *   Not the drawing - a PDF's pixels are not worth a test. The DANGER of a
 *   second renderer is that the two drift: the page prints one number and the
 *   file another, and nobody notices until a customer puts them side by side.
 *   So every test below checks that the PDF says what the PAYLOAD says - the
 *   same object `getOrderDetails` sends the page - and never that it says some
 *   figure this test computed for itself. If the two ever disagree, the page
 *   is right and this is the file that lied.
 *
 *   The second thing defended is the DOCUMENT TYPE. An unregistered seller may
 *   not issue a tax invoice (CGST s.122) and a registered one must (Rule 46).
 *   That choice is made from the seller's GSTIN in `utils/invoice.js`, and the
 *   file has to reach the same verdict as the page or the shop is handing a
 *   customer the wrong class of document.
 */
import { describe, it, expect } from 'vitest';
import { buildInvoicePdf, TEXT } from '../utils/invoicePdf.js';

/*
 * Readable text out of an UNCOMPRESSED pdfkit buffer.
 *
 * pdfkit does not write `(Sold by) Tj`. It writes a kerning array of hex
 * strings - `[<536f6c642062> 20 <79> 0] TJ` - so the pieces of one word arrive
 * separately and have to be joined with nothing between them, while separate
 * TJ operations are separate runs and get a space. Reading only inside
 * stream/endstream keeps the file's own ids and metadata out of the result,
 * which matters for the assertions that something is ABSENT.
 */
const textOf = (buf) => {
  const raw = buf.toString('latin1');
  const streams = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((m) => m[1]).join('\n');
  return [...streams.matchAll(/\[((?:\s*<[0-9A-Fa-f]*>\s*-?[\d.]*)+)\]\s*TJ/g)]
    .map((m) => [...m[1].matchAll(/<([0-9A-Fa-f]*)>/g)].map((h) => Buffer.from(h[1], 'hex').toString('latin1')).join(''))
    .join(' ');
};

const BUSINESS = { tradeName: 'ShopMaster Pro', email: 'hello@example.in', phone: '+91 99999 99999' };

const CUSTOMER = { name: 'Abha Mittal' };

const ADDRESS = { street: '42, Yelahanka New Town', city: 'Bangalore', state: 'Karnataka', zipCode: '560077', phoneNumber: '9829012345' };

/** One unregistered seller, two lines - the shape getOrderDetails sends. */
const plainOrder = () => ({
  _id: 'o1',
  orderNumber: 'SMP-261004-B880D9',
  createdAt: '2026-10-04T06:00:00.000Z',
  paymentMethod: 'cod',
  paymentStatus: 'pending',
  shippingCharges: 398,
  shippingAddressId: ADDRESS,
  invoices: [{ sellerId: 's1', number: 'CJ/26-27/00007', issuedAt: '2026-10-04T06:00:00.000Z' }],
  items: [
    { _id: 'i1', sellerId: 's1', name: 'Sanganeri Print Pure Cotton Double Bedsheet 108x108 cm', price: 649, quantity: 1, status: 'pending' },
    { _id: 'i2', sellerId: 's1', name: 'Jaipuri Block Print Pure Cotton Single Bedsheet 70x100 cm', price: 399, quantity: 1, status: 'pending' },
  ],
});

const plainSellers = () => ({
  s1: {
    businessName: 'Charming Jewels',
    legalName: 'Charming Jewels',
    address: ['C-13, Rajoriya House, Hari Marg', 'Devi Nagar', 'Jaipur Rajasthan 302019'],
    gstin: '',
    enrolled: '',
    tax: null,
  },
});

const build = (order, sellers) => buildInvoicePdf({ order, sellers, business: BUSINESS, customer: CUSTOMER }, { compress: false });

describe('the invoice as a downloadable file', () => {
  it('is a PDF', async () => {
    const buf = await build(plainOrder(), plainSellers());
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('carries the seller of record, not the marketplace', async () => {
    // On a marketplace the SELLER is the supplier; the platform is named only
    // as the party that issued the document on their behalf (plan 2.40).
    const text = textOf(await build(plainOrder(), plainSellers()));
    expect(text).toContain('Charming Jewels');
    expect(text).toContain('C-13, Rajoriya House, Hari Marg');
    expect(text).toContain('Sold by');
    expect(text).toContain(TEXT.issuedBy(BUSINESS.tradeName));
  });

  it('prints the invoice number and the order it belongs to', async () => {
    const order = plainOrder();
    const text = textOf(await build(order, plainSellers()));
    expect(text).toContain(order.invoices[0].number);
    expect(text).toContain(order.orderNumber);
  });

  it('prints every line and the totals the payload gives', async () => {
    const order = plainOrder();
    const text = textOf(await build(order, plainSellers()));
    for (const item of order.items) expect(text).toContain(item.name);
    // 649 + 399 = 1,048 goods, + 398 delivery = 1,446 - read off the payload,
    // never recomputed here in a way that could agree with a wrong renderer.
    const goods = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    expect(text).toContain(goods.toLocaleString('en-IN'));
    expect(text).toContain(order.shippingCharges.toLocaleString('en-IN'));
    expect(text).toContain((goods + order.shippingCharges).toLocaleString('en-IN'));
  });

  it('calls an unregistered seller\'s document an Invoice and says no tax was charged', async () => {
    const text = textOf(await build(plainOrder(), plainSellers()));
    expect(text).toContain('Invoice');
    expect(text).not.toContain('Tax Invoice');
    expect(text).toContain(TEXT.noGst('Charming Jewels'));
    // No tax columns on a document that may not have them.
    expect(text).not.toContain('HSN');
    expect(text).not.toContain('Taxable');
  });

  it('calls a registered seller\'s document a Tax Invoice and shows the split it was given', async () => {
    const order = plainOrder();
    order.items[0].hsn = '6304';
    order.items[1].hsn = '6304';
    const sellers = plainSellers();
    sellers.s1.gstin = '08AAAAA0000A1Z5';
    // The split is computed ONCE in utils/invoice.js and sent; the file prints
    // what it is sent. These numbers are deliberately not derivable from price.
    sellers.s1.tax = {
      scheme: 'igst',
      unsplit: 0,
      lines: { i1: { taxable: 618.1, tax: 30.9, rate: 5 }, i2: { taxable: 380, tax: 19, rate: 5 } },
      totals: { taxable: 998.1, igst: 49.9, cgst: 0, sgst: 0 },
    };
    const text = textOf(await build(order, sellers));
    expect(text).toContain('Tax Invoice');
    expect(text).toContain('08AAAAA0000A1Z5');
    expect(text).toContain('HSN');
    expect(text).toContain('6304');
    expect(text).toContain('998.1');
    expect(text).toContain('49.9');
  });

  it('gives one document per seller when an order is split', async () => {
    const order = plainOrder();
    order.items.push({ _id: 'i3', sellerId: 's2', name: 'Silver Toe Ring', price: 149, quantity: 1, status: 'pending' });
    order.invoices.push({ sellerId: 's2', number: 'IS/26-27/00011', issuedAt: '2026-10-04T06:00:00.000Z' });
    const sellers = plainSellers();
    sellers.s2 = { businessName: 'Iyer Silks', legalName: 'Iyer Silks', address: ['Nasirabad'], gstin: '', enrolled: '', tax: null };
    const buf = await build(order, sellers);
    const text = textOf(buf);
    expect(text).toContain('CJ/26-27/00007');
    expect(text).toContain('IS/26-27/00011');
    expect(text).toContain('Iyer Silks');
    // Two sellers, two pages - a seller's document is never half of another's.
    expect(buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g).length).toBe(2);
  });

  it('leaves a cancelled line out of the bill', async () => {
    const order = plainOrder();
    order.items[1].status = 'cancelled';
    const text = textOf(await build(order, plainSellers()));
    expect(text).toContain(order.items[0].name);
    expect(text).not.toContain(order.items[1].name);
  });
});
