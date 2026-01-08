import { supabase } from "@/integrations/supabase/client";
import {
  CRISIS_KEYWORDS, TIER_1_CRISIS_KEYWORDS, TIER_2_DISTRESS_KEYWORDS,
  CONTROVERSIAL_KEYWORDS, INSULT_KEYWORDS,
  EMAIL_RE, PHONE_RE, SSN_RE, ADDRESS_RE, STREET_SHARE_RE,
  SEVERITY_ORDER, type Severity, type DistressSeverity
} from "./constants";

export type Trigger = { kind: Severity; reason: string };

/**
 * Three-tiered distress analysis (Manus Research Implementation)
 * 
 * Tier 1: Explicit crisis language → returns 'high' immediately
 * Tier 2: Ambiguous distress + accumulation check → returns 'low' if threshold met
 * Tier 3: Sentiment analysis for Tier 2 (future enhancement)
 * 
 * @param text Current user message
 * @param tier2Count Accumulated Tier 2 signals from conversation history
 * @returns DistressSeverity and whether a Tier 2 keyword was found
 */
export function analyzeDistress(
  text: string, 
  tier2Count: number = 0
): { severity: DistressSeverity; foundTier2: boolean; matchedKeywords: string[] } {
  const lowerText = text.toLowerCase();
  const matchedKeywords: string[] = [];
  
  // TIER 1 CHECK: Explicit crisis language → immediate 'high'
  for (const keyword of TIER_1_CRISIS_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      matchedKeywords.push(keyword);
      return { severity: "high", foundTier2: false, matchedKeywords };
    }
  }
  
  // TIER 2 CHECK: Ambiguous distress signals
  let foundTier2 = false;
  for (const keyword of TIER_2_DISTRESS_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      matchedKeywords.push(keyword);
      foundTier2 = true;
    }
  }
  
  if (foundTier2) {
    // Check accumulation: if this is 2nd+ Tier 2 signal, elevate to 'low'
    const newCount = tier2Count + 1;
    if (newCount >= 2) {
      return { severity: "low", foundTier2: true, matchedKeywords };
    }
    
    // TIER 3 PLACEHOLDER: Sentiment analysis would go here
    // For now, single Tier 2 signal returns 'none' but tracks the signal
    return { severity: "none", foundTier2: true, matchedKeywords };
  }
  
  return { severity: "none", foundTier2: false, matchedKeywords: [] };
}

/**
 * Count Tier 2 signals in conversation history
 */
export function countTier2SignalsInHistory(history: Array<{role: string; content: string}>): number {
  let count = 0;
  for (const turn of history) {
    if (turn.role === "user") {
      const lowerText = turn.content.toLowerCase();
      for (const keyword of TIER_2_DISTRESS_KEYWORDS) {
        if (lowerText.includes(keyword)) {
          count++;
          break; // Only count once per message
        }
      }
    }
  }
  return count;
}

/**
 * DEPRECATED: Use analyzeDistress() instead
 * Kept for backward compatibility
 */
export function detectDistressSignals(text: string): boolean {
  const { severity, foundTier2 } = analyzeDistress(text, 0);
  return severity === "high" || foundTier2;
}

export function detectTriggers(text: string): Trigger[] {
  const t = text.toLowerCase();
  const hits: Trigger[] = [];
  // Crisis
  if (CRISIS_KEYWORDS.some(k => t.includes(k))) hits.push({ kind: "CRISIS", reason: "crisis" });
  // PII
  if (EMAIL_RE.test(text) || PHONE_RE.test(text) || SSN_RE.test(text) || ADDRESS_RE.test(text) || STREET_SHARE_RE.test(text)) {
    hits.push({ kind: "PII", reason: "pii" });
  }
  // Controversial
  if (CONTROVERSIAL_KEYWORDS.some(k => t.includes(k))) hits.push({ kind: "CONTROVERSIAL", reason: "controversial" });
  // Insult/Derogatory
  if (INSULT_KEYWORDS.some(k => t.includes(k))) hits.push({ kind: "INSULT", reason: "insult" });
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

export function shouldTerminateSession(kind: Severity): boolean {
  return kind === "CRISIS";
}

export function coachMessageFor(kind: Severity): string | null {
  switch (kind) {
    case "PII":
      return "Avoid sharing personal contact info with strangers. Keep it general.";
    case "CONTROVERSIAL":
      return "That's a heavy topic for quick small talk. Try a neutral pivot question.";
    case "INSULT":
      return "Saying things that could be interpreted as unkind or insulting when you initially meet someone implies you don't want to talk to them. They don't know you well enough to know if you're kidding.";
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

/**
 * Moderate Jordan's response using LLM-based content moderation
 * @param response Jordan's response to moderate
 * @param context Recent conversation context
 * @param sessionDbId Database ID of the session (for logging)
 * @returns Object with safe status, reason, and final response to show
 */
export async function moderateJordanResponse(
  response: string,
  context: string,
  sessionDbId: string | null
): Promise<{ safe: boolean; reason?: string; finalResponse: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("moderate-response", {
      body: { response, context },
    });

    if (error) {
      console.error("Moderation function error:", error);
      throw error;
    }

    if (!data.safe) {
      console.warn("Response blocked by moderation:", data.reason);
      
      // Log blocked response to moderation_logs (if we have a session ID)
      if (sessionDbId) {
        await supabase.from("moderation_logs").insert({
          session_id: sessionDbId,
          original_response: response,
          block_reason: data.reason || "Unknown reason",
          moderation_details: data,
        });
      }

      return {
        safe: false,
        reason: data.reason,
        finalResponse: "I'm having trouble thinking of what to say. Can you ask me something else?",
      };
    }

    return { safe: true, finalResponse: response };
  } catch (err) {
    console.error("Moderation failed:", err);
    // Fail-safe: Block response if moderation system fails (strict default)
    return {
      safe: false,
      reason: "Moderation system error",
      finalResponse: "Sorry, I'm having technical difficulties. Let's try again!",
    };
  }
}
