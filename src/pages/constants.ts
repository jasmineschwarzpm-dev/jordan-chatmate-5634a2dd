export const SCENES = ["bookstore", "coffee", "campus"] as const;
export type Scene = typeof SCENES[number];

export const DEFAULTS = {
  scene: "bookstore" as Scene,
  interlocutor: "neutral" as const,
};

// Guardrail patterns - Three-tiered crisis detection system
// TIER 1: Explicit, high-risk - trigger immediate LLM analysis
export const TIER_1_CRISIS_KEYWORDS = [
  // Explicit suicidal language
  "suicide", "suicidal", "suicid", "kill myself", "end it all", "end my life",
  "off myself", "want to die", "wanna die", "ending my life",
  
  // Self-harm
  "self-harm", "self harm", "hurt myself", "cutting myself",
  
  // Internet slang (explicit)
  "kms", "kys", "unalive", "unaliving",
  
  // Better off dead variants
  "better off dead", "should be dead", "deserve to die"
];

// TIER 2: Ambiguous distress signals - accumulate or analyze sentiment
export const TIER_2_DISTRESS_KEYWORDS = [
  // Hopelessness (ambiguous)
  "hopeless", "no hope", "lost hope", "no point", "no reason to",
  "can't keep going", "can't go on", "give up", "giving up",
  
  // Finality language (caught "bye forever")
  "bye forever", "goodbye forever", "final goodbye", "last time",
  "won't see me again", "this is it",
  
  // Staying/reason language (caught "inspiration to stay")
  "reason to stay", "inspiration to stay", "why I stay", "keep going",
  "reasons to live", "worth living",
  
  // Isolation indicators
  "no one will miss", "better without me", "won't matter",
  "no one cares", "alone in this",
  
  // Exhaustion/giving up
  "tired of living", "tired of trying", "don't want to be here",
  "can't handle this", "can't take it", "done with everything",
  "falling apart", "breaking down", "escape this pain",
  
  // Seeking help signals
  "stories of hope", "stories of survival", "need help"
];

// Legacy keyword list (kept for backward compatibility with existing trigger detection)
export const CRISIS_KEYWORDS = [...TIER_1_CRISIS_KEYWORDS, ...TIER_2_DISTRESS_KEYWORDS];
export const CONTROVERSIAL_KEYWORDS = ["politics", "religion", "trump", "biden", "abortion", "gun control", "immigration", "sex", "sexual"];
export const INSULT_KEYWORDS = ["weird", "stupid", "dumb", "idiotic", "lame", "loser", "pathetic", "ridiculous", "absurd", "crazy for liking", "insane for liking", "nerdy", "geeky", "uncool"];

export const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
export const PHONE_RE = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/;
export const SSN_RE = /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/;
export const ADDRESS_RE = /\b\d+\s+[A-Za-z\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct)\b/i;

export type Severity = "CRISIS" | "PII" | "CONTROVERSIAL" | "INSULT" | "COACHING" | "NONE";
export const SEVERITY_ORDER: Severity[] = ["CRISIS", "PII", "CONTROVERSIAL", "INSULT", "COACHING", "NONE"];

// Distress severity levels for tiered crisis detection
export type DistressSeverity = "high" | "low" | "none";

// ============= GEN Z SMALL TALK PATTERNS =============
// Patterns for detecting self-introductions
export const INTRODUCTION_PATTERNS = {
  jordanIntro: /\b(i'm jordan|i am jordan|name's jordan|name is jordan)\b/i,
  userIntro: /\b(i'm|i am|my name is|my name's|call me|they call me|people call me)\s+\w+/i,
  casualNameShare: /^(hey,?\s*)?(i'm|im)\s+\w+[.!]?$/i,
};

// Words that acknowledge what someone said (active listening signals)
export const ACKNOWLEDGMENT_WORDS = [
  "cool", "nice", "neat", "awesome", "interesting", "oh", "yeah", "yea",
  "wow", "really", "true", "right", "for sure", "totally", "same",
  "gotcha", "makes sense", "i see", "that's cool", "that's awesome",
  "sounds good", "sounds fun", "sounds like", "ah", "huh", "oh wow"
];

// Minimal deflection patterns (low-effort question-backs)
export const DEFLECTION_PATTERNS = [
  /^you\??$/i,
  /^(what about|how about|and) you\??$/i,
  /^(you|u)\s*(too|2)?\??$/i,
  /^hbu\??$/i,  // "how about you" abbreviation
  /^wbu\??$/i,  // "what about you" abbreviation
  /^same[,.]?\s*(you|u)\??$/i,
];

// Minimal response patterns (under 4 words, no real engagement)
export const MINIMAL_RESPONSE_PATTERNS = [
  /^(cool|nice|neat|awesome|interesting|ok|okay|k|kk|yeah|yea|yep|nope|mhm|lol|lmao|haha|true|facts|bet|word|same|mood|vibes|lit|fire|slaps|based)[.!]*$/i,
  /^(that's|thats)\s*(cool|nice|awesome|dope|lit|fire)[.!]*$/i,
  /^(sounds|seems)\s*(good|cool|fun|nice)[.!]*$/i,
];
