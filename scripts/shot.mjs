// Usage: node scripts/shot.mjs <path> <out.png> [width] [height] [dark]
import { chromium } from '@playwright/test';

const [, , route = '/', out = '/tmp/shot.png', w = '1440', h = '1000', theme] = process.argv;
const base = process.env.BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1, colorScheme: theme === 'dark' ? 'dark' : 'light' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${base}/login`);
await page.fill('#email', process.env.ADMIN_EMAIL ?? 'admin@socialboard.local');
await page.fill('#password', process.env.ADMIN_PASSWORD ?? (() => { throw new Error('set ADMIN_PASSWORD') })());
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login')), page.click('button[type=submit]')]);
await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
if (overflow > 0) errors.push(`horizontal overflow: ${overflow}px`);
await page.screenshot({ path: out, fullPage: true });
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
