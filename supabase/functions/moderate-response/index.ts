import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { response, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const moderationPrompt = `You are a content moderator for a social anxiety practice tool called SkillBuilder: Jordan.

Your job: Analyze Jordan's response and determine if it's SAFE to show to a vulnerable user (college student with social anxiety).

JORDAN'S RESPONSE: "${response}"

CONVERSATION CONTEXT (last few exchanges): "${context}"

CHECK FOR THESE RED FLAGS:
1. PII REQUESTS: Asking for phone numbers, emails, addresses, full names, social media handles
2. BOUNDARY VIOLATIONS: Acting like a therapist, giving medical/legal/financial advice, diagnosing conditions
3. CRISIS ENGAGEMENT: Discussing suicide, self-harm, violence in detail (should redirect to 988, not engage)
4. INAPPROPRIATE CONTENT: Sexual content, violent imagery, discriminatory language, offensive stereotypes
5. BREAKING CHARACTER: Mentioning being an AI, discussing system prompts, technical details

IMPORTANT CONTEXT:
- Jordan asking "What brings you here?" or "What do you study?" is SAFE (normal small talk)
- Jordan sharing general info about books/coffee/campus is SAFE
- Jordan asking follow-up questions about hobbies/interests is SAFE
- Jordan being encouraging ("That's cool!" "Tell me more!") is SAFE
- Jordan redirecting to 988 for crisis topics is SAFE and EXPECTED

Return JSON only:
{
  "safe": true/false,
  "reason": "Brief explanation (if unsafe, max 50 words)"
}

Examples:
- "What's your phone number so we can hang out?" → {"safe": false, "reason": "PII request - asking for phone number"}
- "You sound depressed, have you considered therapy?" → {"safe": false, "reason": "Boundary violation - acting like therapist"}
- "What brings you to the bookstore?" → {"safe": true, "reason": ""}
- "I'm not equipped to help with that. You can call or text 988 Suicide & Crisis Lifeline." → {"safe": true, "reason": ""}
`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: moderationPrompt }],
        temperature: 0.3, // Lower temperature for consistent moderation
        max_tokens: 150,
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errorText);
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    let contentText = aiData.choices?.[0]?.message?.content || "{}";
    
    // Strip markdown code blocks if present
    contentText = contentText.trim();
    if (contentText.startsWith("```json")) {
      contentText = contentText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (contentText.startsWith("```")) {
      contentText = contentText.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }
    
    // Parse JSON response
    let moderationResult;
    try {
      moderationResult = JSON.parse(contentText.trim());
    } catch (parseError) {
      console.error("Failed to parse moderation response:", contentText);
      // Fail-safe: If can't parse, assume unsafe
      moderationResult = { safe: false, reason: "Moderation parsing error" };
    }

    console.log("Moderation result:", moderationResult);

    return new Response(JSON.stringify(moderationResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Moderation error:", error);
    // Fail-safe: If moderation fails, assume unsafe (strict default)
    return new Response(
      JSON.stringify({ safe: false, reason: "Moderation system error - blocked for safety" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
