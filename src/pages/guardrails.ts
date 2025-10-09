type TriggerKind = "CRISIS" | "PII" | "CONTROVERSIAL" | "COACHING" | "NONE";

interface Trigger {
  kind: TriggerKind;
  confidence: number;
}

const CRISIS_PATTERNS = /\b(suicide|kill myself|end it all|self-harm|hurt myself|die|ending my life)\b/i;
const PII_PATTERNS = /\b(\d{3}[-.]?\d{2}[-.]?\d{4}|\d{3}[-.]?\d{3}[-.]?\d{4}|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\d{5}(-\d{4})?)\b/i;
const CONTROVERSIAL_PATTERNS = /\b(politics|religion|trump|biden|abortion|gun control|immigration)\b/i;

export function detectTriggers(text: string): Trigger[] {
  const triggers: Trigger[] = [];
  
  if (CRISIS_PATTERNS.test(text)) {
    triggers.push({ kind: "CRISIS", confidence: 1.0 });
  }
  if (PII_PATTERNS.test(text)) {
    triggers.push({ kind: "PII", confidence: 0.9 });
  }
  if (CONTROVERSIAL_PATTERNS.test(text)) {
    triggers.push({ kind: "CONTROVERSIAL", confidence: 0.8 });
  }
  
  if (triggers.length === 0) {
    triggers.push({ kind: "NONE", confidence: 1.0 });
  }
  
  return triggers;
}

export function prioritize(triggers: Trigger[]): Trigger {
  const order: TriggerKind[] = ["CRISIS", "PII", "CONTROVERSIAL", "COACHING", "NONE"];
  for (const kind of order) {
    const found = triggers.find(t => t.kind === kind);
    if (found) return found;
  }
  return { kind: "NONE", confidence: 1.0 };
}

export function coachMessageFor(kind: TriggerKind): string | null {
  switch (kind) {
    case "PII":
      return "Avoid sharing personal info like emails or phone numbers with strangers.";
    case "CONTROVERSIAL":
      return "Keep it light — try asking about books, hobbies, or weekend plans instead.";
    case "COACHING":
      return "Try asking an open question to keep the conversation flowing.";
    default:
      return null;
  }
}

export async function crisisBanner(zip?: string): Promise<string> {
  return "If you're in crisis, call or text 988 in the U.S.";
}
