import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('#email', process.env.ADMIN_EMAIL ?? 'admin@socialboard.local');
  await page.fill('#password', process.env.ADMIN_PASSWORD ?? 'socialboard');
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

test('redirects anonymous users to login', async ({ page }) => {
  await page.goto('/personal/posts');
  await expect(page).toHaveURL(/\/login/);
});

test('every screen renders without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  // login lands on Today
  await expect(page.getByRole('heading', { level: 1, name: 'Сегодня' })).toBeVisible();
  await page.goto('/personal');
  await expect(page.getByRole('heading', { name: 'Подписчики' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Цели на/ })).toBeVisible();
  for (const [path, title] of [
    ['/personal/today', 'Сегодня'],
    ['/personal/ideas', 'Идеи'],
    ['/personal/queue', 'Очередь'],
    ['/personal/clicks', 'Переходы'],
    ['/personal/settings', 'Настройки'],
    ['/personal/posts', 'Опубликовано'],
    ['/personal/replies', 'Ответы'],
    ['/personal/signals', 'Сигналы'],
    ['/personal/drafts', 'Черновики'],
    ['/personal/schedule', 'Расписание'],
    ['/personal/people', 'Люди'],
    ['/personal/audience', 'Аудитория'],
    ['/personal/challenges', 'Челленджи'],
    ['/personal/sources', 'Источники'],
    ['/personal/account', 'Аккаунт'],
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(`^${title}`) })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('compose → publish now → worker publishes to demo platforms', async ({ page }) => {
  await login(page);
  await page.goto('/personal/posts');
  const text = `E2E пост ${Date.now()}`;
  await page.getByRole('button', { name: 'Новый пост' }).click();
  await page.getByLabel('Текст').fill(text);
  await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
  await expect(page.getByText('Отправлено в публикацию')).toBeVisible();
  await expect
    .poll(
      async () => {
        await page.reload();
        const row = page.getByRole('row').filter({ hasText: text });
        return (await row.count()) ? row.getByText('Опубликован').count() : 0;
      },
      { timeout: 30_000, intervals: [1000, 2000] },
    )
    .toBe(1);
});

test('share link opens read-only overview without login', async ({ page, browser }) => {
  await login(page);
  await page.goto('/personal');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Поделиться' }).click();
  const toast = page.getByText(/\/share\//);
  await expect(toast).toBeVisible();
  const url = (await toast.textContent())!.match(/https?:\/\/\S+\/share\/\S+/)![0];
  const anon = await browser.newPage();
  await anon.goto(url);
  await expect(anon.getByText('только просмотр')).toBeVisible();
  await expect(anon.getByRole('button', { name: 'Изменить цели' })).toHaveCount(0);
});

test('projects are isolated and switchable; / remembers the last project', async ({ page }) => {
  await login(page);
  await page.goto('/pet-project');
  await expect(page.getByRole('button', { name: 'Сменить проект' })).toContainText('Pet-проект');
  // pet project has only its own channels
  await expect(page.getByRole('main').getByText('@socialboard')).toHaveCount(0);
  await page.goto('/pet-project/account');
  await expect(page.getByRole('main').getByText('@pet_project')).toBeVisible();
  await expect(page.getByRole('main').getByText('@socialboard')).toHaveCount(0);
  // cross-project view labels cards with their project
  await page.goto('/all');
  await expect(page.getByText('· Pet-проект').first()).toBeVisible();
  // `/` returns to the last opened project
  await page.goto('/pet-project/posts');
  await page.goto('/');
  await expect(page).toHaveURL(/\/pet-project\/today$/);
});

test('unknown project is a 404', async ({ page }) => {
  await login(page);
  const res = await page.goto('/no-such-project');
  expect(res?.status()).toBe(404);
});

test('factory: idea → drafts for product and founder → approve into the queue', async ({ page }) => {
  await login(page);
  const title = `E2E идея ${Date.now()}`;
  await page.goto('/pet-project/ideas');
  await page.getByLabel('Идея').fill(title);
  await page.getByRole('button', { name: 'Добавить' }).click();
  const idea = page.getByRole('listitem').filter({ hasText: title });
  await expect(idea).toBeVisible();
  await idea.getByRole('button', { name: 'Сделать посты' }).click();
  await expect(page.getByText(/\d+ черновик/)).toBeVisible();

  await page.goto('/all/today');
  const drafts = page.getByRole('listitem').filter({ hasText: title });
  await expect(drafts.first()).toBeVisible();
  // both angles: the product and the founder
  await expect(drafts.filter({ hasText: 'от продукта' })).toHaveCount(1);
  await drafts.filter({ hasText: 'от продукта' }).getByRole('button', { name: 'В очередь' }).click();
  await expect(page.getByText(/В очереди: 1/)).toBeVisible();

  await page.goto('/pet-project/queue');
  await expect(page.getByRole('listitem').filter({ hasText: title }).first()).toBeVisible();
});

async function setLanguage(page: Page, locale: 'en' | 'ru') {
  await page.goto('/personal/account');
  const form = page.locator('form').filter({ has: page.locator('#p-locale') });
  await form.locator('#p-locale').selectOption(locale);
  await form.locator('button[type=submit]').click();
  await expect(form.locator('[role=status]')).toBeVisible();
}

test('interface language follows the profile (en ↔ ru)', async ({ page }) => {
  await login(page);
  try {
    await setLanguage(page, 'en');
    await page.goto('/personal/today');
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ideas' })).toBeVisible();
  } finally {
    // other tests assert Russian copy
    await setLanguage(page, 'ru');
  }
  await page.goto('/personal/today');
  await expect(page.getByRole('heading', { level: 1, name: 'Сегодня' })).toBeVisible();
});
