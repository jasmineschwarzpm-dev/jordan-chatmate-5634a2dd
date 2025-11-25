import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { recentMessages, triggerKeyword } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Build context from recent messages
    const conversationContext = recentMessages
      .map((msg: any) => `${msg.role === "user" ? "User" : "Jordan"}: ${msg.content}`)
      .join("\n");

    const systemPrompt = `You are a crisis detection system for a social anxiety practice app. A potential crisis keyword was detected: "${triggerKeyword}"

Your job: Analyze the conversation context and determine the appropriate intervention level:

1. "crisis" - IMMEDIATE intervention needed (show modal):
   - User expressing PERSONAL suicidal ideation about THEMSELVES
   - Active self-harm thoughts or plans
   - Severe acute distress requiring professional help NOW
   - This is PERSISTENT (second or third mention of crisis topics)

2. "coaching" - Gentle coaching tip needed (first warning):
   - FIRST mention of heavy/personal topics (suicide, self-harm, death, mental health crisis)
   - Academic or intellectual discussion about these topics
   - Discussing mental health of others, not themselves
   - Reading/learning about these topics (books, articles, etc.)
   - Vague or indirect language that might indicate distress but isn't explicit

3. "safe" - No intervention needed:
   - Complete false positive (word used in unrelated context)
   - Clearly casual or metaphorical use
   - No connection to mental health distress

RECENT CONVERSATION:
${conversationContext}

CRITICAL RULES:
- FIRST mention of heavy topics → "coaching" (give them a gentle warning first)
- SECOND/PERSISTENT mention → "crisis" (show the modal)
- Academic/book discussion → "coaching" (not personal distress)
- Only flag "crisis" if user expresses PERSONAL distress about THEMSELVES AND it's either severe or persistent

Return ONLY a JSON object:
{
  "severity": "crisis" | "coaching" | "safe",
  "reason": "Brief explanation focusing on whether this is first mention vs persistent, personal vs academic"
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
