import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

let tokenCache: { value: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.exp) return tokenCache.value;
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("IGDB_CLIENT_ID")!,
      client_secret: Deno.env.get("IGDB_CLIENT_SECRET")!,
      grant_type: "client_credentials",
    }),
  });
  const { access_token, expires_in } = await res.json();
  tokenCache = { value: access_token, exp: Date.now() + (expires_in - 300) * 1000 };
  return access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { endpoint = "games", query } = await req.json();
    const token = await getToken();
    const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
      method: "POST",
      headers: {
        "Client-ID": Deno.env.get("IGDB_CLIENT_ID")!,
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
      },
      body: query,
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
