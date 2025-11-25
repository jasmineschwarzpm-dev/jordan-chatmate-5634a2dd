export const SCENES = ["bookstore", "coffee", "campus"] as const;
export type Scene = typeof SCENES[number];

export const DEFAULTS = {
  scene: "bookstore" as Scene,
  interlocutor: "neutral" as const,
};

// Guardrail patterns
export const CRISIS_KEYWORDS = [
  // Explicit crisis language
  "suicide", "kill myself", "end it all", "self-harm", "hurt myself", "want to die", "ending my life",
  // Distress signals that indicate potential crisis
  "can't find a reason", "no reason to", "can't keep going", "can't go on", "give up on life", 
  "no point in living", "tired of living", "better off dead", "don't want to be here", 
  "end my suffering", "escape this pain", "no way out", "can't take it anymore"
];
export const CONTROVERSIAL_KEYWORDS = ["politics", "religion", "trump", "biden", "abortion", "gun control", "immigration", "sex", "sexual"];
export const INSULT_KEYWORDS = ["weird", "stupid", "dumb", "idiotic", "lame", "loser", "pathetic", "ridiculous", "absurd", "crazy for liking", "insane for liking", "nerdy", "geeky", "uncool"];

export const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
export const PHONE_RE = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/;
export const SSN_RE = /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/;
export const ADDRESS_RE = /\b\d+\s+[A-Za-z\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct)\b/i;

export type Severity = "CRISIS" | "PII" | "CONTROVERSIAL" | "INSULT" | "COACHING" | "NONE";
export const SEVERITY_ORDER: Severity[] = ["CRISIS", "PII", "CONTROVERSIAL", "INSULT", "COACHING", "NONE"];
