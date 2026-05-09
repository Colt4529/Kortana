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

    // ── Steam Store public deals (no auth) ────────────────────────────────────
    if (endpoint === "steam/store-deals") {
      const res = await fetch(
        "https://store.steampowered.com/api/featuredcategories?cc=US&l=en",
        { headers: { "Accept": "application/json" } }
      );
      const data = await res.json() as any;
      const items: any[] = (data?.specials?.items || []).filter((g: any) => g.discount_percent > 0);
      const deals = items.map((g: any) => ({
        title:       g.name || "",
        image:       g.header_image || g.large_capsule_image || "",
        salePrice:   ((g.final_price   || 0) / 100).toFixed(2),
        normalPrice: ((g.original_price || 0) / 100).toFixed(2),
        cut:         g.discount_percent || 0,
        url:         `https://store.steampowered.com/app/${g.steam_appid}`,
        store:       "Steam",
        storeId:     "steam",
        isAtLow:     false,
      }));
      return new Response(JSON.stringify(deals), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── Epic Games Store public deals (no auth) ────────────────────────────────
    if (endpoint === "epic/store-deals") {
      const gql = JSON.stringify({
        query: `{
          Catalog {
            searchStore(
              category: "games/edition/base"
              count: 40
              country: "US"
              locale: "en-US"
              onSale: true
              sortBy: "effectiveDate"
              sortDir: "DESC"
            ) {
              elements {
                title
                keyImages { type url }
                price(country: "US") {
                  totalPrice { originalPrice discountPrice discount }
                }
                catalogNs { mappings(pageType: "productHome") { pageSlug pageType } }
              }
            }
          }
        }`,
      });
      const res = await fetch("https://graphql.epicgames.com/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: gql,
      });
      const data = await res.json() as any;
      const elements: any[] = data?.data?.Catalog?.searchStore?.elements || [];
      const deals = elements
        .filter((g: any) => (g.price?.totalPrice?.discount ?? 0) > 0)
        .map((g: any) => {
          const price = g.price?.totalPrice;
          const slug  = g.catalogNs?.mappings?.[0]?.pageSlug || "";
          const img   = g.keyImages?.find((i: any) => i.type === "Thumbnail")?.url
                     || g.keyImages?.find((i: any) => i.type === "DieselStoreFrontWide")?.url
                     || g.keyImages?.[0]?.url || "";
          const orig = (price?.originalPrice || 0) / 100;
          const sale = (price?.discountPrice  || 0) / 100;
          const cut  = orig > 0 ? Math.round((1 - sale / orig) * 100) : 0;
          return {
            title:       g.title || "",
            image:       img,
            salePrice:   sale.toFixed(2),
            normalPrice: orig.toFixed(2),
            cut,
            url:         slug ? `https://store.epicgames.com/en-US/p/${slug}` : "https://store.epicgames.com",
            store:       "Epic Games",
            storeId:     "epicgames",
            isAtLow:     false,
          };
        })
        .filter((d: any) => d.cut > 0);
      return new Response(JSON.stringify(deals), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

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

    // ── Xbox Store direct deals ────────────────────────────────────────────────
    if (endpoint === "xbox/store-deals") {
      // Step 1: best-deals IDs from Microsoft public reco API
      const recoRes = await fetch(
        "https://reco-public.rec.mp.microsoft.com/channels/Reco/V8.0/Lists/Merchandising/BestDeals?Market=US&Language=en-US&Country=US&ItemTypes=Game&deviceFamily=Windows.Xbox&top=100",
        { headers: { "Accept": "application/json" } }
      );
      const recoData = await recoRes.json() as any;
      const ids: string[] = (recoData.Items || []).map((i: any) => i.Id).filter(Boolean).slice(0, 50);
      if (!ids.length) {
        return new Response(JSON.stringify([]), { headers: { ...CORS, "Content-Type": "application/json" } });
      }
      // Step 2: fetch product details (price, images) from catalog
      const catalogRes = await fetch(
        `https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${ids.join(",")}&Market=US&languages=en-us`,
        { headers: { "Accept": "application/json" } }
      );
      const catalogData = await catalogRes.json() as any;
      const deals = (catalogData.Products || []).flatMap((p: any) => {
        const props = p.LocalizedProperties?.[0];
        const price = p.DisplaySkuAvailabilities?.[0]?.Availabilities?.[0]?.OrderManagementData?.Price;
        if (!price?.MSRP || !price?.ListPrice) return [];
        const cut = Math.round((1 - price.ListPrice / price.MSRP) * 100);
        if (cut <= 0) return [];
        const imgUri = props?.Images?.find((i: any) => i.ImagePurpose === "BoxArt")?.Uri
                    || props?.Images?.find((i: any) => i.ImagePurpose === "Poster")?.Uri || "";
        return [{
          title:       props?.ProductTitle || "",
          image:       imgUri ? `https:${imgUri}` : "",
          salePrice:   price.ListPrice.toFixed(2),
          normalPrice: price.MSRP.toFixed(2),
          cut,
          url:         `https://www.xbox.com/en-US/games/store/-/${p.ProductId}`,
          store:       "Xbox",
          storeId:     "xboxgames",
          isAtLow:     false,
        }];
      });
      return new Response(JSON.stringify(deals), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── PSN Store direct deals ─────────────────────────────────────────────────
    if (endpoint === "psn/store-deals") {
      // PlayStation Store public GraphQL – categoryGridRetrieve (price-drop page)
      const gqlBody = JSON.stringify({
        operationName: "categoryGridRetrieve",
        variables: {
          categoryId: "STORE-MSF75508-PSPRICEDROPS",
          pageArgs: { size: 100, offset: 0 },
          sortBy: { name: "productDiscountPercentage", isAscending: false },
          filterBy: [],
          contextualLogs: [],
        },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: "4a1fed4c9f66a02a9f35455a5617c4b87dd49f6286c4abb2ece7ef9a3a5b7faf",
          },
        },
      });
      const gqlRes = await fetch("https://web.np.playstation.com/api/graphql/v1/op", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json", "Accept-Language": "en-US" },
        body: gqlBody,
      });
      const gqlData = await gqlRes.json() as any;
      const edges: any[] = gqlData?.data?.categoryGridRetrieve?.products?.edges || [];
      const deals = edges.map((e: any) => {
        const p = e.node;
        const price = p.price || {};
        const base = (price.basePrice || 0) / 100;
        const sale = (price.discountedPrice ?? price.basePrice ?? 0) / 100;
        const cut  = price.discountPercentage ?? (base > 0 ? Math.round((1 - sale / base) * 100) : 0);
        return {
          title:       p.name || "",
          image:       p.media?.find((m: any) => m.role === "MASTER")?.url || p.thumbnailUrl || "",
          salePrice:   sale.toFixed(2),
          normalPrice: base.toFixed(2),
          cut,
          url:         `https://store.playstation.com/en-us/product/${p.id}`,
          store:       "PlayStation",
          storeId:     "psn",
          isAtLow:     false,
        };
      }).filter((d: any) => d.cut > 0);
      return new Response(JSON.stringify(deals), {
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
