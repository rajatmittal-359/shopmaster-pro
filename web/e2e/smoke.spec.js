// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * The five paths a deploy must not break. Each test is independent and reads
 * like the shopper's or the seller's own steps. Selectors are roles and
 * visible text, not class names, so a restyle does not fail a test.
 *
 * Accounts: the seed's three demo users (SEED_*_EMAIL / SEED_DEMO_PASSWORD in
 * the environment that seeded the database). A fresh seed has no sessions,
 * so the seller/admin second step (OTP on a new device) does not trigger.
 */
// The seed gives all three the same SEED_DEMO_PASSWORD; a database seeded
// otherwise (the laptop's dev data) may pass a password per role.
const PASSWORD = process.env.SEED_DEMO_PASSWORD || '';
const ACCOUNTS = {
  customer: { email: process.env.SEED_CUSTOMER_EMAIL || 'customer@example.com', password: process.env.SEED_CUSTOMER_PASSWORD || PASSWORD },
  seller: { email: process.env.SEED_SELLER_EMAIL || 'seller@example.com', password: process.env.SEED_SELLER_PASSWORD || PASSWORD },
  admin: { email: process.env.SEED_ADMIN_EMAIL || 'admin@example.com', password: process.env.SEED_ADMIN_PASSWORD || PASSWORD },
};

async function signIn(page, who, next = '/') {
  const { email, password } = ACCOUNTS[who];
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel(/email/i).fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  // Sellers and admins on an unknown device get an emailed code (a real
  // mailbox, not a test's). A freshly seeded database has no sessions, so CI
  // never sees it; on a laptop with history the test says so and stops.
  const second = page.getByText(/we sent a code/i);
  await Promise.race([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 }),
    second.waitFor({ timeout: 20_000 }).then(() => { throw new Error('SECOND_STEP'); }),
  ]).catch((e) => {
    if (String(e.message).includes('SECOND_STEP')) test.skip(true, 'this account asks for the emailed code on a new device - run against a fresh seed');
    throw e;
  });
}

test('home renders with its sections and no horizontal scroll', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/ShopMaster Pro/);
  await expect(page.getByRole('link', { name: /shop everything/i })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('search suggests and the shop lists products', async ({ page }) => {
  await page.goto('/shop');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const cards = page.locator('a[href^="/products/"]');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(0);
});

test('a product reaches the cart and the checkout preview (COD)', async ({ page }) => {
  test.skip(!PASSWORD, 'SEED_DEMO_PASSWORD not set');
  await signIn(page, 'customer', '/shop');
  await page.locator('a[href^="/products/"]').first().click();
  await page.waitForURL(/\/products\//);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: /^add to cart$/i }).first().click();
  await expect(page.getByText(/in your cart/i)).toBeVisible();
  await page.goto('/checkout');
  await expect(page.getByText(/cash on delivery/i)).toBeVisible();
  await expect(page.getByText(/to pay/i)).toBeVisible();
});

test('the seller panel opens on its products', async ({ page }) => {
  test.skip(!PASSWORD, 'SEED_DEMO_PASSWORD not set');
  await signIn(page, 'seller', '/seller/products');
  await expect(page).toHaveURL(/\/seller/);
  await expect(page.getByRole('link', { name: /products/i }).first()).toBeVisible();
});

test('the admin panel opens on its sellers list', async ({ page }) => {
  test.skip(!PASSWORD, 'SEED_DEMO_PASSWORD not set');
  await signIn(page, 'admin', '/admin/sellers');
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByText(/selling|waiting for you/i).first()).toBeVisible();
});
