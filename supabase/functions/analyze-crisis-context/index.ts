import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { recentMessages, triggerKeyword, distressMetadata } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Build context from recent messages
    const conversationContext = recentMessages
      .map((msg: any) => `${msg.role === "user" ? "User" : "Jordan"}: ${msg.content}`)
      .join("\n");

    const systemPrompt = `You are a crisis detection system for a social anxiety practice app.

DISTRESS METADATA:
- Detection Tier: ${distressMetadata?.tier || "unknown"} (1 = explicit crisis language, 2 = accumulated ambiguous signals)
- Accumulated Tier 2 Count: ${distressMetadata?.accumulatedTier2Count || 0}
- Matched Keywords: ${distressMetadata?.matchedKeywords?.join(", ") || triggerKeyword}

Your job: Analyze the conversation context and determine the appropriate intervention level:

1. "crisis" - IMMEDIATE intervention needed (show modal):
   - Tier 1 keywords with personal context (not academic)
   - Tier 2 keywords with clear escalation pattern
   - User expressing PERSONAL suicidal ideation about THEMSELVES
   - Active self-harm thoughts or plans
   - Multiple Tier 2 signals showing descending emotional trajectory

2. "coaching" - Gentle coaching tip needed:
   - FIRST mention of heavy/personal topics
   - Single Tier 2 signal without concerning context
   - Academic or intellectual discussion about these topics
   - Vague or indirect language that might indicate distress but isn't explicit

3. "safe" - No intervention needed:
   - Complete false positive (word used in unrelated context)
   - Clearly casual or metaphorical use
   - Tier 2 keyword in positive context (e.g., "I found my inspiration to stay motivated!")

RECENT CONVERSATION:
${conversationContext}

CRITICAL RULES:
- Tier 1 + personal context → likely "crisis"
- Multiple Tier 2 signals → likely "crisis" (user is escalating)
- Single Tier 2 in first message → "coaching" (give gentle warning)
- Context matters: "inspiration to stay" followed by "bye forever" = CRISIS pattern
- Look for emotional trajectory: descending mood = higher risk

Return ONLY a JSON object:
{
  "severity": "crisis" | "coaching" | "safe",
  "reason": "Brief explanation focusing on tier level, accumulation, and emotional trajectory"
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Analyze this conversation and return the severity level." }
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      // Fail safe: assume crisis if LLM fails
      return new Response(
        JSON.stringify({ severity: "crisis", reason: "LLM analysis failed, defaulting to safe" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "";
    
    // Parse the JSON response
    let analysis;
    try {
      // Try to extract JSON from markdown if present
      const jsonMatch = reply.match(/```json\s*(\{[\s\S]*?\})\s*```/) || reply.match(/(\{[\s\S]*?\})/);
      const jsonStr = jsonMatch ? jsonMatch[1] : reply;
      analysis = JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse LLM response:", reply);
      // Default to crisis if we can't parse
      analysis = { severity: "crisis", reason: "Failed to parse LLM response" };
    }

    console.log("Crisis context analysis:", analysis);

    return new Response(
      JSON.stringify(analysis),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in analyze-crisis-context:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    // Fail safe: default to crisis
    return new Response(
      JSON.stringify({ severity: "crisis", reason: "Analysis error, defaulting to safe" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
