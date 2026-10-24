import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/config';
import type { ProjectBrief } from './schema';

/** Synthetic demo data in the language chosen by DEMO_LOCALE (en | uk | ru). */
export type DemoContent = {
  personalName: string;
  petName: string;
  draftPrefix: string;
  challenge: string;
  texts: string[];
  commenters: string[];
  comments: string[];
  sources: { name: string; url: string }[];
  founderBrief: ProjectBrief;
  petBrief: ProjectBrief;
  ideas: { founder: { title: string; body: string }[]; pet: { title: string; body: string; url?: string }[] };
};

const en: DemoContent = {
  personalName: 'Personal brand',
  petName: 'Pet project',
  draftPrefix: 'Draft:',
  challenge: 'A Threads post every day',
  texts: [
    'How I built auto-posting over a weekend: stack, pitfalls, takeaways',
    'Shipping from your phone: 5 habits that actually save time',
    'Why the post without a picture beat everything this month',
    'Vibe coding without the pain — my pre-release checklist',
    'What 100 days of daily posting taught me',
    'A tiny Threads guide for people who just arrived',
    'Poll: which teardown format do you prefer?',
    'Built a bot that answers the usual questions for me',
    'Week in review: numbers, mistakes, plans',
    'How to write headlines people actually finish reading',
    'My 2026 working setup — nothing extra',
    'Why I stopped chasing reach',
  ],
  commenters: ['Anna K.', 'Max R.', 'dev_oleg', 'Kate L.', 'Sergii', 'Ira', 'vibecoder42', 'Dima S.', 'Olena', 'Paul', 'nastya.codes', 'Yuri'],
  comments: ['Thanks, super useful!', 'Could you expand on point two?', 'Saved 🔥', 'Tried the same, didn’t work for me(', 'When is the next teardown?', 'Great, waiting for part two', 'Where can I read more?', 'What stack is this on?', 'Best post this week', 'Can I get the template?'],
  sources: [
    { name: 'Hacker News — Best', url: 'https://hnrss.org/best' },
    { name: 'Indie Hackers', url: 'https://www.indiehackers.com/feed.xml' },
  ],
  founderBrief: {
    about: 'Indie hacker: I build and grow small SaaS products myself and write about what works in distribution.',
    audience: 'Indie hackers, solo founders and developers launching their own products',
    voice: 'Direct, first person, with numbers and self-irony, no hype',
    pillars: ['build in public', 'lessons and mistakes', 'distribution and growth', 'tools and stack'],
    promoShare: 25,
    avoid: 'Get-rich-quick promises, bragging without numbers',
    language: 'en',
  },
  petBrief: {
    about: 'Pet project: a service that turns a product changelog into ready-to-post social updates.',
    audience: 'Solo founders who have no time to write about their releases',
    voice: 'Friendly and to the point, short',
    pillars: ['new features', 'user stories', 'tips for announcing releases'],
    links: [{ label: 'Landing', url: 'https://pet-project.example.com' }],
    language: 'en',
  },
  ideas: {
    founder: [
      { title: 'Why I stopped chasing followers and started counting clicks', body: 'Followers +900 in a month, signups from social — 12. Added UTM tags and started watching which posts bring people.' },
      { title: 'My stack for launching a product over a weekend', body: 'Next.js, Postgres, Docker on a Mac mini, no cloud until the first paying users.' },
    ],
    pet: [
      { title: 'Changelog import from GitHub Releases is live', body: 'Connect a repository — new releases turn into post drafts on their own.', url: 'https://pet-project.example.com/changelog' },
      { title: 'Per-platform post variants are here', body: 'X — short with a hook, LinkedIn — with a takeaway, Telegram — in a lively voice.' },
    ],
  },
};

const ru: DemoContent = {
  personalName: 'Личный бренд',
  petName: 'Pet-проект',
  draftPrefix: 'Черновик:',
  challenge: 'Пост в Threads каждый день',
  texts: [
    'Как я собрал автопостинг за выходные: стек, грабли и выводы',
    'Токены с телефона: 5 приёмов, которые реально экономят время',
    'Разбор: почему пост без картинки зашёл лучше всех за месяц',
    'Вайбкодинг без боли — чеклист перед релизом',
    'Что я понял за 100 дней ежедневных публикаций',
    'Мини-гайд по Threads для тех, кто только пришёл',
    'Сторис-опрос: какой формат разборов вам ближе?',
    'Сделал бота, который сам отвечает на типовые вопросы',
    'Итоги недели: цифры, ошибки, планы',
    'Лайфхак: как писать заголовки, которые дочитывают',
    'Мой рабочий сетап 2026 — без лишнего',
    'Почему я перестал гнаться за охватами',
  ],
  commenters: ['Аня Ковальчук', 'Максим Р.', 'dev_oleg', 'Катя Литвин', 'Sergii', 'Ира', 'vibecoder42', 'Дима Шевчук', 'Olena', 'Павел', 'nastya.codes', 'Юра'],
  comments: ['Спасибо, очень полезно!', 'А можно подробнее про второй пункт?', 'Сохранил себе 🔥', 'Пробовал так же, у меня не взлетело(', 'Когда следующий разбор?', 'Огонь, жду продолжения', 'Где почитать про это?', 'А на каком стеке это всё?', 'Лучший пост за неделю', 'Можно шаблон?'],
  sources: [
    { name: 'Hacker News — Best', url: 'https://hnrss.org/best' },
    { name: 'Habr — Лучшее за день', url: 'https://habr.com/ru/rss/best/daily/' },
  ],
  founderBrief: {
    about: 'Инди-хакер: сам делаю и продвигаю небольшие SaaS-продукты, пишу о том, что работает в дистрибуции.',
    audience: 'Инди-хакеры, соло-фаундеры и разработчики, которые запускают свои продукты',
    voice: 'Прямо, от первого лица, с цифрами и самоиронией, без инфоцыганства',
    pillars: ['build in public', 'уроки и ошибки', 'дистрибуция и рост', 'инструменты и стек'],
    promoShare: 25,
    avoid: 'Обещания быстрых денег, хвастовство без цифр',
    language: 'ru',
  },
  petBrief: {
    about: 'Pet-проект: сервис, который превращает changelog продукта в готовые посты для соцсетей.',
    audience: 'Соло-фаундеры, которым некогда писать про свои релизы',
    voice: 'Дружелюбно и по делу, коротко',
    pillars: ['новые фичи', 'кейсы пользователей', 'советы по анонсам релизов'],
    links: [{ label: 'Лендинг', url: 'https://pet-project.example.com' }],
    language: 'ru',
  },
  ideas: {
    founder: [
      { title: 'Почему я перестал гнаться за подписчиками и начал считать переходы', body: 'За месяц подписчики +900, а регистраций из соцсетей — 12. Стал ставить UTM и смотреть, какие посты приводят людей.' },
      { title: 'Мой стек для запуска продукта за выходные', body: 'Next.js, Postgres, Docker на Mac mini, никаких облаков до первых платящих.' },
    ],
    pet: [
      { title: 'Вышел импорт changelog из GitHub Releases', body: 'Подключаешь репозиторий — новые релизы сами превращаются в черновики постов.', url: 'https://pet-project.example.com/changelog' },
      { title: 'Добавили варианты постов под каждую площадку', body: 'X — коротко с хуком, LinkedIn — с выводом, Telegram — живым тоном.' },
    ],
  },
};

const uk: DemoContent = {
  personalName: 'Особистий бренд',
  petName: 'Pet-проєкт',
  draftPrefix: 'Чернетка:',
  challenge: 'Пост у Threads щодня',
  texts: [
    'Як я зібрав автопостинг за вихідні: стек, граблі та висновки',
    'Шипінг з телефона: 5 звичок, які справді економлять час',
    'Розбір: чому пост без картинки зайшов найкраще за місяць',
    'Вайбкодинг без болю — чекліст перед релізом',
    'Що я зрозумів за 100 днів щоденних публікацій',
    'Міні-гайд по Threads для тих, хто щойно прийшов',
    'Опитування: який формат розборів вам ближчий?',
    'Зробив бота, який сам відповідає на типові питання',
    'Підсумки тижня: цифри, помилки, плани',
    'Як писати заголовки, які дочитують',
    'Мій робочий сетап 2026 — нічого зайвого',
    'Чому я перестав гнатися за охопленнями',
  ],
  commenters: ['Аня Коваль', 'Максим Р.', 'dev_oleg', 'Катя Литвин', 'Sergii', 'Іра', 'vibecoder42', 'Діма Шевчук', 'Olena', 'Павло', 'nastya.codes', 'Юра'],
  comments: ['Дякую, дуже корисно!', 'А можна детальніше про другий пункт?', 'Зберіг собі 🔥', 'Пробував так само, у мене не злетіло(', 'Коли наступний розбір?', 'Вогонь, чекаю продовження', 'Де почитати про це?', 'А на якому стеку це все?', 'Найкращий пост за тиждень', 'Можна шаблон?'],
  sources: [
    { name: 'Hacker News — Best', url: 'https://hnrss.org/best' },
    { name: 'DOU — Стрічка', url: 'https://dou.ua/feed/' },
  ],
  founderBrief: {
    about: 'Інді-хакер: сам роблю й просуваю невеликі SaaS-продукти, пишу про те, що працює в дистрибуції.',
    audience: 'Інді-хакери, соло-фаундери та розробники, які запускають свої продукти',
    voice: 'Прямо, від першої особи, з цифрами й самоіронією, без інфоциганства',
    pillars: ['build in public', 'уроки та помилки', 'дистрибуція і ріст', 'інструменти та стек'],
    promoShare: 25,
    avoid: 'Обіцянки швидких грошей, хвастощі без цифр',
    language: 'uk',
  },
  petBrief: {
    about: 'Pet-проєкт: сервіс, що перетворює changelog продукту на готові пости для соцмереж.',
    audience: 'Соло-фаундери, яким ніколи писати про свої релізи',
    voice: 'Дружньо й по суті, коротко',
    pillars: ['нові фічі', 'кейси користувачів', 'поради щодо анонсів релізів'],
    links: [{ label: 'Лендинг', url: 'https://pet-project.example.com' }],
    language: 'uk',
  },
  ideas: {
    founder: [
      { title: 'Чому я перестав гнатися за підписниками й почав рахувати переходи', body: 'За місяць підписники +900, а реєстрацій із соцмереж — 12. Почав ставити UTM і дивитися, які пости приводять людей.' },
      { title: 'Мій стек для запуску продукту за вихідні', body: 'Next.js, Postgres, Docker на Mac mini, жодних хмар до перших платних клієнтів.' },
    ],
    pet: [
      { title: 'Вийшов імпорт changelog із GitHub Releases', body: 'Підключаєш репозиторій — нові релізи самі стають чернетками постів.', url: 'https://pet-project.example.com/changelog' },
      { title: 'Додали варіанти постів під кожен майданчик', body: 'X — коротко з хуком, LinkedIn — з висновком, Telegram — живим тоном.' },
    ],
  },
};

const CONTENT: Record<Locale, DemoContent> = { en, ru, uk };

export function demoLocale(): Locale {
  const l = process.env.DEMO_LOCALE;
  return isLocale(l) ? l : DEFAULT_LOCALE;
}

export const demoContent = (locale: Locale = demoLocale()) => CONTENT[locale];
