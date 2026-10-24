import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { Platform, ProjectBrief } from '@/lib/db/schema';
import { PLATFORM_META } from '@/lib/platforms';
import { platformTextLength } from '@/lib/services/validate';
import { translatorFor } from '@/lib/i18n/translator';

/**
 * Turns one idea into platform-native posts.
 * angle "product": the product speaks ("we shipped…"); angle "founder": the founder speaks in
 * first person (lessons, behind the scenes) and mentions the product as context, not as an ad.
 */
export type GenerateInput = {
  angle: 'product' | 'founder';
  project: { name: string; brief: ProjectBrief };
  /** for the founder angle: the product the idea is about, if any */
  product?: { name: string; brief: ProjectBrief };
  idea: { title: string; body?: string | null; url?: string | null };
  platforms: Platform[];
  /** language of the posts (en | uk | ru); the project's brief.language wins */
  language?: string;
};

export type Generated = { variants: Partial<Record<Platform, string>>; source: 'ai' | 'template' };

const STYLE: Record<Platform, string> = {
  x: 'X: up to 280 characters including the link, hook in the first line, at most one hashtag.',
  threads: 'Threads: up to 500 characters, conversational, like talking to a friend; a question at the end is fine.',
  linkedin: 'LinkedIn: 600–1300 characters, hook in the first line, short paragraphs, a takeaway or lesson, no clickbait.',
  telegram: 'Telegram channel: 300–900 characters, lively author voice, 1–2 emoji at most, link at the end.',
  instagram: 'Instagram caption: up to 600 characters, a gripping first line, 3–5 relevant hashtags at the end, no links in the text (say "link in bio").',
};

const SYSTEM = `You are the distribution editor for an indie hacker. You write platform-native posts.
Rules: never invent facts, numbers or promises — use only what the brief and the idea say. No buzzwords or clichés
("revolutionary", "unique", "game-changer"). Every platform gets its own text, not a trimmed copy.`;

function briefText(label: string, b: ProjectBrief) {
  return [
    `${label}:`,
    b.about && `About: ${b.about}`,
    b.audience && `Audience: ${b.audience}`,
    b.voice && `Voice: ${b.voice}`,
    b.pillars?.length && `Themes: ${b.pillars.join('; ')}`,
    b.links?.[0] && `Main link: ${b.links[0].url}`,
    b.avoid && `Avoid: ${b.avoid}`,
  ]
    .filter(Boolean)
    .join('\n');
}

const languageOf = (input: GenerateInput) => input.project.brief.language ?? input.language;
const languageName = (input: GenerateInput) => translatorFor(languageOf(input)).languageName;

export function buildPrompt(input: GenerateInput) {
  const parts = [
    `Write in ${languageName(input)}.`,
    input.angle === 'founder'
      ? "Write in the FOUNDER'S FIRST PERSON: personal experience, what you learned, what was hard. The product is context, not an ad."
      : 'Write AS THE PRODUCT: what is new and which user problem it solves.',
    briefText(input.angle === 'founder' ? 'Founder' : 'Product', input.project.brief),
    input.product && briefText(`Product "${input.product.name}"`, input.product.brief),
    `Idea: ${input.idea.title}${input.idea.body ? `\n${input.idea.body}` : ''}${input.idea.url ? `\nLink: ${input.idea.url}` : ''}`,
    `Platforms:\n${input.platforms.map((p) => `- ${STYLE[p]}`).join('\n')}`,
  ];
  return parts.filter(Boolean).join('\n\n');
}

/** Deterministic fallback when no API key is set: readable, within limits, clearly a draft. */
export function templateVariants(input: GenerateInput): Generated {
  const link = input.idea.url ?? input.project.brief.links?.[0]?.url ?? input.product?.brief.links?.[0]?.url ?? '';
  const lead = input.angle === 'founder' ? translatorFor(languageOf(input)).t('generate.founderLead', { title: input.idea.title }) : input.idea.title;
  const body = input.idea.body?.trim() ?? '';
  const variants: Partial<Record<Platform, string>> = {};
  for (const p of input.platforms) {
    const limit = PLATFORM_META[p].textLimit;
    // no second copy of a link that is already in the idea text
    const tail = p === 'instagram' || !link || `${lead} ${body}`.includes(link) ? '' : `\n\n${link}`;
    let text = `${lead}${body ? `\n\n${body}` : ''}`;
    while (platformTextLength(p, text + tail) > limit && text.length > 20) text = `${text.slice(0, Math.floor(text.length * 0.9)).trimEnd()}…`;
    variants[p] = text + tail;
  }
  return { variants, source: 'template' };
}

export async function generateVariants(input: GenerateInput): Promise<Generated> {
  if (!process.env.ANTHROPIC_API_KEY || input.platforms.length === 0) return templateVariants(input);
  const schema = z.object(Object.fromEntries(input.platforms.map((p) => [p, z.string()])) as Record<Platform, z.ZodString>);
  try {
    const client = new Anthropic();
    const res = await client.messages.parse({
      model: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
      max_tokens: 8000,
      output_config: { effort: 'medium', format: zodOutputFormat(schema) },
      system: SYSTEM,
      messages: [{ role: 'user', content: buildPrompt(input) }],
    });
    if (res.stop_reason === 'refusal' || !res.parsed_output) return templateVariants(input);
    const variants: Partial<Record<Platform, string>> = {};
    for (const p of input.platforms) {
      const text = (res.parsed_output as Record<string, string>)[p]?.trim();
      // the model may overshoot a limit: fall back for that platform rather than publish a failure
      variants[p] = text && platformTextLength(p, text) <= PLATFORM_META[p].textLimit ? text : templateVariants({ ...input, platforms: [p] }).variants[p];
    }
    return { variants, source: 'ai' };
  } catch (e) {
    console.error('generation failed', e);
    return templateVariants(input);
  }
}
