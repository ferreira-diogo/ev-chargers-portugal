import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = request.headers.get("Authorization");

  if (!url || !serviceRole || !authHeader?.startsWith("Bearer ")) {
    return response({ error: "Unauthorized" }, 401);
  }

  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const token = authHeader.slice("Bearer ".length);
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;

  if (userError || !user) return response({ error: "Unauthorized" }, 401);

  try {
    // Explicitly remove application data first, then remove the Auth identity.
    // Every operation is constrained to the authenticated user's immutable ID.
    for (const table of ["station_reviews", "user_route_history", "user_favorites"]) {
      const { error } = await admin.from(table).delete().eq("user_id", user.id);
      if (error) throw new Error("Could not delete account data.");
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw new Error("Could not delete the account.");

    return response({ success: true });
  } catch (error) {
    console.error("delete-my-account:", error);
    return response({ error: "Could not delete the account. Please contact support." }, 500);
  }
});