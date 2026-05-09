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
        const items: any[] = (data?.specials?.items ?? []).filter((g: any) => g.discount_percent > 0);
        return ok(items.map((g: any) => ({
          title:       g.name ?? "",
          image:       g.header_image ?? g.large_capsule_image ?? "",
          salePrice:   ((g.final_price    ?? 0) / 100).toFixed(2),
          normalPrice: ((g.original_price ?? 0) / 100).toFixed(2),
          cut:         g.discount_percent ?? 0,
          url:         `https://store.steampowered.com/app/${g.steam_appid}`,
          store: "Steam", storeId: "steam", isAtLow: false,
        })));
      }

      // ── Epic Games Store public deals ────────────────────────────────────────
      if (endpoint === "epic/store-deals") {
        const res = await fetch(
          "https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US",
          { headers: { "User-Agent": "Mozilla/5.0 (compatible; Kortana/1.0)" } }
        );
        const data = await res.json() as any;
        const elements: any[] = data?.data?.Catalog?.searchStore?.elements ?? [];
        const games: any[] = [];
        for (const g of elements) {
          if (!g.title) continue;
          const price = g?.price?.totalPrice ?? {};
          const slug = (g?.catalogNs?.mappings ?? []).find((m: any) => m.pageType === "productHome")?.pageSlug ?? "";
          const imgs: any[] = g?.keyImages ?? [];
          const img = imgs.find((i: any) => i.type === "Thumbnail")?.url
                   ?? imgs.find((i: any) => i.type === "DieselStoreFrontWide")?.url
                   ?? imgs[0]?.url ?? "";
          const orig = (price.originalPrice ?? 0) / 100;
          const sale = (price.discountPrice  ?? 0) / 100;
          games.push({
            title: g.title, image: img,
            salePrice: sale.toFixed(2), normalPrice: orig.toFixed(2),
            cut: orig > 0 ? Math.round((1 - sale / orig) * 100) : 0,
            url: slug ? `https://store.epicgames.com/en-US/p/${slug}` : "https://store.epicgames.com",
            store: "Epic Games", storeId: "epicgames", isAtLow: false,
          });
        }
        return ok(games);
      }

      // ── Xbox Store public deals ──────────────────────────────────────────────
      if (endpoint === "xbox/store-deals") {
        const gpRes = await fetch(
          "https://catalog.gamepass.com/sigls/v2?id=fdd9e2a7-0fee-49f6-ad69-4354098401ff&language=en-us&market=US",
          { headers: { "Accept": "application/json" } }
        );
        const gpData = await gpRes.json() as any;
        const ids: string[] = (Array.isArray(gpData) ? gpData : [])
          .map((i: any) => String(i.id ?? ""))
          .filter((id: string) => id.length > 4)
          .slice(0, 50);
        if (!ids.length) return ok([]);
        const productsRes = await fetch(
          `https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${ids.join(",")}&Market=US&languages=en-us`,
          { headers: { "Accept": "application/json" } }
        );
        const productsData = await productsRes.json() as any;
        const games: any[] = [];
        for (const p of (productsData?.Products ?? [])) {
          const props = p?.LocalizedProperties?.[0] ?? {};
          const title = props?.ProductTitle ?? "";
          if (!title) continue;
          const price = p?.DisplaySkuAvailabilities?.[0]?.Availabilities?.[0]?.OrderManagementData?.Price ?? {};
          const imgs: any[] = props?.Images ?? [];
          const imgUri = imgs.find((i: any) => i.ImagePurpose === "BoxArt")?.Uri
                      ?? imgs.find((i: any) => i.ImagePurpose === "Poster")?.Uri
                      ?? imgs[0]?.Uri ?? "";
          const msrp = price.MSRP ?? 0;
          const list = price.ListPrice ?? msrp;
          const cut  = msrp > 0 ? Math.round((1 - list / msrp) * 100) : 0;
          games.push({
            title, image: imgUri ? `https:${imgUri}` : "",
            salePrice: list.toFixed(2), normalPrice: msrp.toFixed(2), cut,
            url: `https://www.xbox.com/en-US/games/store/-/${p.ProductId}`,
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
            salePrice: "69.99", normalPrice: "69.99", cut: 0,
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
