import {
  CRISIS_KEYWORDS, CONTROVERSIAL_KEYWORDS,
  EMAIL_RE, PHONE_RE, SSN_RE, ADDRESS_RE,
  SEVERITY_ORDER, type Severity
} from "./constants";

export type Trigger = { kind: Severity; reason: string };

export function detectTriggers(text: string): Trigger[] {
  const t = text.toLowerCase();
  const hits: Trigger[] = [];
  // Crisis
  if (CRISIS_KEYWORDS.some(k => t.includes(k))) hits.push({ kind: "CRISIS", reason: "crisis" });
  // PII
  if (EMAIL_RE.test(text) || PHONE_RE.test(text) || SSN_RE.test(text) || ADDRESS_RE.test(text)) {
    hits.push({ kind: "PII", reason: "pii" });
  }
  // Controversial
  if (CONTROVERSIAL_KEYWORDS.some(k => t.includes(k))) hits.push({ kind: "CONTROVERSIAL", reason: "controversial" });
  return hits.length ? hits : [{ kind: "NONE", reason: "none" }];
}

export function prioritize(triggers: Trigger[]): Trigger {
  if (!triggers.length) return { kind: "NONE", reason: "none" };
  let best = triggers[0];
  for (const trig of triggers) {
    if (SEVERITY_ORDER.indexOf(trig.kind) < SEVERITY_ORDER.indexOf(best.kind)) best = trig;
  }
  return best;
}

export function coachMessageFor(kind: Severity): string | null {
  switch (kind) {
    case "PII":
      return "Avoid sharing personal contact info with strangers. Keep it general.";
    case "CONTROVERSIAL":
      return "That's a heavy topic for quick small talk. Try a neutral pivot question.";
    case "COACHING":
      return "Add an open question to keep things moving.";
    default:
      return null;
  }
}

async function getLocalCrisisSupport(zip: string): Promise<string | null> {
  if (zip.startsWith("90210")) {
    return "Los Angeles County Mental Health: 1-800-854-7771";
  } else if (zip.startsWith("10001")) {
    return "NYC Well: 1-888-NYC-WELL (1-888-692-9355)";
  }
  return null;
}

export async function crisisBanner(zip?: string): Promise<string> {
  const national = "988 Suicide & Crisis Lifeline (U.S.)";
  if (zip) {
    const localSupport = await getLocalCrisisSupport(zip);
    if (localSupport) {
      return `If you're in crisis, you can call or text ${localSupport} or the ${national}.`;
    }
  }
  return `If you're in crisis, you can call or text ${national}.`;
}
