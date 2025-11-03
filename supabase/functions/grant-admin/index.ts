import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    // Verify the requesting user is an admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Determine if any admin already exists
    const { data: existingAdmins } = await supabaseClient
      .from('user_roles')
      .select('id')
      .eq('role', 'admin')
      .limit(1);

    const adminExists = Array.isArray(existingAdmins) && existingAdmins.length > 0;

    // If admins exist, requester must be an admin
    if (adminExists) {
      const { data: adminCheck } = await supabaseClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (!adminCheck) {
        throw new Error('Only admins can grant admin access');
      }
    }

    // Get the email from request body (optional during bootstrap)
    let email: string | undefined = undefined;
    try {
      const body = await req.json();
      email = body?.email;
    } catch (_) {
      // no-op
    }

    let targetUser: { id: string; email?: string | null } | undefined;

    if (adminExists) {
      // Admin path: email is required and can be any existing user
      if (!email) {
        throw new Error('Email is required');
      }
      const { data: userData, error: listError } = await supabaseClient.auth.admin.listUsers();
      if (listError) {
        throw listError;
      }
      const found = userData.users.find(u => u.email === email);
      if (!found) {
        throw new Error('No user with this email has signed up yet');
      }
      targetUser = { id: found.id, email: found.email };
    } else {
      // Bootstrap path: no admins exist yet — requester can grant admin to self only
      if (email && email !== user.email) {
        throw new Error('When bootstrapping, you can only grant admin to yourself');
      }
      targetUser = { id: user.id, email: user.email };
    }

    // Grant admin role
    const { error: roleError } = await supabaseClient
      .from('user_roles')
      .insert({ user_id: targetUser.id, role: 'admin' });

    if (roleError) {
      if (roleError.code === '23505') {
        throw new Error('This user is already an admin');
      }
      throw roleError;
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Admin access granted' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
