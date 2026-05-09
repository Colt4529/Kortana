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

    // ── Steam Store public deals ───────────────────────────────────────────────
    if (endpoint === "steam/store-deals") {
      const res = await fetch("https://store.steampowered.com/api/featuredcategories?cc=US&l=en");
      const data: any = await res.json();
      const items: any[] = (data?.specials?.items ?? []).filter((g: any) => g.discount_percent > 0);
      const deals = items.map((g: any) => ({
        title:       g.name ?? "",
        image:       g.header_image ?? g.large_capsule_image ?? "",
        salePrice:   ((g.final_price    ?? 0) / 100).toFixed(2),
        normalPrice: ((g.original_price ?? 0) / 100).toFixed(2),
        cut:         g.discount_percent ?? 0,
        url:         `https://store.steampowered.com/app/${g.steam_appid}`,
        store: "Steam", storeId: "steam", isAtLow: false,
      }));
      return new Response(JSON.stringify(deals), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // ── Epic Games Store public deals ─────────────────────────────────────────
    if (endpoint === "epic/store-deals") {
      const res = await fetch("https://graphql.epicgames.com/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ Catalog { searchStore(category:\"games/edition/base\" count:40 country:\"US\" locale:\"en-US\" onSale:true sortBy:\"effectiveDate\" sortDir:\"DESC\") { elements { title keyImages { type url } price(country:\"US\") { totalPrice { originalPrice discountPrice discount } } catalogNs { mappings { pageSlug pageType } } } } } }" }),
      });
      const data: any = await res.json();
      const elements: any[] = data?.data?.Catalog?.searchStore?.elements ?? [];
      const deals: any[] = [];
      for (const g of elements) {
        const price = g?.price?.totalPrice ?? {};
        if (!price.discount || price.discount <= 0) continue;
        const mappings: any[] = g?.catalogNs?.mappings ?? [];
        const slug = mappings.find((m: any) => m.pageType === "productHome")?.pageSlug ?? "";
        const imgs: any[] = g?.keyImages ?? [];
        const img = imgs.find((i: any) => i.type === "Thumbnail")?.url
                 ?? imgs.find((i: any) => i.type === "DieselStoreFrontWide")?.url
                 ?? imgs[0]?.url ?? "";
        const orig = (price.originalPrice ?? 0) / 100;
        const sale = (price.discountPrice  ?? 0) / 100;
        deals.push({
          title:       g.title ?? "",
          image:       img,
          salePrice:   sale.toFixed(2),
          normalPrice: orig.toFixed(2),
          cut:         orig > 0 ? Math.round((1 - sale / orig) * 100) : 0,
          url:         slug ? `https://store.epicgames.com/en-US/p/${slug}` : "https://store.epicgames.com",
          store: "Epic Games", storeId: "epicgames", isAtLow: false,
        });
      }
      return new Response(JSON.stringify(deals), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // ── Xbox Store public deals ────────────────────────────────────────────────
    if (endpoint === "xbox/store-deals") {
      const recoRes = await fetch(
        "https://reco-public.rec.mp.microsoft.com/channels/Reco/V8.0/Lists/Merchandising/BestDeals?Market=US&Language=en-US&Country=US&ItemTypes=Game&deviceFamily=Windows.Xbox&top=100",
        { headers: { "Accept": "application/json" } }
      );
      const recoData: any = await recoRes.json();
      const ids: string[] = (recoData?.Items ?? []).map((i: any) => String(i.Id ?? "")).filter((id: string) => id.length > 0).slice(0, 50);
      if (!ids.length) return new Response(JSON.stringify([]), { headers: { ...CORS, "Content-Type": "application/json" } });
      const catalogRes = await fetch(
        `https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${ids.join(",")}&Market=US&languages=en-us`,
        { headers: { "Accept": "application/json" } }
      );
      const catalogData: any = await catalogRes.json();
      const deals: any[] = [];
      for (const p of (catalogData?.Products ?? [])) {
        const props = p?.LocalizedProperties?.[0] ?? {};
        const price = p?.DisplaySkuAvailabilities?.[0]?.Availabilities?.[0]?.OrderManagementData?.Price ?? {};
        if (!price.MSRP || !price.ListPrice) continue;
        const cut = Math.round((1 - price.ListPrice / price.MSRP) * 100);
        if (cut <= 0) continue;
        const imgs: any[] = props?.Images ?? [];
        const imgUri = imgs.find((i: any) => i.ImagePurpose === "BoxArt")?.Uri
                    ?? imgs.find((i: any) => i.ImagePurpose === "Poster")?.Uri ?? "";
        deals.push({
          title:       props?.ProductTitle ?? "",
          image:       imgUri ? `https:${imgUri}` : "",
          salePrice:   price.ListPrice.toFixed(2),
          normalPrice: price.MSRP.toFixed(2),
          cut,
          url:         `https://www.xbox.com/en-US/games/store/-/${p.ProductId}`,
          store: "Xbox", storeId: "xboxgames", isAtLow: false,
        });
      }
      return new Response(JSON.stringify(deals), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // ── PSN Store public deals ─────────────────────────────────────────────────
    if (endpoint === "psn/store-deals") {
      const gqlRes = await fetch("https://web.np.playstation.com/api/graphql/v1/op", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          operationName: "categoryGridRetrieve",
          variables: { categoryId: "STORE-MSF75508-PSPRICEDROPS", pageArgs: { size: 100, offset: 0 }, sortBy: { name: "productDiscountPercentage", isAscending: false }, filterBy: [], contextualLogs: [] },
          extensions: { persistedQuery: { version: 1, sha256Hash: "4a1fed4c9f66a02a9f35455a5617c4b87dd49f6286c4abb2ece7ef9a3a5b7faf" } },
        }),
      });
      const gqlData: any = await gqlRes.json();
      const edges: any[] = gqlData?.data?.categoryGridRetrieve?.products?.edges ?? [];
      const deals: any[] = [];
      for (const e of edges) {
        const p = e?.node ?? {};
        const price = p?.price ?? {};
        const base = (price.basePrice ?? 0) / 100;
        const sale = (price.discountedPrice ?? price.basePrice ?? 0) / 100;
        const cut  = price.discountPercentage ?? (base > 0 ? Math.round((1 - sale / base) * 100) : 0);
        if (!cut || cut <= 0) continue;
        const media: any[] = p?.media ?? [];
        deals.push({
          title:       p?.name ?? "",
          image:       media.find((m: any) => m.role === "MASTER")?.url ?? p?.thumbnailUrl ?? "",
          salePrice:   sale.toFixed(2),
          normalPrice: base.toFixed(2),
          cut,
          url:         `https://store.playstation.com/en-us/product/${p?.id ?? ""}`,
          store: "PlayStation", storeId: "psn", isAtLow: false,
        });
      }
      return new Response(JSON.stringify(deals), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // ── Steam personal API ─────────────────────────────────────────────────────
    if (endpoint?.startsWith("steam/")) {
      const key = Deno.env.get("STEAM_API_KEY")!;
      const { steamId } = body;
      let url = "";
      if (endpoint === "steam/nowplaying")          url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${steamId}`;
      else if (endpoint === "steam/recentlyplayed") url = `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${key}&steamid=${steamId}&count=10&format=json`;
      else if (endpoint === "steam/library")        url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${steamId}&include_appinfo=true&include_played_free_games=true`;
      else if (endpoint === "steam/resolve")        url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${key}&vanityurl=${steamId}`;
      const res = await fetch(url);
      const data = await res.json();
      return new Response(JSON.stringify(data), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // ── RSS proxy ─────────────────────────────────────────────────────────────
    if (endpoint === "rss") {
      const res = await fetch(body.feedUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Kortana/1.0)" } });
      return new Response(JSON.stringify({ xml: await res.text() }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // ── ITAD deals ─────────────────────────────────────────────────────────────
    if (endpoint === "itad/deals") {
      const key = Deno.env.get("ITAD_KEY")!;
      const { shops } = body;
      const params = new URLSearchParams({ key, country: "US", sort: "cut:desc", limit: "200" });
      if (shops) params.set("shops", shops);
      const res = await fetch(`https://api.isthereanydeal.com/deals/v2?${params}`);
      const data = await res.json();
      return new Response(JSON.stringify(data), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // ── PSN connect ───────────────────────────────────────────────────────────
    if (endpoint === "psn/connect") {
      const { npsso } = body;
      const CLIENT_ID = "09515159-7237-4370-9b40-3806e67c0891";
      const REDIRECT  = "com.scee.psxandroid.scecompcall://redirect";
      const SCOPE     = "psn:mobile.v2.core psn:clientapp";
      const authRes = await fetch(`https://ca.account.sony.com/api/authz/v3/oauth/authorize?access_type=offline&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=code&scope=${encodeURIComponent(SCOPE)}`, {
        headers: { Cookie: `npsso=${npsso}` }, redirect: "manual",
      });
      const location = authRes.headers.get("location") ?? "";
      const codeMatch = location.match(/[?&]code=([^&]+)/);
      if (!codeMatch) return new Response(JSON.stringify({ error: "Invalid or expired NPSSO token." }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
      const tokenRes = await fetch("https://ca.account.sony.com/api/authz/v3/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${btoa(`${CLIENT_ID}:`)}` },
        body: new URLSearchParams({ code: codeMatch[1], redirect_uri: REDIRECT, grant_type: "authorization_code", token_format: "jwt" }),
      });
      const tokens = await tokenRes.json();
      if (!tokens.access_token) return new Response(JSON.stringify({ error: tokens.error_description ?? "Token exchange failed" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
      const profileRes = await fetch("https://us-prof.np.community.playstation.net/userProfile/v1/users/me/profile2?fields=onlineId,avatarUrls", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      const profileData = await profileRes.json();
      return new Response(JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, onlineId: profileData?.userProfile?.onlineId ?? "", avatarUrl: profileData?.userProfile?.avatarUrls?.[0]?.avatarUrl ?? "" }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // ── PSN games library ─────────────────────────────────────────────────────
    if (endpoint === "psn/games") {
      const { accessToken } = body;
      try {
        const res = await fetch("https://m.np.playstation.com/api/gamelist/v2/users/me/titles?categories=ps4_game,ps5_native_game&limit=200&offset=0", { headers: { Authorization: `Bearer ${accessToken}` } });
        const data = await res.json();
        if (data.titles && !data.error) return new Response(JSON.stringify(data), { headers: { ...CORS, "Content-Type": "application/json" } });
      } catch { /* fall through */ }
      const res = await fetch("https://m.np.playstation.com/api/trophy/v1/users/me/trophyTitles?npLanguage=en&limit=800&offset=0", { headers: { Authorization: `Bearer ${accessToken}` } });
      return new Response(JSON.stringify(await res.json()), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // ── Xbox personal API (OpenXBL) ───────────────────────────────────────────
    if (endpoint?.startsWith("xbox/")) {
      const res = await fetch(`https://xbl.io/api/v2/${endpoint.slice(5)}`, {
        headers: { "X-Authorization": body.xboxKey, "Accept": "application/json", "X-Contract": "1" },
      });
      return new Response(JSON.stringify(await res.json()), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // ── IGDB ──────────────────────────────────────────────────────────────────
    const { query } = body;
    const token = await getIgdbToken();
    const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
      method: "POST",
      headers: { "Client-ID": Deno.env.get("IGDB_CLIENT_ID")!, "Authorization": `Bearer ${token}`, "Accept": "application/json" },
      body: query,
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
