<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-dark.svg">
    <img alt="Loudloop" src=".github/assets/logo-light.svg" width="300">
  </picture>
</p>

<p align="center">
  <strong>Завод дистрибуції для інді-хакера.</strong><br>
  Перетворює те, що ви шипите, на пости — від кожного продукту <em>і</em> від вас як засновника —<br>
  у Telegram, Instagram, Threads, X і LinkedIn. Self-hosted, один <code>docker compose up</code>.
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.ru.md">Русский</a>
</p>

<p align="center">
  <img alt="Loudloop — Сьогодні" src=".github/screenshots/today.png" width="900">
</p>

## Навіщо

Робити продукти — цікаво. Дистрибуція — те, що тихо не стається: кожен реліз вимагає поста під кожен майданчик, особистому акаунту потрібен власний голос, і ніхто не каже, який пост справді привів користувачів.

Loudloop — конвеєр для цього:

- **На вході ідеї** — нотатки, події продукту (GitHub releases, changelog) і RSS-стрічки.
- **На виході чернетки** — Claude пише нативний варіант під кожен майданчик: хук для X, висновок для LinkedIn, живий тон для Telegram.
- **Два ракурси на реліз** — продукт анонсує, *і* ви пишете від першої особи; ліміт промо береже особистий акаунт від реклами.
- **Ви лише схвалюєте** — одним кліком чернетка стає в найближчий слот вашого ритму.
- **Кліки, а не марнославство** — кожне посилання отримує UTM і за бажанням власне коротке посилання: видно, який пост привів людей до якого продукту.

## Можливості

| | |
| --- | --- |
| ![Огляд](.github/screenshots/overview.png) | ![Ідеї](.github/screenshots/ideas.png) |
| **Огляд** — цілі на місяць з нормою темпу, AI-коментарі, графік росту. | **Ідеї** — з однієї ідеї чернетки від продукту й від вас. |
| ![Редактор](.github/screenshots/composer.png) | ![Переходи](.github/screenshots/clicks.png) |
| **Редактор** — спільний текст + варіант під кожен майданчик з лімітами. | **Переходи** — власні короткі посилання з UTM за продуктами, майданчиками й постами. |
| ![Черга](.github/screenshots/queue.png) | ![Підключення](.github/screenshots/account.png) |
| **Черга** — слоти публікацій для кожного майданчика. | **Підключення** — OAuth для Instagram, Threads, X і LinkedIn; бот і вхід в акаунт для Telegram. |

**А ще:** проєкти (особистий бренд + будь-яка кількість продуктів), імпорт історії при підключенні й щогодинна синхронізація, спільний інбокс відповідей, «Люди», сигнали, челенджі, надійна публікація з повторами й захистом від дублів, власний S3 для медіа, інтерфейс англійською, українською та російською — і своя мова постів для кожного проєкту.

## Швидкий старт

```bash
cp .env.example .env
sed -i '' "s|^AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -base64 32)|; s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$(openssl rand -base64 32)|" .env
sed -i '' "s|^S3_ACCESS_KEY_ID=.*|S3_ACCESS_KEY_ID=$(openssl rand -hex 16)|; s|^S3_SECRET_ACCESS_KEY=.*|S3_SECRET_ACCESS_KEY=$(openssl rand -hex 32)|" .env
docker compose up -d --build
```

Відкрийте **http://localhost:3000** і увійдіть з `ADMIN_EMAIL` / `ADMIN_PASSWORD` з `.env` (порожній пароль генерується під час першого запуску: `docker compose logs web | grep ADMIN_PASSWORD`). Мову демо-даних і інтерфейсу задають `DEMO_LOCALE` і `ADMIN_LOCALE` (`uk`).

## Підключення майданчиків

Відкрийте проєкт → **Акаунт → Підключити майданчик**. Кожна картка показує офіційний спосіб, а якщо ключів застосунку немає — покрокове налаштування з callback URL для копіювання.

| Майданчик | Як | Що отримуєте |
| --- | --- | --- |
| **Telegram** | Бот з @BotFather як адмін каналу (OAuth для каналів у Telegram немає) + вхід в акаунт у панелі (телефон → код → 2FA) | Публікація; після входу — перегляди, реакції, коментарі, історія |
| **Instagram** | OAuth (Instagram API with Instagram Login) | Фото, рілси, сторіс, метрики, коментарі, історія |
| **Threads** | OAuth (Threads API) | Пости, метрики, відповіді, історія |
| **X** | OAuth 2.0 з PKCE, токени оновлюються самі | Публікація на Free; метрики й історія — з Basic |
| **LinkedIn** | OAuth (Sign In with LinkedIn + Share on LinkedIn) | Пости й фото в профіль |

Meta, LinkedIn і X приймають лише **https**-callback, тож `APP_URL` має бути публічним (Tailscale Funnel, cloudflared або домен). Для медіа Instagram і Threads відкрийте порт `8333` і задайте `S3_PUBLIC_URL`.

Повний перелік змінних — у [README англійською](README.md#configuration).

## Ліцензія

[GNU AGPL-3.0](LICENSE). Можна вільно використовувати, змінювати й розгортати в себе; якщо ви запускаєте змінену версію як мережевий сервіс, зміни треба опублікувати під тією ж ліцензією.
