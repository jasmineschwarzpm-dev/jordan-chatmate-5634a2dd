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

    const systemPrompt = `You are a crisis detection expert for a social anxiety practice app. Analyze the conversation context to determine if the user is expressing personal distress or just discussing a topic academically/casually.

CONTEXT TO ANALYZE:
${conversationContext}

TRIGGERED KEYWORD: "${triggerKeyword}"

Your task: Determine the severity level based on context.

SEVERITY LEVELS:
- "crisis": User is expressing personal suicidal thoughts, self-harm ideation, or immediate distress. Examples:
  * "I want to kill myself"
  * "I don't want to be here anymore"
  * "I'm thinking about ending it"
  
- "coaching": User mentions sensitive topic but in academic/educational context, OR borderline concerning. Examples:
  * "Reading a book about suicide survivors"
  * "I hope to find stories about people who decided to stay" (discussing a book)
  * "My friend attempted suicide last year" (past tense, about someone else)
  
- "safe": Clearly academic, historical, or educational discussion with no personal distress signals.

Return ONLY a JSON object with this structure:
{
  "severity": "crisis" | "coaching" | "safe",
  "reason": "Brief explanation of why you classified it this way"
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
