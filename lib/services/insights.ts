import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { PLATFORM_META } from '@/lib/platforms';
import { translatorFor } from "@/lib/i18n/translator";
import type { Platform } from '@/lib/db/schema';

export type InsightFacts = {
  platform: Platform;
  followers: number;
  yesterday: number;
  today: number;
  weekday: string;
  goal?: { target: number; perDayNeeded: number; plannedPerDay: number; percent: number; daysLeft: number };
  topPost?: { text: string; views: number; ratio: number };
};

const InsightSchema = z.object({ emoji: z.string(), text: z.string() });
export type Insight = z.infer<typeof InsightSchema>;

/** Deterministic fallback when no API key is configured or the call fails. */
export function templateInsight(facts: InsightFacts, locale?: string): Insight {
  const { t, f } = translatorFor(locale);
  const platform = PLATFORM_META[facts.platform].label;
  if (facts.goal && facts.followers >= facts.goal.target) return { emoji: '🏆', text: t('insight.goalReached', { target: f.num(facts.goal.target), platform }) };
  if (facts.topPost && facts.topPost.ratio >= 2)
    return { emoji: '🚀', text: t('insight.viral', { text: facts.topPost.text.slice(0, 40), ratio: new Intl.NumberFormat(f.locale, { maximumFractionDigits: 1 }).format(facts.topPost.ratio) }) };
  if (facts.yesterday <= 0 && facts.today <= 0) return { emoji: '👀', text: t('insight.silence', { platform, followers: facts.followers }) };
  if (facts.goal) {
    const need = facts.goal.perDayNeeded;
    if (need <= facts.goal.plannedPerDay)
      return { emoji: '😎', text: t('insight.easy', { target: f.num(facts.goal.target), left: f.num(facts.goal.target - facts.followers), need: f.num(need) }) };
    return { emoji: '🎯', text: t('insight.push', { yesterday: f.num(facts.yesterday), target: f.num(facts.goal.target), need: f.num(need) }) };
  }
  return { emoji: '📈', text: t('insight.steady', { yesterday: f.num(facts.yesterday), today: f.num(facts.today) }) };
}

const SYSTEM = `You write one short comment for a social-media card on a content creator's dashboard.
Tone: friendly, lively, informal second person, no corporate speak, a light touch of irony. One or two sentences, under 140 characters.
Use only the facts provided. Pick one fitting emoji.`;

export async function generateInsight(f: InsightFacts, locale?: string): Promise<Insight> {
  if (!process.env.ANTHROPIC_API_KEY) return templateInsight(f, locale);
  try {
    const client = new Anthropic();
    const res = await client.messages.parse({
      model: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
      max_tokens: 1024,
      output_config: { effort: 'low', format: zodOutputFormat(InsightSchema) },
      system: `${SYSTEM}\nWrite in ${translatorFor(locale).languageName}.`,
      messages: [{ role: 'user', content: JSON.stringify({ ...f, platform: PLATFORM_META[f.platform].label }) }],
    });
    if (res.stop_reason === 'refusal' || !res.parsed_output) return templateInsight(f, locale);
    return { emoji: res.parsed_output.emoji.slice(0, 8), text: res.parsed_output.text.slice(0, 220) };
  } catch (e) {
    console.error('insight generation failed', e);
    return templateInsight(f, locale);
  }
}
