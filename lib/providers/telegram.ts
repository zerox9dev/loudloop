import { Api, InputFile, InputMediaBuilder } from 'grammy';
import type { ProviderAdapter, ProviderContext, PostMetrics, RemoteComment, RemotePost } from './types';
import { ProviderError } from './types';

/**
 * Telegram channel.
 * Publishing goes through a bot that is an admin of the channel (Bot API, grammY).
 * Views / reactions / comments are not exposed by Bot API, so they are read through a
 * user MTProto session (gramjs) when `session` is provided — see scripts/tg-login.ts.
 */
export type TelegramCredentials = {
  botToken: string;
  chatId: string; // @username or -100…
  session?: string;
};

const CAPTION_LIMIT = 1024;

function messageUrl(chatId: string, messageId: number) {
  if (chatId.startsWith('@')) return `https://t.me/${chatId.slice(1)}/${messageId}`;
  if (chatId.startsWith('-100')) return `https://t.me/c/${chatId.slice(4)}/${messageId}`;
  return undefined;
}

async function withMtproto<T>(ctx: ProviderContext<TelegramCredentials>, fn: (client: import('telegram').TelegramClient) => Promise<T>) {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  if (!ctx.credentials.session || !apiId || !apiHash) return null;
  const { TelegramClient } = await import('telegram');
  const { StringSession } = await import('telegram/sessions');
  const client = new TelegramClient(new StringSession(ctx.credentials.session), apiId, apiHash, {
    connectionRetries: 3,
  });
  client.setLogLevel('error' as never);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.disconnect();
  }
}

function reactionsOf(msg: { reactions?: { results?: { count: number }[] } }) {
  return (msg.reactions?.results ?? []).reduce((s, r) => s + r.count, 0);
}

export const telegramAdapter: ProviderAdapter<TelegramCredentials> = {
  platform: 'telegram',

  async publish(ctx, input) {
    const api = new Api(ctx.credentials.botToken);
    const chatId = ctx.credentials.chatId;
    if (input.kind === 'story') throw new ProviderError('Telegram channels do not support stories via the Bot API', false);

    const files = input.mediaFiles;
    const longText = input.text.length > CAPTION_LIMIT;
    const caption = longText ? undefined : input.text || undefined;
    let first: number;

    if (files.length === 0) {
      first = (await api.sendMessage(chatId, input.text)).message_id;
    } else if (files.length === 1) {
      const isVideo = input.media[0]?.mime.startsWith('video/');
      const file = new InputFile(files[0]);
      const msg = isVideo
        ? await api.sendVideo(chatId, file, { caption })
        : await api.sendPhoto(chatId, file, { caption });
      first = msg.message_id;
    } else {
      const group = files.slice(0, 10).map((f, i) => {
        const isVideo = input.media[i]?.mime.startsWith('video/');
        const opts = i === 0 && caption ? { caption } : {};
        return isVideo ? InputMediaBuilder.video(new InputFile(f), opts) : InputMediaBuilder.photo(new InputFile(f), opts);
      });
      first = (await api.sendMediaGroup(chatId, group))[0].message_id;
    }
    if (files.length > 0 && longText) await api.sendMessage(chatId, input.text);

    return { externalId: String(first), url: messageUrl(chatId, first) };
  },

  async fetchStats(ctx) {
    const api = new Api(ctx.credentials.botToken);
    return { followers: await api.getChatMemberCount(ctx.credentials.chatId) };
  },

  async fetchPostMetrics(ctx, externalIds) {
    const out: Record<string, PostMetrics> = {};
    if (externalIds.length === 0) return out;
    await withMtproto(ctx, async (client) => {
      const msgs = await client.getMessages(ctx.credentials.chatId, { ids: externalIds.map(Number) });
      for (const m of msgs) {
        if (!m) continue;
        out[String(m.id)] = {
          views: m.views ?? 0,
          reactions: reactionsOf(m as never),
          comments: m.replies?.replies ?? 0,
          shares: m.forwards ?? 0,
        };
      }
    });
    return out;
  },

  async fetchComments(ctx, postExternalIds) {
    const out: RemoteComment[] = [];
    await withMtproto(ctx, async (client) => {
      for (const postId of postExternalIds) {
        const replies = await client.getMessages(ctx.credentials.chatId, { replyTo: Number(postId), limit: 50 }).catch(() => []);
        for (const r of replies) {
          const sender = (await r.getSender().catch(() => undefined)) as
            | { firstName?: string; lastName?: string; title?: string; username?: string }
            | undefined;
          const name = [sender?.firstName, sender?.lastName].filter(Boolean).join(' ') || sender?.title || 'Anonymous';
          out.push({
            externalId: `${postId}:${r.id}`,
            postExternalId: postId,
            authorName: name,
            authorHandle: sender?.username ? `@${sender.username}` : undefined,
            text: r.message ?? '',
            postedAt: new Date(r.date * 1000),
          });
        }
      }
    });
    return out;
  },

  /** Channel history is only readable through the MTProto session (Bot API can't list messages). */
  async fetchPosts(ctx, { since, limit }) {
    if (!ctx.credentials.session) throw new ProviderError('Telegram history import needs a signed-in Telegram account (Account → Telegram)', false);
    const out: RemotePost[] = [];
    await withMtproto(ctx, async (client) => {
      for await (const m of client.iterMessages(ctx.credentials.chatId, { limit })) {
        const publishedAt = new Date(m.date * 1000);
        if (since && publishedAt < since) break;
        if (!m.message && !m.media) continue; // service messages
        // albums arrive as several messages; keep the one carrying the caption
        if (m.groupedId && !m.message) continue;
        const isVideo = m.video || m.gif;
        out.push({
          externalId: String(m.id),
          url: messageUrl(ctx.credentials.chatId, m.id),
          text: m.message ?? '',
          kind: m.photo ? 'photo' : isVideo ? 'reel' : 'post',
          publishedAt,
          metrics: { views: m.views ?? 0, reactions: reactionsOf(m as never), comments: m.replies?.replies ?? 0, shares: m.forwards ?? 0 },
        });
      }
    });
    return out;
  },

  async reply(ctx, comment, text) {
    const [postId, replyId] = comment.externalId.split(':').map(Number);
    const done = await withMtproto(ctx, async (client) => {
      // Comments live in the linked discussion group; reply to the specific comment there.
      const { Api: MtApi } = await import('telegram');
      const disc = await client.invoke(
        new MtApi.messages.GetDiscussionMessage({ peer: ctx.credentials.chatId, msgId: postId }),
      );
      const group = disc.chats[0];
      if (group && replyId) await client.sendMessage(group, { message: text, replyTo: replyId });
      else await client.sendMessage(ctx.credentials.chatId, { message: text, commentTo: postId });
      return true;
    });
    if (!done) throw new ProviderError('Replying needs a signed-in Telegram account (Account → Telegram)', false);
  },
};
