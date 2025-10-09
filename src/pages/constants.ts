export const SCENES = ["bookstore", "coffee", "campus"] as const;
export type Scene = typeof SCENES[number];

export const DEFAULTS = {
  scene: "bookstore" as Scene,
  interlocutor: "neutral" as const,
};

// Guardrail patterns
export const CRISIS_KEYWORDS = ["suicide", "kill myself", "end it all", "self-harm", "hurt myself", "want to die", "ending my life"];
export const CONTROVERSIAL_KEYWORDS = ["politics", "religion", "trump", "biden", "abortion", "gun control", "immigration", "sex", "sexual"];

export const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
export const PHONE_RE = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/;
export const SSN_RE = /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/;
export const ADDRESS_RE = /\b\d+\s+[A-Za-z\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct)\b/i;

export type Severity = "CRISIS" | "PII" | "CONTROVERSIAL" | "COACHING" | "NONE";
export const SEVERITY_ORDER: Severity[] = ["CRISIS", "PII", "CONTROVERSIAL", "COACHING", "NONE"];
