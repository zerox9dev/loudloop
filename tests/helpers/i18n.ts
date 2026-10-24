import { createTranslator } from 'next-intl';
import ru from '@/messages/ru.json';
import { issueTexts, type Issue } from '@/lib/services/validate';

const t = createTranslator({ locale: 'ru', messages: ru });

/** Validation issues rendered in Russian, so assertions read like the UI. */
export const ruIssues = (issues: Issue[]) => issueTexts(issues, t as never);
