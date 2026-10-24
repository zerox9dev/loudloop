import { eq, sql } from 'drizzle-orm';
import { db, linkClicks, links } from '@/lib/db';

/** Public short-link redirect: counts the click, then 302 to the UTM-tagged destination. */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [link] = await db.select().from(links).where(eq(links.code, code));
  if (!link) return new Response('Not found', { status: 404 });
  const ua = req.headers.get('user-agent') ?? '';
  // link-preview bots (TelegramBot, Twitterbot, Slackbot, LinkedInBot…) unfurl links; they aren't people.
  // In-app browsers of those apps are real readers and stay counted.
  if (!/bot\b|bot\/|crawler|spider|facebookexternalhit|embedly|whatsapp\/\d/i.test(ua)) {
    await db.update(links).set({ clicks: sql`${links.clicks} + 1` }).where(eq(links.id, link.id));
    await db.insert(linkClicks).values({ linkId: link.id, referrer: req.headers.get('referer')?.slice(0, 500) ?? null });
  }
  return Response.redirect(link.url, 302);
}
