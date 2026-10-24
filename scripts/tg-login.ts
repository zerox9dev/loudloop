/**
 * One-time Telegram MTProto login. Prints a session string to paste into Account → Telegram.
 * Needs TELEGRAM_API_ID / TELEGRAM_API_HASH from https://my.telegram.org.
 */
import { createInterface } from 'node:readline/promises';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH ?? '';
if (!apiId || !apiHash) {
  console.error('Задайте TELEGRAM_API_ID и TELEGRAM_API_HASH в .env');
  process.exit(1);
}

async function main() {
const rl = createInterface({ input: process.stdin, output: process.stdout });
const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 3 });
await client.start({
  phoneNumber: () => rl.question('Телефон (+48…): '),
  password: () => rl.question('Пароль 2FA (если есть): '),
  phoneCode: () => rl.question('Код из Telegram: '),
  onError: (e) => console.error(e),
});
console.log('\nСессия (вставьте в Account → Telegram):\n');
console.log(client.session.save());
await client.disconnect();
rl.close();
process.exit(0);
}

main();
