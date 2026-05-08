import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

let tokenCache: { value: string; exp: number } | null = null;

async function getIgdbToken(): Promise<string> {
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
    const body = await req.json();
    const { endpoint } = body;

    // ── Steam ──────────────────────────────────────────────────────────────────
    if (endpoint?.startsWith("steam/")) {
      const key = Deno.env.get("STEAM_API_KEY")!;
      const { steamId } = body;
      let url = "";

      if (endpoint === "steam/nowplaying") {
        url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${steamId}`;
      } else if (endpoint === "steam/recentlyplayed") {
        url = `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${key}&steamid=${steamId}&count=10&format=json`;
      } else if (endpoint === "steam/library") {
        url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${steamId}&include_appinfo=true&include_played_free_games=true`;
      } else if (endpoint === "steam/resolve") {
        url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${key}&vanityurl=${steamId}`;
      }

      const res = await fetch(url);
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── RSS proxy ─────────────────────────────────────────────────────────────
    if (endpoint === "rss") {
      const { feedUrl } = body;
      const res = await fetch(feedUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Kortana/1.0)" } });
      const xml = await res.text();
      return new Response(JSON.stringify({ xml }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── ITAD deals ─────────────────────────────────────────────────────────────
    if (endpoint === "itad/deals") {
      const key = Deno.env.get("ITAD_KEY")!;
      const res = await fetch(
        `https://api.isthereanydeal.com/deals/v2?key=${key}&country=US&sort=cut:desc&limit=40`
      );
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── IGDB ───────────────────────────────────────────────────────────────────
    const { query } = body;
    const token = await getIgdbToken();
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
