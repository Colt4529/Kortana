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
      const { shops } = body; // optional slug: "steam" | "psn" | "xboxgames" | "nintendo" | "epicgames" | "gog"
      const params = new URLSearchParams({ key, country: "US", sort: "cut:desc", limit: "200" });
      if (shops) params.set("shops", shops);
      const res = await fetch(`https://api.isthereanydeal.com/deals/v2?${params}`);
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── PSN: exchange NPSSO → access token + profile ──────────────────────────
    if (endpoint === "psn/connect") {
      const { npsso } = body;
      const CLIENT_ID = "09515159-7237-4370-9b40-3806e67c0891";
      const REDIRECT  = "com.scee.psxandroid.scecompcall://redirect";
      const SCOPE     = "psn:mobile.v2.core psn:clientapp";

      // Step 1: NPSSO → auth code (Sony responds with 302 to custom URI)
      const authUrl = `https://ca.account.sony.com/api/authz/v3/oauth/authorize?access_type=offline&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=code&scope=${encodeURIComponent(SCOPE)}`;
      const authRes = await fetch(authUrl, {
        headers: { Cookie: `npsso=${npsso}` },
        redirect: "manual",
      });
      const location = authRes.headers.get("location") ?? "";
      const codeMatch = location.match(/[?&]code=([^&]+)/);
      if (!codeMatch) {
        return new Response(JSON.stringify({ error: "Invalid or expired NPSSO token. Please get a fresh one from playstation.com." }), {
          status: 401, headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      const code = codeMatch[1];

      // Step 2: code → access token
      const tokenRes = await fetch("https://ca.account.sony.com/api/authz/v3/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${btoa(`${CLIENT_ID}:`)}`,
        },
        body: new URLSearchParams({
          code, redirect_uri: REDIRECT, grant_type: "authorization_code", token_format: "jwt",
        }),
      });
      const tokens = await tokenRes.json();
      if (!tokens.access_token) {
        return new Response(JSON.stringify({ error: tokens.error_description || "Token exchange failed" }), {
          status: 401, headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      // Step 3: fetch PSN profile (onlineId)
      const profileRes = await fetch(
        "https://us-prof.np.community.playstation.net/userProfile/v1/users/me/profile2?fields=onlineId,avatarUrls",
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      const profileData = await profileRes.json();
      const onlineId  = profileData?.userProfile?.onlineId ?? "";
      const avatarUrl = profileData?.userProfile?.avatarUrls?.[0]?.avatarUrl ?? "";

      return new Response(JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        onlineId, avatarUrl,
      }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // ── PSN: played titles with playtime (gamelist API, falls back to trophies) ─
    if (endpoint === "psn/games") {
      const { accessToken } = body;
      // Gamelist API returns playDuration (ISO 8601), lastPlayedDateTime, playCount
      try {
        const res = await fetch(
          "https://m.np.playstation.com/api/gamelist/v2/users/me/titles?categories=ps4_game,ps5_native_game&limit=200&offset=0",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const data = await res.json();
        if (data.titles && !data.error) {
          return new Response(JSON.stringify(data), {
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }
      } catch {}
      // Fall back to trophy titles
      const res = await fetch(
        "https://m.np.playstation.com/api/trophy/v1/users/me/trophyTitles?npLanguage=en&limit=800&offset=0",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── Xbox (OpenXBL proxy) ──────────────────────────────────────────────────
    if (endpoint?.startsWith("xbox/")) {
      const { xboxKey } = body;
      const path = endpoint.slice(5);
      const res = await fetch(`https://xbl.io/api/v2/${path}`, {
        headers: {
          "X-Authorization": xboxKey,
          "Accept": "application/json",
          "X-Contract": "1",
        },
      });
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
