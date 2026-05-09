export interface Env {
  IGDB_CLIENT_ID: string;
  IGDB_CLIENT_SECRET: string;
  STEAM_API_KEY: string;
  ITAD_KEY: string;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

let tokenCache: { value: string; exp: number } | null = null;

async function getIgdbToken(env: Env): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.exp) return tokenCache.value;
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.IGDB_CLIENT_ID,
      client_secret: env.IGDB_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  const { access_token, expires_in } = await res.json() as any;
  tokenCache = { value: access_token, exp: Date.now() + (expires_in - 300) * 1000 };
  return access_token;
}

const ok = (data: any) => new Response(JSON.stringify(data), { headers: { ...CORS, "Content-Type": "application/json" } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

    try {
      const body = await req.json() as any;
      const { endpoint } = body;

      // ── Steam Store public deals ─────────────────────────────────────────────
      if (endpoint === "steam/store-deals") {
        const res = await fetch("https://store.steampowered.com/api/featuredcategories?cc=US&l=en");
        const data = await res.json() as any;
        // Merge top sellers + specials, deduplicate by appid
        const sellers: any[] = data?.top_sellers?.items ?? [];
        const specials: any[] = (data?.specials?.items ?? []).filter((g: any) => g.discount_percent > 0);
        const seen = new Set<number>();
        const merged: any[] = [];
        for (const g of [...sellers, ...specials]) {
          if (seen.has(g.id ?? g.steam_appid)) continue;
          seen.add(g.id ?? g.steam_appid);
          merged.push(g);
        }
        return ok(merged.slice(0, 40).map((g: any) => ({
          title:       g.name ?? "",
          image:       g.header_image ?? g.large_capsule_image ?? "",
          salePrice:   ((g.final_price    ?? g.discounted_price ?? 0) / 100).toFixed(2),
          normalPrice: ((g.original_price ?? g.final_price ?? 0) / 100).toFixed(2),
          cut:         g.discount_percent ?? 0,
          url:         `https://store.steampowered.com/app/${g.id ?? g.steam_appid}`,
          store: "Steam", storeId: "steam", isAtLow: false,
        })));
      }

      // ── Epic Games Store public deals ────────────────────────────────────────
      if (endpoint === "epic/store-deals") {
        // Use IGDB for top-rated recent PC games (platform 6), link to Epic Store
        const epicTok = await getIgdbToken(env);
        const epicRes = await fetch("https://api.igdb.com/v4/games", {
          method: "POST",
          headers: { "Client-ID": env.IGDB_CLIENT_ID, "Authorization": `Bearer ${epicTok}`, "Accept": "application/json" },
          body: "fields name, cover.url, first_release_date, rating; where platforms = (6) & cover != null & rating >= 80 & first_release_date > 1609459200; sort rating_count desc; limit 30;",
        });
        const epicGames = await epicRes.json() as any;
        const games: any[] = [];
        for (const g of (Array.isArray(epicGames) ? epicGames : [])) {
          if (!g.name) continue;
          const img = (g.cover?.url ?? "").replace("t_thumb", "t_cover_big");
          games.push({
            title: g.name,
            image: img.startsWith("//") ? `https:${img}` : img,
            salePrice: "", normalPrice: "", cut: 0,
            url: `https://store.epicgames.com/en-US/browse?q=${encodeURIComponent(g.name)}&sortBy=relevancy`,
            store: "Epic Games", storeId: "epicgames", isAtLow: false,
          });
        }
        return ok(games);
      }

      // ── Xbox Store public deals ──────────────────────────────────────────────
      if (endpoint === "xbox/store-deals") {
        // Use IGDB for top-rated Xbox Series X games (platform 169)
        const xboxTok = await getIgdbToken(env);
        const xboxRes = await fetch("https://api.igdb.com/v4/games", {
          method: "POST",
          headers: { "Client-ID": env.IGDB_CLIENT_ID, "Authorization": `Bearer ${xboxTok}`, "Accept": "application/json" },
          body: "fields name, cover.url, first_release_date, rating; where platforms = (169) & cover != null & rating >= 70; sort rating_count desc; limit 30;",
        });
        const xboxGames = await xboxRes.json() as any;
        const games: any[] = [];
        for (const g of (Array.isArray(xboxGames) ? xboxGames : [])) {
          if (!g.name) continue;
          const img = (g.cover?.url ?? "").replace("t_thumb", "t_cover_big");
          games.push({
            title: g.name,
            image: img.startsWith("//") ? `https:${img}` : img,
            salePrice: "", normalPrice: "", cut: 0,
            url: `https://www.xbox.com/en-US/Search/Results?q=${encodeURIComponent(g.name)}`,
            store: "Xbox", storeId: "xboxgames", isAtLow: false,
          });
        }
        return ok(games);
      }

      // ── PSN Store public deals ───────────────────────────────────────────────
      if (endpoint === "psn/store-deals") {
        // PSN GraphQL uses persisted-queries-only — falls through to IGDB fallback
        const games: any[] = [];
        // IGDB fallback: recent AAA PS5 games (platform 167)
        const igdbTok = await getIgdbToken(env);
        const igdbRes = await fetch("https://api.igdb.com/v4/games", {
          method: "POST",
          headers: { "Client-ID": env.IGDB_CLIENT_ID, "Authorization": `Bearer ${igdbTok}`, "Accept": "application/json" },
          body: "fields name, cover.url, first_release_date, rating; where platforms = (167) & cover != null & rating >= 75 & first_release_date > 1672531200; sort rating_count desc; limit 30;",
        });
        const igdbGames = await igdbRes.json() as any;
        for (const g of (Array.isArray(igdbGames) ? igdbGames : [])) {
          if (!g.name) continue;
          const img = (g.cover?.url ?? "").replace("t_thumb", "t_cover_big");
          games.push({
            title: g.name,
            image: img.startsWith("//") ? `https:${img}` : img,
            salePrice: "", normalPrice: "", cut: 0,
            url: `https://store.playstation.com/en-us/search/${encodeURIComponent(g.name)}`,
            store: "PlayStation", storeId: "psn", isAtLow: false,
          });
        }
        return ok(games);
      }

      // ── Steam personal API ───────────────────────────────────────────────────
      if (endpoint?.startsWith("steam/")) {
        const key = env.STEAM_API_KEY;
        const { steamId } = body;
        let url = "";
        if (endpoint === "steam/nowplaying")          url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${steamId}`;
        else if (endpoint === "steam/recentlyplayed") url = `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${key}&steamid=${steamId}&count=10&format=json`;
        else if (endpoint === "steam/library")        url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${steamId}&include_appinfo=true&include_played_free_games=true`;
        else if (endpoint === "steam/resolve")        url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${key}&vanityurl=${steamId}`;
        return ok(await (await fetch(url)).json());
      }

      // ── RSS proxy ────────────────────────────────────────────────────────────
      if (endpoint === "rss") {
        const res = await fetch(body.feedUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Kortana/1.0)" } });
        return ok({ xml: await res.text() });
      }

      // ── ITAD deals ───────────────────────────────────────────────────────────
      if (endpoint === "itad/deals") {
        const params = new URLSearchParams({ key: env.ITAD_KEY, country: "US", sort: "cut:desc", limit: "200" });
        if (body.shops) params.set("shops", body.shops);
        return ok(await (await fetch(`https://api.isthereanydeal.com/deals/v2?${params}`)).json());
      }

      // ── PSN connect (NPSSO → token) ──────────────────────────────────────────
      if (endpoint === "psn/connect") {
        const { npsso } = body;
        const CLIENT_ID = "09515159-7237-4370-9b40-3806e67c0891";
        const REDIRECT  = "com.scee.psxandroid.scecompcall://redirect";
        const SCOPE     = "psn:mobile.v2.core psn:clientapp";
        const authRes = await fetch(`https://ca.account.sony.com/api/authz/v3/oauth/authorize?access_type=offline&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=code&scope=${encodeURIComponent(SCOPE)}`, {
          headers: { Cookie: `npsso=${npsso}` }, redirect: "manual",
        });
        const codeMatch = (authRes.headers.get("location") ?? "").match(/[?&]code=([^&]+)/);
        if (!codeMatch) return new Response(JSON.stringify({ error: "Invalid or expired NPSSO token." }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
        const tokenRes = await fetch("https://ca.account.sony.com/api/authz/v3/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${btoa(`${CLIENT_ID}:`)}` },
          body: new URLSearchParams({ code: codeMatch[1], redirect_uri: REDIRECT, grant_type: "authorization_code", token_format: "jwt" }),
        });
        const tokens = await tokenRes.json() as any;
        if (!tokens.access_token) return new Response(JSON.stringify({ error: tokens.error_description ?? "Token exchange failed" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
        const profileRes = await fetch("https://us-prof.np.community.playstation.net/userProfile/v1/users/me/profile2?fields=onlineId,avatarUrls", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
        const profileData = await profileRes.json() as any;
        return ok({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, onlineId: profileData?.userProfile?.onlineId ?? "", avatarUrl: profileData?.userProfile?.avatarUrls?.[0]?.avatarUrl ?? "" });
      }

      // ── PSN games library ────────────────────────────────────────────────────
      if (endpoint === "psn/games") {
        const { accessToken } = body;
        try {
          const res = await fetch("https://m.np.playstation.com/api/gamelist/v2/users/me/titles?categories=ps4_game,ps5_native_game&limit=200&offset=0", { headers: { Authorization: `Bearer ${accessToken}` } });
          const data = await res.json() as any;
          if (data.titles && !data.error) return ok(data);
        } catch { /* fall through */ }
        return ok(await (await fetch("https://m.np.playstation.com/api/trophy/v1/users/me/trophyTitles?npLanguage=en&limit=800&offset=0", { headers: { Authorization: `Bearer ${accessToken}` } })).json());
      }

      // ── Xbox personal API (OpenXBL) ──────────────────────────────────────────
      if (endpoint?.startsWith("xbox/")) {
        return ok(await (await fetch(`https://xbl.io/api/v2/${endpoint.slice(5)}`, {
          headers: { "X-Authorization": body.xboxKey, "Accept": "application/json", "X-Contract": "1" },
        })).json());
      }

      // ── IGDB ─────────────────────────────────────────────────────────────────
      const token = await getIgdbToken(env);
      const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
        method: "POST",
        headers: { "Client-ID": env.IGDB_CLIENT_ID, "Authorization": `Bearer ${token}`, "Accept": "application/json" },
        body: body.query,
      });
      return ok(await res.json());

    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }
  },
};
