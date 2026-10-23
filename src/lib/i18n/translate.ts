import { MESSAGES, type MessageKey } from "./messages";

export type Locale = keyof typeof MESSAGES;
export type Vars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: Vars) => string;

/**
 * Message lookup with `{name}` placeholders. `{n|singular|plural}` picks a form from a
 * number: "{count|partie|parties}".
 */
export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  const template = MESSAGES[locale][key] ?? MESSAGES.en[key] ?? key;
  if (!vars) return template;
  return template
    .replace(/\{(\w+)\|([^|}]*)\|([^}]*)\}/g, (_, name: string, one: string, many: string) =>
      Math.abs(Number(vars[name])) <= 1 && (locale === "fr" || Number(vars[name]) === 1)
        ? one
        : many,
    )
    .replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** A translator for code outside React (and for tests). */
export function translator(locale: Locale): Translate {
  return (key, vars) => translate(locale, key, vars);
}

export type { MessageKey };
