import { randomUUID } from 'crypto';

/**
 * A short random suffix, so data created by parallel scenarios never clashes: "Ada Lovelace" becomes
 * "Ada Lovelace 3f9c2a1b".
 */
export function uniqueSuffix(): string {
  return randomUUID().replace(/-/g, '').slice(0, 8);
}

/** The text with a unique suffix: unique('Ada Lovelace') -> "Ada Lovelace 3f9c2a1b". */
export function unique(text: string): string {
  return `${text} ${uniqueSuffix()}`;
}

/** A unique e-mail address on the example.com domain, which never receives mail. */
export function uniqueEmail(prefix = 'qa'): string {
  return `${prefix}.${uniqueSuffix()}@example.com`;
}
