import { FIELD_KEYWORDS, type Field } from "./config.js";
import type { GammaMarket } from "./types.js";

/** Builds a lowercase blob of every category/tag string attached to a market (and its parent events). */
function textBlobFor(market: GammaMarket): string {
  const parts: string[] = [];
  if (market.category) parts.push(market.category);
  for (const c of market.categories ?? []) parts.push(c.label);
  for (const t of market.tags ?? []) {
    if (t.label) parts.push(t.label);
    if (t.slug) parts.push(t.slug);
  }
  for (const ev of market.events ?? []) {
    if (ev.category) parts.push(ev.category);
    for (const c of ev.categories ?? []) parts.push(c.label);
    for (const t of ev.tags ?? []) {
      if (t.label) parts.push(t.label);
      if (t.slug) parts.push(t.slug);
    }
  }
  return parts.join(" | ").toLowerCase();
}

export function classifyMarket(market: GammaMarket): Field {
  const blob = textBlobFor(market);
  if (!blob) return "other";

  for (const field of Object.keys(FIELD_KEYWORDS) as Array<Exclude<Field, "other">>) {
    for (const keyword of FIELD_KEYWORDS[field]) {
      if (blob.includes(keyword)) return field;
    }
  }
  return "other";
}
