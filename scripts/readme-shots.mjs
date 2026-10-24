// README screenshots: create an English demo DB (DEMO_LOCALE=en), run the app on it, then: BASE_URL=… ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/readme-shots.mjs
import { chromium } from '@playwright/test';

const base = process.env.BASE_URL ?? 'http://localhost:3000';
const out = '.github/screenshots';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto(`${base}/login`);
await page.fill('#email', process.env.ADMIN_EMAIL ?? 'admin@socialboard.local');
await page.fill('#password', process.env.ADMIN_PASSWORD ?? (() => { throw new Error('set ADMIN_PASSWORD') })());
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login')), page.click('button[type=submit]')]);

const shots = [
  ['today', '/all/today'],
  ['overview', '/personal'],
  ['ideas', '/pet-project/ideas'],
  ['clicks', '/all/clicks'],
  ['queue', '/all/queue'],
  ['settings', '/personal/settings'],
  ['account', '/pet-project/account'],
];
for (const [name, path] of shots) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${name}.png` });
}

// composer with per-platform variants
await page.goto(`${base}/pet-project/queue`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'New post' }).click();
await page.locator('#compose-text').fill('Changelog import from GitHub Releases is live: connect a repository and new releases turn into post drafts on their own.\n\nhttps://pet-project.example.com/changelog');
await page.getByRole('button', { name: 'Per-channel variants' }).click();
await page.waitForTimeout(1200);
await page.getByRole('tab').nth(1).click();
// let the toast fade so it doesn't cover the footer
await page.waitForTimeout(4500);
await page.screenshot({ path: `${out}/composer.png` });
await browser.close();
console.log('done');
