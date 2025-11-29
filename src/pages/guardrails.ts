import { supabase } from "@/integrations/supabase/client";
import {
  CRISIS_KEYWORDS, CONTROVERSIAL_KEYWORDS, INSULT_KEYWORDS,
  EMAIL_RE, PHONE_RE, SSN_RE, ADDRESS_RE,
  SEVERITY_ORDER, type Severity
} from "./constants";

export type Trigger = { kind: Severity; reason: string };

/**
 * Lightweight distress pre-screening (Phase 1: Semantic Pre-Screening)
 * Returns true if message contains ANY concerning language that warrants LLM analysis.
 * This is NOT a definitive crisis detector - it's a gate to decide "should we analyze this?"
 * 
 * Includes:
 * - Direct crisis language (suicide, self-harm)
 * - Indirect distress signals (hopeless, giving up, no point)
 * - Common variations and slang
 */
export function detectDistressSignals(text: string): boolean {
  const lowerText = text.toLowerCase();
  
  // High distress signals - warrant immediate LLM analysis
  const highDistressPatterns = [
    // Suicide-related (with variations)
    "suicid", "kill myself", "end it all", "end my life", "ending my life",
    "off myself", "hurt myself", "self-harm", "self harm",
    "want to die", "wanna die", "better off dead",
    
    // Internet slang
    "kms", "kys", "unalive", "unaliving",
    
    // Hopelessness indicators
    "no point", "no reason to", "can't keep going", "can't go on",
    "give up on life", "giving up on life", "no way out", "can't take it",
    "escape this pain", "end my suffering", "end the suffering"
  ];
  
  // Low-medium distress signals - still warrant analysis
  const mediumDistressPatterns = [
    "suicidal thoughts", "suicidal ideation", "thoughts of suicide",
    "hopeless", "no hope", "lost hope", "can't find a reason",
    "tired of living", "don't want to be here", "can't handle this anymore",
    "falling apart", "breaking down", "can't do this", "done with everything"
  ];
  
  // Check all patterns
  const allPatterns = [...highDistressPatterns, ...mediumDistressPatterns];
  return allPatterns.some(pattern => lowerText.includes(pattern));
}

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
