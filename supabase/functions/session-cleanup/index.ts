import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionDbId, sessionToken } = await req.json();
    
    if (!sessionDbId || !sessionToken) {
      console.log("Missing sessionDbId or sessionToken");
      return new Response("Missing required fields", { status: 400, headers: corsHeaders });
    }

    console.log(`Cleaning up session: ${sessionDbId}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update session_metadata to mark as abandoned
    const { error: metaError } = await supabase
      .from("session_metadata")
      .update({ completion_status: "abandoned" })
      .eq("session_id", sessionDbId)
      .eq("session_token", sessionToken);

    if (metaError) {
      console.error("Error updating session_metadata:", metaError);
    }

    // Update sessions table with ended_at
    const { error: sessionError } = await supabase
      .from("sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", sessionDbId)
      .eq("session_token", sessionToken);

    if (sessionError) {
      console.error("Error updating sessions:", sessionError);
    }

    console.log(`Session ${sessionDbId} marked as abandoned`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Session cleanup error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
