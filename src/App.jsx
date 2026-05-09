import { useState, useEffect, useRef } from "react";
import { supabase, upsertGameLog } from "./supabaseClient";

const C = {
  bg:      "#0a0a0a",
  surface: "#111111",
  border:  "#1e1e1e",
  text:    "#ffffff",
  muted:   "#888888",
  faint:   "#1a1a1a",
  blue:    "#2255CC",
  pink:    "#CC3377",
  yellow:  "#FAC000",
  green:   "#00A850",
};

const STRIPES = ["#2255CC","#CC3377","#FAC000","#00A850"];
const SC = { "played":C.green, "playing":C.blue, "want to play":C.yellow, "dropped":C.muted };
const GENRES     = ["All","RPG","Action","Roguelike","Platformer","Metroidvania","Strategy","Horror","Sports","Adventure"];
const PUBLISHERS = ["All","Bandai Namco","Supergiant","Team Cherry","ZA/UM","Extremely OK","Activision","Motion Twin","Nintendo"];
const IGDB_PROXY    = "https://kortana-proxy.coltenhorn05.workers.dev";
const SUPABASE_ANON = "sb_publishable_pq-vcpw-vvbcj6v-VBwYCw_XXI_dydj";

const PROXY_HEADERS = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${SUPABASE_ANON}`,
};

async function igdb(endpoint, query) {
  const res = await fetch(IGDB_PROXY, {
    method: "POST",
    headers: PROXY_HEADERS,
    body: JSON.stringify({ endpoint, query }),
  });
  if (!res.ok) throw new Error(`IGDB ${res.status}`);
  return res.json();
}

async function steamApi(type, steamId) {
  const res = await fetch(IGDB_PROXY, {
    method: "POST",
    headers: PROXY_HEADERS,
    body: JSON.stringify({ endpoint: `steam/${type}`, steamId }),
  });
  if (!res.ok) throw new Error(`Steam ${res.status}`);
  return res.json();
}

async function psnConnect(npsso) {
  const res = await fetch(IGDB_PROXY, {
    method: "POST", headers: PROXY_HEADERS,
    body: JSON.stringify({ endpoint: "psn/connect", npsso }),
  });
  return res.json();
}

async function psnGetGames(accessToken) {
  const res = await fetch(IGDB_PROXY, {
    method: "POST", headers: PROXY_HEADERS,
    body: JSON.stringify({ endpoint: "psn/games", accessToken }),
  });
  return res.json();
}

async function xboxApi(path, xboxKey) {
  const res = await fetch(IGDB_PROXY, {
    method: "POST", headers: PROXY_HEADERS,
    body: JSON.stringify({ endpoint: `xbox/${path}`, xboxKey }),
  });
  return res.json();
}

function parseSteamInput(raw) {
  const s = raw.trim();
  if (/^\d{17}$/.test(s)) return { type: "id", value: s };
  const direct = s.match(/steamcommunity\.com\/profiles\/(\d{17})/);
  if (direct) return { type: "id", value: direct[1] };
  const vanity = s.match(/steamcommunity\.com\/id\/([^\/\?&#]+)/);
  if (vanity) return { type: "vanity", value: vanity[1] };
  if (s.length > 0 && !/\s/.test(s) && !s.includes(".")) return { type: "vanity", value: s };
  return null;
}

function igdbImg(imageId, size = "cover_big_2x") {
  return imageId ? `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg` : "";
}
function steamCover(appId) {
  return appId ? `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg` : "";
}
function steamHero(appId) {
  return appId ? `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg` : "";
}

function getIgdbCover(raw) {
  // Always use official IGDB box art as cover (portrait)
  const cover = igdbImg(raw.cover?.image_id, "cover_big_2x");
  // Hero: prefer high-res artworks → screenshots → fall back to cover
  const artId = raw.artworks?.[0]?.image_id;
  const ssId  = raw.screenshots?.[0]?.image_id;
  const hero  = artId ? igdbImg(artId, "1080p")
              : ssId  ? igdbImg(ssId,  "1080p")
              : igdbImg(raw.cover?.image_id, "screenshot_big");
  const steamEntry = (raw.external_games || []).find(e => e.category === 1);
  return { cover, hero, steamId: steamEntry?.uid || null };
}

function normalizeIgdbGame(raw) {
  const { cover, hero, steamId } = getIgdbCover(raw);
  const devCo = (raw.involved_companies || []).find(c => c.developer);
  const pubCo = (raw.involved_companies || []).find(c => c.publisher);
  return {
    id: raw.id,
    title: raw.name,
    cover, hero, steamId,
    year: raw.first_release_date ? new Date(raw.first_release_date * 1000).getFullYear() : null,
    developer: devCo?.company?.name || "Unknown",
    publisher: pubCo?.company?.name || "Unknown",
    desc: raw.summary || "No description available.",
    rating: raw.rating ? Math.round(raw.rating / 20) : 0,
    metacritic: raw.aggregated_rating ? Math.round(raw.aggregated_rating) : 0,
    genre: raw.genres?.[0]?.name || "Unknown",
    status: "", goty: false, tagline: "", playtime: 0, review: "",
  };
}

function relTime(date) {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60)      return "just now";
  if (secs < 3600)    return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400)   return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 2592000) return `${Math.floor(secs / 86400)}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const YEAR_OPTS = [
  { label:"All Time", value:null  },
  { label:"2020+",    value:2020  },
  { label:"2015+",    value:2015  },
  { label:"2010+",    value:2010  },
  { label:"2000+",    value:2000  },
];

function StripeBar({ height=3, style }) {
  return (
    <div style={{ display:"flex", overflow:"hidden", ...style }}>
      {STRIPES.map((c,i)=><div key={i} style={{ flex:1, height, background:c }} />)}
    </div>
  );
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
function AuthScreen() {
  const [mode, setMode]           = useState("sign-in");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [loading, setLoading]     = useState(false);
  const [message, setMessage]     = useState("");
  const [sentTo, setSentTo]       = useState("");  // non-empty = show email-sent screen

  const switchMode = m => { setMode(m); setMessage(""); setConfirm(""); setSentTo(""); };

  const submit = async () => {
    setMessage("");
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) { setMessage("Enter both email and password."); return; }
    if (mode === "sign-up") {
      if (password.length < 6) { setMessage("Password must be at least 6 characters."); return; }
      if (password !== confirm) { setMessage("Passwords don't match."); return; }
    }
    setLoading(true);
    if (mode === "sign-in") {
      const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
      if (error) setMessage(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email: trimmedEmail, password, options: { emailRedirectTo: window.location.origin } });
      if (error) { setMessage(error.message); }
      else { setSentTo(trimmedEmail); }
    }
    setLoading(false);
  };

  const onKey = e => { if (e.key === "Enter") submit(); };

  const inp = {
    width:"100%", background:"transparent",
    border:"none", borderBottom:`0.5px solid ${C.border}`,
    padding:"14px 0", color:C.text, fontSize:16, outline:"none",
    boxSizing:"border-box", letterSpacing:"0.01em",
  };

  const mismatch = mode === "sign-up" && confirm.length > 0 && password !== confirm;
  const matched  = mode === "sign-up" && confirm.length > 0 && password === confirm;

  if (sentTo) return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"0 32px" }}>
      <div style={{ width:"100%", maxWidth:340, textAlign:"center" }}>
        <div style={{ fontSize:52, marginBottom:20 }}>📬</div>
        <div style={{ fontSize:22, fontWeight:600, letterSpacing:"-0.5px", marginBottom:10 }}>Check your inbox</div>
        <div style={{ fontSize:14, color:"#555", lineHeight:1.6, marginBottom:8 }}>
          We sent a confirmation link to
        </div>
        <div style={{ fontSize:14, fontWeight:600, color:C.blue, marginBottom:28 }}>{sentTo}</div>
        <div style={{ fontSize:13, color:"#444", lineHeight:1.6, marginBottom:36 }}>
          Click the link in that email to verify your account — you only need to do this once. After confirming, come back here to sign in.
        </div>
        <button onClick={() => switchMode("sign-in")} style={{
          width:"100%", padding:"15px 0", borderRadius:10, border:"none",
          background:C.blue, color:"#fff", fontWeight:500, fontSize:15,
          cursor:"pointer", letterSpacing:"0.04em",
        }}>
          Go to Sign In →
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"0 32px" }}>
      <div style={{ width:"100%", maxWidth:340 }}>

        {/* Logo mark */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", marginBottom:48 }}>
          <svg width="72" height="72" viewBox="0 0 110 110" fill="none" style={{ marginBottom:20 }}>
            <path d="M16 10 L16 100 L34 100 L34 62 L68 100 L92 100 L54 55 L90 10 L66 10 L34 46 L34 10 Z" fill="none" stroke="#2255CC" strokeWidth="5"/>
            <path d="M90 10 L54 55" stroke="#CC3377" strokeWidth="5" fill="none"/>
            <path d="M34 62 L68 100 L92 100" stroke="#FAC000" strokeWidth="5" fill="none"/>
            <path d="M54 55 L92 100" stroke="#00A850" strokeWidth="5" fill="none"/>
          </svg>
          <div style={{ fontSize:32, fontWeight:500, letterSpacing:"-1px", color:C.text, lineHeight:1 }}>Kortana</div>
          <div style={{ fontSize:13, color:"#444", marginTop:8, letterSpacing:"0.02em" }}>Your gaming life, all in one place.</div>
        </div>

        {/* Mode toggle */}
        <div style={{ display:"flex", gap:0, marginBottom:36, background:C.faint, borderRadius:10, padding:3 }}>
          {[["sign-in","Sign In"],["sign-up","Sign Up"]].map(([m,l])=>(
            <button key={m} onClick={()=>switchMode(m)} style={{
              flex:1, padding:"10px 0", borderRadius:8, border:"none", cursor:"pointer",
              background: mode===m ? C.surface : "transparent",
              color: mode===m ? C.text : C.muted,
              fontWeight:500, fontSize:14, transition:"all .2s",
              boxShadow: mode===m ? "0 1px 4px rgba(0,0,0,.4)" : "none",
            }}>{l}</button>
          ))}
        </div>

        {/* Inputs */}
        <div style={{ marginBottom:28 }}>
          <input
            value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={onKey}
            placeholder="Email" type="email" autoComplete="email"
            style={inp}
          />
          <input
            type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={onKey}
            placeholder="Password" autoComplete={mode==="sign-in"?"current-password":"new-password"}
            style={{ ...inp, marginTop:6 }}
          />
          {mode === "sign-up" && (
            <div style={{ position:"relative" }}>
              <input
                type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} onKeyDown={onKey}
                placeholder="Confirm password" autoComplete="new-password"
                style={{ ...inp, marginTop:6, borderBottomColor: mismatch ? C.pink : matched ? C.green : C.border }}
              />
              {matched  && <span style={{ position:"absolute", right:0, top:"50%", transform:"translateY(-50%)", color:C.green, fontSize:16 }}>✓</span>}
              {mismatch && <span style={{ position:"absolute", right:0, top:"50%", transform:"translateY(-50%)", color:C.pink,  fontSize:13 }}>✗</span>}
            </div>
          )}
        </div>

        {/* Error / success */}
        {message && (
          <div style={{ fontSize:13, color: message.startsWith("Check") ? C.green : C.pink, marginBottom:20, lineHeight:1.5 }}>{message}</div>
        )}

        {/* CTA */}
        <button onClick={submit} disabled={loading || (mode==="sign-up" && mismatch)} style={{
          width:"100%", padding:"15px 0", borderRadius:10, border:"none",
          background: loading || (mode==="sign-up" && mismatch) ? C.faint : C.pink,
          color: loading || (mode==="sign-up" && mismatch) ? C.muted : "#fff",
          fontWeight:500, fontSize:15, cursor: loading || (mode==="sign-up" && mismatch) ? "default" : "pointer",
          letterSpacing:"0.04em", transition:"background .2s",
        }}>
          {loading ? "Working…" : mode==="sign-in" ? "Sign In" : "Create Account"}
        </button>

        {/* Swap mode */}
        <div style={{ textAlign:"center", marginTop:28 }}>
          <span style={{ fontSize:13, color:"#444" }}>{mode==="sign-in" ? "Don't have an account? " : "Already have an account? "}</span>
          <button onClick={()=>switchMode(mode==="sign-in"?"sign-up":"sign-in")} style={{ background:"none", border:"none", color:C.blue, fontSize:13, cursor:"pointer", fontWeight:500, padding:0 }}>
            {mode==="sign-in" ? "Sign up" : "Sign in"}
          </button>
        </div>

      </div>
    </div>
  );
}

const INIT_GAMES = [];
const INIT_LISTS = [];

// ── SHARED ────────────────────────────────────────────────────────────────────
function Img({ src, style }) {
  const [ok, setOk] = useState(true);
  return ok
    ? <img src={src} style={{ ...style, objectFit:"cover" }} onError={()=>setOk(false)} alt="" />
    : <div style={{ ...style, background:C.faint }} />;
}

function Stars({ value, onChange, size=28 }) {
  const [hov, setHov] = useState(0);
  const lit = hov || value;
  return (
    <div style={{ display:"flex" }}>
      {[1,2,3,4,5].map(n=>(
        <button key={n}
          onMouseEnter={()=>onChange&&setHov(n)} onMouseLeave={()=>onChange&&setHov(0)}
          onClick={()=>onChange?.(n)}
          style={{ background:"none", border:"none", padding:`${size*.1}px ${size*.06}px`, fontSize:`${size}px`, lineHeight:1,
            cursor:onChange?"pointer":"default", color:lit>=n?C.yellow:C.faint,
            transition:"color .1s, transform .1s", transform:hov===n&&onChange?"scale(1.25)":"scale(1)" }}>★</button>
      ))}
    </div>
  );
}

function Pills({ items, active, onSelect }) {
  return (
    <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:2 }}>
      {items.map(item=>(
        <button key={item} onClick={()=>onSelect(item)} style={{
          flexShrink:0, padding:"6px 16px", borderRadius:20,
          border:`0.5px solid ${item===active ? C.blue : C.border}`,
          cursor:"pointer", fontSize:11, fontWeight:500, letterSpacing:"1.5px", textTransform:"uppercase",
          background: item===active ? C.blue : "transparent",
          color: item===active ? "#fff" : C.muted, transition:"all .15s",
        }}>{item}</button>
      ))}
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ padding:"32px clamp(18px,5vw,48px) 0" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:"clamp(14px,3vh,20px)" }}>
        <span style={{ fontSize:10, fontWeight:500, letterSpacing:"2px", color:"#444", textTransform:"uppercase", flexShrink:0 }}>{label}</span>
        <div style={{ flex:1, height:"0.5px", background:C.border }} />
      </div>
      {children}
    </div>
  );
}

function PosterCard({ game, onClick }) {
  return (
    <div onClick={()=>onClick?.(game)} style={{
      position:"relative", aspectRatio:"16/9", borderRadius:8, overflow:"hidden", cursor:"pointer",
      boxShadow:"0 4px 20px rgba(0,0,0,.6)", transition:"transform 0.2s ease",
    }}>
      <Img src={game.hero || game.cover} style={{ width:"100%", height:"100%" }} />
      <div style={{ position:"absolute", inset:0, background:"linear-gradient(to top, rgba(10,10,10,.92) 0%, transparent 60%)" }} />
      <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"clamp(8px,2vw,12px)" }}>
        <div style={{ fontSize:"clamp(10px,1.5vw,12px)", fontWeight:500, color:C.text, lineHeight:1.3, marginBottom:2 }}>{game.title}</div>
        <div style={{ fontSize:9, color:"#555", marginBottom:3 }}>{game.year}{game.developer&&game.developer!=="Unknown"?` · ${game.developer}`:""}</div>
        <Stars value={game.rating} size={9} />
      </div>
      {game.goty && (
        <div style={{ position:"absolute", top:8, right:8, background:C.yellow, borderRadius:4, padding:"2px 6px", fontSize:8, fontWeight:500, color:"#000", letterSpacing:"1px", textTransform:"uppercase" }}>GOTY</div>
      )}
      <div style={{ position:"absolute", top:8, left:8, width:6, height:6, borderRadius:"50%", background:SC[game.status]||C.muted }} />
    </div>
  );
}

function DiaryRow({ game, onClick, index=0 }) {
  return (
    <div onClick={()=>onClick?.(game)}
      style={{ display:"flex", gap:"clamp(10px,2vw,14px)", padding:"clamp(12px,2vh,16px) 0", borderBottom:`0.5px solid ${C.border}`, cursor:"pointer", animation:`fadeUp .3s ${Math.min(index,8)*.04}s both` }}>
      <div style={{ width:44, height:44, borderRadius:6, overflow:"hidden", flexShrink:0, boxShadow:"0 2px 10px rgba(0,0,0,.5)" }}>
        <Img src={game.cover} style={{ width:"100%", height:"100%" }} />
      </div>
      <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", justifyContent:"center", gap:3 }}>
        <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}>
          <span style={{ fontSize:"clamp(13px,2.5vw,15px)", fontWeight:500, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{game.title}</span>
          {game.goty && <span style={{ background:"rgba(250,192,0,.09)", border:`0.5px solid rgba(250,192,0,.25)`, borderRadius:4, padding:"1px 6px", fontSize:8, fontWeight:500, color:C.yellow, flexShrink:0, letterSpacing:"1px", textTransform:"uppercase" }}>GOTY</span>}
        </div>
        <div style={{ fontSize:10, color:"#444" }}>
          {game.year}{game.developer&&game.developer!=="Unknown"?` · ${game.developer}`:""}
        </div>
        <Stars value={game.rating} size={11} />
        {game.review ? <div style={{ fontSize:11, fontStyle:"italic", color:C.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{game.review}</div> : null}
      </div>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", justifyContent:"center", flexShrink:0 }}>
        <span style={{ fontSize:10, fontWeight:500, color:SC[game.status]||C.muted, letterSpacing:"1px", textTransform:"uppercase" }}>{game.status}</span>
      </div>
    </div>
  );
}

function Empty({ label }) {
  return (
    <div style={{ textAlign:"center", padding:"70px 0" }}>
      <div style={{ fontSize:11, fontWeight:500, color:"#444", letterSpacing:"2px", textTransform:"uppercase" }}>{label}</div>
    </div>
  );
}

function useWindowWidth() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 900);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

// ── LOG SHEET ─────────────────────────────────────────────────────────────────
function LogSheet({ game, onClose, onSave, user }) {
  const [form, setForm] = useState({
    rating: game.rating, status: game.status,
    review: game.review||"", liked: game.liked||false, goty: game.goty||false,
  });

  const iSt = { width:"100%", background:C.faint, border:`0.5px solid ${C.border}`, borderRadius:8, padding:"11px 14px", color:C.text, fontSize:14, outline:"none", boxSizing:"border-box" };

  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.85)", zIndex:300, display:"flex", alignItems:"flex-end", justifyContent:"center", backdropFilter:"blur(12px)" }}>
      <div style={{ background:C.surface, borderRadius:"16px 16px 0 0", width:"100%", maxWidth:440, paddingBottom:40,
        border:`0.5px solid ${C.border}`, borderBottom:"none", animation:"slideUp .22s ease", overflow:"hidden" }}>
        <StripeBar height={3} />
        <div style={{ display:"flex", justifyContent:"center", padding:"14px 0 6px" }}>
          <div style={{ width:36, height:3, borderRadius:2, background:C.border }} />
        </div>
        <div style={{ textAlign:"center", padding:"4px 20px 18px" }}>
          <div style={{ fontSize:17, fontWeight:500, letterSpacing:"-0.3px" }}>{game.title}</div>
          <div style={{ fontSize:12, color:C.muted, marginTop:3 }}>{game.year} · {game.developer}</div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", borderTop:`0.5px solid ${C.border}`, borderBottom:`0.5px solid ${C.border}` }}>
          {[["Played","played",C.green],["Liked","liked",C.pink],["Backlog","want to play",C.yellow]].map(([label,val,col])=>{
            const active = val==="liked" ? form.liked : form.status===val;
            return (
              <button key={val} onClick={()=>val==="liked"?setForm({...form,liked:!form.liked}):setForm({...form,status:val})}
                style={{ background:"none", border:"none", padding:"20px 8px", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center" }}>
                <div style={{ width:28, height:28, borderRadius:"50%", marginBottom:8, background: active ? col : C.faint, border:`0.5px solid ${active ? col : C.border}`, transition:"all .15s" }} />
                <span style={{ fontSize:10, fontWeight:500, color:active?col:C.muted, letterSpacing:"1.5px", textTransform:"uppercase", transition:"color .15s" }}>{label}</span>
              </button>
            );
          })}
        </div>

        <div style={{ padding:"18px 20px 16px", borderBottom:`0.5px solid ${C.border}`, textAlign:"center" }}>
          <div style={{ fontSize:10, color:"#444", letterSpacing:"2px", textTransform:"uppercase", marginBottom:12 }}>Rate</div>
          <div style={{ display:"flex", justifyContent:"center" }}>
            <Stars value={form.rating} onChange={r=>setForm({...form,rating:r})} size={36} />
          </div>
        </div>

        <div style={{ padding:"16px 20px", borderBottom:`0.5px solid ${C.border}` }}>
          <div style={{ fontSize:10, color:"#444", letterSpacing:"2px", textTransform:"uppercase", marginBottom:12 }}>Status</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {["played","playing","want to play","dropped"].map(s=>(
              <button key={s} onClick={()=>setForm({...form,status:s})} style={{
                padding:"11px 8px", borderRadius:8, cursor:"pointer", fontWeight:500, fontSize:11, textTransform:"uppercase", letterSpacing:"1px",
                border:`0.5px solid ${form.status===s ? SC[s] : C.border}`,
                background:"transparent", color: form.status===s ? SC[s] : C.muted, transition:"all .15s",
              }}>{s}</button>
            ))}
          </div>
        </div>

        <div style={{ padding:"16px 20px", borderBottom:`0.5px solid ${C.border}` }}>
          <textarea value={form.review} onChange={e=>setForm({...form,review:e.target.value})}
            placeholder="Write a review…" rows={3}
            style={{ ...iSt, fontStyle:"italic", resize:"none", lineHeight:1.65, fontFamily:"Georgia,serif" }} />
        </div>

        <div style={{ padding:"14px 20px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontSize:13, color:C.muted }}>Game of the Year</span>
          <button onClick={()=>setForm({...form,goty:!form.goty})}
            style={{ width:44, height:24, borderRadius:12, border:"none", cursor:"pointer", position:"relative", transition:"background .2s", background:form.goty?C.yellow:C.border }}>
            <div style={{ position:"absolute", top:2, left:form.goty?22:2, width:20, height:20, borderRadius:"50%", background:"#fff", transition:"left .2s", boxShadow:"0 1px 4px rgba(0,0,0,.5)" }} />
          </button>
        </div>

        <div style={{ padding:"0 20px" }}>
          <button onClick={()=>onSave({...game,...form})} style={{
            width:"100%", padding:15, borderRadius:8, border:"none",
            background:C.pink, color:"#fff", fontSize:14, fontWeight:500, cursor:"pointer", letterSpacing:"1.5px", textTransform:"uppercase",
          }}>{user ? "Save & Sync" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

// ── GAME DETAIL ───────────────────────────────────────────────────────────────
function GameDetail({ game, onBack, onUpdate, onLogSaved, user }) {
  const [sheet, setSheet] = useState(false);

  const saveAndSyncLog = async (g) => {
    onUpdate(g);
    if (!user) return;
    const log = {
      user_id: user.id, game_id: String(g.id), title: g.title, cover: g.cover,
      developer: g.developer, publisher: g.publisher, year: g.year,
      status: g.status, rating: g.rating, review: g.review,
    };
    const { error } = await upsertGameLog(log);
    if (error) console.error("Failed to save game log:", error);
    else onLogSaved?.(log);
  };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text }}>
      <div style={{ position:"relative", height:"clamp(265px,50vh,520px)", overflow:"hidden" }}>
        <Img src={game.hero} style={{ width:"100%", height:"100%", filter:"brightness(.3) saturate(.6)" }} />
        <div style={{ position:"absolute", inset:0, background:`linear-gradient(to bottom, rgba(10,10,10,.05) 0%, ${C.bg} 100%)` }} />
        <StripeBar height={3} style={{ position:"absolute", top:0, left:0, right:0 }} />
        <button onClick={onBack} style={{ position:"absolute", top:"clamp(54px,10vh,84px)", left:"clamp(16px,3vw,32px)", background:"rgba(10,10,10,.75)", border:`0.5px solid ${C.border}`, color:C.text, width:34, height:34, borderRadius:8, fontSize:18, cursor:"pointer", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
      </div>

      <div style={{ display:"flex", gap:"clamp(16px,3vw,24px)", padding:"0 clamp(18px,5vw,48px)", marginTop:"-clamp(60px,12vh,100px)", position:"relative", zIndex:2 }}>
        <div style={{ width:"clamp(80px,15vw,130px)", height:"clamp(105px,22vw,175px)", borderRadius:8, overflow:"hidden", flexShrink:0, boxShadow:"0 14px 44px rgba(0,0,0,.9)" }}>
          <Img src={game.cover} style={{ width:"100%", height:"100%" }} />
        </div>
        <div style={{ paddingTop:"clamp(60px,15vh,100px)" }}>
          <div style={{ fontSize:"clamp(22px,5vw,36px)", fontWeight:500, lineHeight:1.1, letterSpacing:"-0.5px" }}>{game.title}</div>
          <div style={{ fontSize:13, color:C.muted, marginTop:6 }}>{game.year}</div>
          {game.rating>0 && <div style={{ marginTop:10 }}><Stars value={game.rating} size={18} /></div>}
        </div>
      </div>

      <div style={{ padding:"clamp(26px,5vh,40px) clamp(18px,5vw,48px) 0" }}>
        {game.tagline && <div style={{ fontSize:10, fontWeight:500, color:"#444", letterSpacing:"2px", textTransform:"uppercase", marginBottom:"clamp(22px,4vh,32px)" }}>{game.tagline}</div>}

        <div style={{ marginBottom:"clamp(24px,4vh,36px)" }}>
          <div style={{ fontSize:10, color:"#444", letterSpacing:"2px", textTransform:"uppercase", marginBottom:8 }}>Developed by</div>
          <div style={{ fontSize:"clamp(24px,5vw,40px)", fontWeight:500, letterSpacing:"-0.5px", lineHeight:1 }}>{game.developer}</div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(130px,1fr))", gap:"clamp(10px,2vw,14px)", marginBottom:"clamp(22px,4vh,32px)", padding:"clamp(16px,3vw,22px)", background:C.surface, borderRadius:12, border:`0.5px solid ${C.border}` }}>
          {[["Published by",game.publisher],["Genre",game.genre],["Release year",String(game.year)],["Your playtime",game.playtime>0?`${game.playtime} hrs`:"—"]].map(([l,v])=>(
            <div key={l}>
              <div style={{ fontSize:10, color:"#444", letterSpacing:"2px", textTransform:"uppercase", marginBottom:4 }}>{l}</div>
              <div style={{ fontSize:"clamp(13px,2.5vw,15px)", fontWeight:500 }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ height:"0.5px", background:C.border, marginBottom:"clamp(18px,3vh,28px)" }} />
        <div style={{ fontSize:15, color:C.muted, lineHeight:1.9, marginBottom:"clamp(24px,4vh,36px)" }}>{game.desc}</div>

        <div style={{ marginBottom:"clamp(24px,4vh,36px)" }}>
          <div style={{ fontSize:10, color:"#444", letterSpacing:"2px", textTransform:"uppercase", marginBottom:12 }}>Community Rating</div>
          <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:36 }}>
            {[2,4,8,13,20,30,25,17,10,5].map((h,i)=>(
              <div key={i} style={{ flex:1, borderRadius:"2px 2px 0 0", background:C.faint, height:`${(h/30)*100}%` }} />
            ))}
          </div>
        </div>

        {game.status!=="want to play"&&(game.rating>0||game.review) && (
          <div style={{ background:C.surface, borderRadius:12, padding:"clamp(14px,2vh,20px)", marginBottom:"clamp(22px,4vh,32px)", border:`0.5px solid ${C.border}` }}>
            <div style={{ fontSize:10, color:"#444", letterSpacing:"2px", textTransform:"uppercase", marginBottom:12 }}>Your Log</div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:game.review?10:0 }}>
              <Stars value={game.rating} size={20} />
              <span style={{ fontSize:10, fontWeight:500, color:SC[game.status], letterSpacing:"1.5px", textTransform:"uppercase" }}>{game.status}</span>
            </div>
            {game.review && <div style={{ fontStyle:"italic", fontSize:14, color:C.muted, lineHeight:1.8, borderLeft:`2px solid ${C.border}`, paddingLeft:14 }}>"{game.review}"</div>}
          </div>
        )}

        {game.goty && (
          <div style={{ display:"inline-flex", alignItems:"center", background:"rgba(250,192,0,.07)", border:`0.5px solid rgba(250,192,0,.18)`, borderRadius:8, padding:"8px 14px", marginBottom:"clamp(24px,4vh,36px)" }}>
            <span style={{ fontSize:10, fontWeight:500, color:C.yellow, letterSpacing:"1.5px", textTransform:"uppercase" }}>Game of the Year</span>
          </div>
        )}

        <div style={{ height:100 }} />
      </div>

      <div style={{ position:"fixed", bottom:0, left:0, right:0, padding:"12px clamp(18px,5vw,48px) clamp(24px,4vh,40px)", background:`linear-gradient(to top, ${C.bg} 65%, transparent)`, zIndex:50 }}>
        <button onClick={()=>setSheet(true)} style={{
          width:"100%", padding:"clamp(14px,2vh,17px)", borderRadius:8,
          border: game.status==="want to play"?`0.5px solid ${C.border}`:"none", cursor:"pointer",
          background: game.status==="want to play" ? C.surface : C.pink,
          color: game.status==="want to play" ? C.text : "#fff",
          fontSize:14, fontWeight:500, letterSpacing:"1.5px", textTransform:"uppercase",
        }}>{game.status==="want to play" ? "Log this Game" : "Edit Log"}</button>
      </div>

      {sheet && <LogSheet game={game} user={user} onClose={()=>setSheet(false)} onSave={g=>{saveAndSyncLog(g);setSheet(false);}} />}
    </div>
  );
}

// ── GOTY RACE SIDEBAR — update this list weekly ────────────────────────────────
const GOTY_2026 = [
  { title:"Resident Evil Requiem",  developer:"Capcom"               },
  { title:"Crimson Desert",         developer:"Pearl Abyss"          },
  { title:"Marathon",               developer:"Bungie"               },
  { title:"Pragmata",               developer:"Capcom"               },
  { title:"Saros",                  developer:"Housemarque"          },
  { title:"Mixtape",                developer:"Beethoven & Dinosaur" },
  { title:"Mewgenics",              developer:"Team Meat"            },
  { title:"Pokemon Pokopia",        developer:"Game Freak"           },
  { title:"Mouse",                  developer:"Fury Studios"         },
  { title:"Cairn",                  developer:"Shedworks"            },
];

function GotyRace({ onGameClick }) {
  const [list, setList] = useState(GOTY_2026.map(g => ({ ...g, cover:"" })));

  useEffect(() => {
    if (!GOTY_2026.length) return;
    let mounted = true;
    (async () => {
      const fetched = await Promise.all(
        GOTY_2026.map(async (game) => {
          try {
            const data = await igdb("games", `
              search "${game.title.replace(/"/g, '\\"')}";
              fields id, name, cover.image_id, artworks.image_id, screenshots.image_id,
                external_games.uid, external_games.category, aggregated_rating;
              where cover != null & version_parent = null;
              limit 1;
            `);
            const hit = data?.[0];
            const { cover } = hit ? getIgdbCover(hit) : { cover:"" };
            return { ...game, cover, mc: hit?.aggregated_rating ? Math.round(hit.aggregated_rating) : 0 };
          } catch { return { ...game, cover:"", mc:0 }; }
        })
      );
      if (mounted) setList(fetched.sort((a, b) => (b.mc || 0) - (a.mc || 0)));
    })();
    return () => { mounted = false; };
  }, []);

  const rankColor = i => i===0 ? C.yellow : i<=2 ? C.muted : "#444";
  const mcColor   = mc => mc>=90 ? C.yellow : mc>=80 ? C.green : C.blue;

  if (!GOTY_2026.length) return null;

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:8 }}>
        <span style={{ fontSize:10, fontWeight:500, letterSpacing:"2px", color:"#444", textTransform:"uppercase", flexShrink:0 }}>GOTY Race 2026</span>
        <div style={{ flex:1, height:"0.5px", background:C.border }} />
      </div>
      <div style={{ fontSize:10, color:"#333", letterSpacing:"0.5px", marginBottom:16 }}>Kortana editorial picks</div>
      {list.map((game, i) => (
        <div key={i} onClick={()=>onGameClick({ id:`goty-${i}`, title:game.title, developer:game.developer, cover:game.cover, hero:game.cover, year:2026, rating:0, status:"", goty:false, desc:"", review:"", publisher:"", genre:"", playtime:0 })}
          style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:`0.5px solid ${C.border}`, cursor:"pointer" }}>
          <div style={{ width:18, fontSize:11, fontWeight:500, color:rankColor(i), textAlign:"right", flexShrink:0 }}>{i+1}</div>
          <div style={{ width:52, height:70, borderRadius:5, overflow:"hidden", flexShrink:0, background:C.faint, boxShadow:"0 2px 8px rgba(0,0,0,.5)" }}>
            <Img src={game.cover} style={{ width:"100%", height:"100%" }} />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:500, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", lineHeight:1.3 }}>{game.title}</div>
            <div style={{ fontSize:10, color:"#444", marginTop:2 }}>{game.developer}</div>
          </div>
          <div style={{ flexShrink:0, textAlign:"center", minWidth:28 }}>
            {game.mc > 0
              ? <><div style={{ fontSize:13, fontWeight:500, color:mcColor(game.mc), lineHeight:1 }}>{game.mc}</div><div style={{ fontSize:8, color:"#333", letterSpacing:"0.5px", textTransform:"uppercase", marginTop:2 }}>MC</div></>
              : <div style={{ fontSize:11, color:"#333" }}>—</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── NEW & HOT ─────────────────────────────────────────────────────────────────
function NewAndHot({ onGameClick }) {
  const [games, setGames] = useState([]);
  useEffect(() => {
    const oneYearAgo = Math.floor(Date.now() / 1000) - 86400 * 365;
    igdb("games", `
      fields id, name, first_release_date, cover.image_id, artworks.image_id,
        screenshots.image_id, summary, genres.name,
        involved_companies.company.name, involved_companies.developer,
        external_games.uid, external_games.category, rating, hypes;
      where hypes > 0 & platforms = (6,48,49,130,167,169) & cover != null
        & version_parent = null & first_release_date > ${oneYearAgo};
      sort hypes desc;
      limit 12;
    `)
      .then(data => {
        if (Array.isArray(data)) setGames(data.filter(g => g.cover?.image_id).map(normalizeIgdbGame));
      })
      .catch(() => {});
  }, []);
  if (!games.length) return null;
  return (
    <div style={{ display:"flex", gap:"clamp(10px,2vw,14px)", overflowX:"auto", paddingBottom:4, scrollSnapType:"x mandatory", marginLeft:"-clamp(18px,5vw,48px)", marginRight:"-clamp(18px,5vw,48px)", paddingLeft:"clamp(18px,5vw,48px)", paddingRight:"clamp(18px,5vw,48px)" }}>
      {games.map(g=>(
        <div key={g.id} style={{ width:"clamp(180px,32vw,260px)", flexShrink:0, scrollSnapAlign:"start" }}>
          <PosterCard game={g} onClick={onGameClick} />
        </div>
      ))}
    </div>
  );
}

// ── TGA GOTY HISTORY ─────────────────────────────────────────────────────────
const TGA_WINNERS = [
  { year:2024, title:"Astro Bot",                    developer:"Team Asobi"         },
  { year:2023, title:"Baldur's Gate 3",              developer:"Larian Studios"     },
  { year:2022, title:"Elden Ring",                   developer:"FromSoftware"       },
  { year:2021, title:"It Takes Two",                 developer:"Hazelight Studios"  },
  { year:2020, title:"The Last of Us Part II",       developer:"Naughty Dog"        },
  { year:2019, title:"Death Stranding",              developer:"Kojima Productions" },
  { year:2018, title:"God of War",                   developer:"Santa Monica Studio"},
  { year:2017, title:"The Legend of Zelda: Breath of the Wild", developer:"Nintendo"},
  { year:2016, title:"Overwatch",                    developer:"Blizzard"           },
  { year:2015, title:"The Witcher 3: Wild Hunt",     developer:"CD Projekt Red"     },
  { year:2014, title:"Dragon Age: Inquisition",      developer:"BioWare"            },
  { year:2013, title:"The Last of Us",               developer:"Naughty Dog"        },
];

function GotyHistory({ onGameClick }) {
  const [covers, setCovers] = useState({});
  useEffect(() => {
    let mounted = true;
    (async () => {
      const results = await Promise.all(
        TGA_WINNERS.map(async w => {
          try {
            const yrStart = Math.floor(new Date(`${w.year}-01-01`).getTime() / 1000);
            const yrEnd   = Math.floor(new Date(`${w.year + 1}-01-01`).getTime() / 1000);
            const data = await igdb("games", `
              search "${w.title.replace(/"/g, '\\"')}";
              fields id, name, cover.image_id, artworks.image_id, screenshots.image_id,
                external_games.uid, external_games.category;
              where cover != null & version_parent = null
                & first_release_date > ${yrStart} & first_release_date < ${yrEnd};
              limit 1;
            `);
            const hit = data?.[0];
            if (!hit) return [w.year, ""];
            const { cover } = getIgdbCover(hit);
            return [w.year, cover];
          } catch { return [w.year, ""]; }
        })
      );
      if (mounted) setCovers(Object.fromEntries(results));
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <span style={{ fontSize:10, fontWeight:500, letterSpacing:"2px", color:"#444", textTransform:"uppercase", flexShrink:0 }}>TGA Winners</span>
        <div style={{ flex:1, height:"0.5px", background:C.border }} />
      </div>
      {TGA_WINNERS.map(w => (
        <div key={w.year} onClick={() => onGameClick({ id:`tga-${w.year}`, title:w.title, developer:w.developer, cover:covers[w.year]||"", hero:covers[w.year]||"", year:w.year, rating:0, status:"", goty:true, desc:"", review:"", publisher:"", genre:"", playtime:0 })}
          style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:`0.5px solid ${C.border}`, cursor:"pointer" }}>
          <div style={{ width:58, height:78, borderRadius:6, overflow:"hidden", flexShrink:0, background:C.faint, boxShadow:"0 2px 10px rgba(0,0,0,.6)" }}>
            <Img src={covers[w.year]||""} style={{ width:"100%", height:"100%" }} />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:9, color:C.yellow, fontWeight:500, letterSpacing:"1.5px", marginBottom:2 }}>{w.year}</div>
            <div style={{ fontSize:12, fontWeight:500, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{w.title}</div>
            <div style={{ fontSize:10, color:"#444", marginTop:1 }}>{w.developer}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── CONNECT STEAM SHEET ───────────────────────────────────────────────────────
function ConnectSteamSheet({ onConnect, onClose }) {
  const [sid,      setSid]      = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [preview,  setPreview]  = useState(null);

  const find = async () => {
    const clean = sid.trim();
    if (!/^\d{17}$/.test(clean)) { setError("Enter a valid 17-digit Steam ID"); return; }
    setLoading(true); setError(""); setPreview(null);
    try {
      const data = await steamApi("nowplaying", clean);
      const player = data?.response?.players?.[0];
      if (!player) { setError("Couldn't load that Steam profile. Check your ID."); setLoading(false); return; }
      setPreview({ name: player.personaname, avatar: player.avatarfull, steamId: clean });
    } catch { setError("Failed to connect. Try again."); }
    setLoading(false);
  };

  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.87)", zIndex:400, display:"flex", alignItems:"flex-end", justifyContent:"center", backdropFilter:"blur(14px)" }}>
      <div style={{ background:C.surface, borderRadius:"16px 16px 0 0", width:"100%", maxWidth:440, paddingBottom:40, border:`0.5px solid ${C.border}`, borderBottom:"none", animation:"slideUp .22s ease", overflow:"hidden" }}>
        <StripeBar height={3} />
        <div style={{ display:"flex", justifyContent:"center", padding:"14px 0 6px" }}>
          <div style={{ width:36, height:3, borderRadius:2, background:C.border }} />
        </div>
        <div style={{ padding:"4px 24px 0" }}>
          <div style={{ fontSize:17, fontWeight:500, letterSpacing:"-0.3px", marginBottom:6 }}>Connect Steam</div>
          <div style={{ fontSize:13, color:C.muted, marginBottom:24, lineHeight:1.6 }}>Sync your library, playtime, and recently played games.</div>

          <div style={{ fontSize:10, color:"#444", letterSpacing:"2px", textTransform:"uppercase", marginBottom:8 }}>Your Steam ID</div>
          <div style={{ display:"flex", gap:8, marginBottom:10 }}>
            <input
              value={sid}
              onChange={e=>{ setSid(e.target.value); setPreview(null); setError(""); }}
              onKeyDown={e=>e.key==="Enter"&&find()}
              placeholder="76561198xxxxxxxxx"
              maxLength={17}
              style={{ flex:1, background:C.faint, border:`0.5px solid ${error ? C.pink : C.border}`, borderRadius:8, padding:"12px 14px", color:C.text, fontSize:14, outline:"none" }}
            />
            <button onClick={find} disabled={loading || sid.trim().length < 17} style={{ padding:"12px 20px", borderRadius:8, border:"none", background:sid.trim().length===17 ? C.blue : C.faint, color:sid.trim().length===17 ? "#fff" : C.muted, fontWeight:500, fontSize:13, cursor:sid.trim().length===17?"pointer":"default", flexShrink:0, transition:"all .15s" }}>
              {loading ? "…" : "Find"}
            </button>
          </div>
          <div style={{ fontSize:11, color:"#333", marginBottom:20 }}>
            Get your 17-digit ID at <span style={{ color:C.blue }}>steamidfinder.com</span>
          </div>

          {error && (
            <div style={{ fontSize:12, color:C.pink, marginBottom:16, padding:"10px 14px", background:"rgba(204,51,119,.08)", borderRadius:8 }}>{error}</div>
          )}

          {preview && (
            <>
              <div style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", background:C.faint, borderRadius:10, marginBottom:20, border:`0.5px solid ${C.green}44` }}>
                <img src={preview.avatar} style={{ width:48, height:48, borderRadius:"50%", objectFit:"cover" }} alt="" onError={e=>e.target.style.display="none"} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:500, color:C.text, marginBottom:2 }}>{preview.name}</div>
                  <div style={{ fontSize:11, color:C.green }}>Steam profile found</div>
                </div>
                <div style={{ fontSize:18, color:C.green }}>✓</div>
              </div>
              <button onClick={() => onConnect(preview.steamId)} style={{ width:"100%", padding:14, borderRadius:8, border:"none", background:C.green, color:"#fff", fontWeight:500, fontSize:14, cursor:"pointer", textTransform:"uppercase", letterSpacing:"1.5px" }}>
                Connect Account
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── CONNECT PSN SHEET ────────────────────────────────────────────────────────
function ConnectPSNSheet({ onConnect, onClose }) {
  const [npsso,   setNpsso]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [preview, setPreview] = useState(null);
  const [step,    setStep]    = useState(1); // 1=guide, 2=paste

  const verify = async (token) => {
    const t = (token || npsso).trim();
    if (!t) return;
    setLoading(true); setError(""); setPreview(null);
    const data = await psnConnect(t);
    if (data.error) { setError(data.error); setLoading(false); }
    else { setPreview(data); setLoading(false); }
  };

  const handlePaste = e => {
    const val = e.clipboardData.getData("text").trim();
    setNpsso(val);
    setError("");
    setPreview(null);
    if (val.length > 20) setTimeout(() => verify(val), 100);
  };

  const STEPS = [
    { n:1, icon:"🌐", title:"Open PlayStation.com",   desc:"Tap the button below — sign in if needed.", action: <button onClick={() => window.open("https://www.playstation.com/en-us/", "_blank")} style={{ marginTop:8, padding:"8px 16px", borderRadius:8, border:`0.5px solid #003791`, background:"rgba(0,55,145,.15)", color:"#5599ff", fontSize:12, fontWeight:600, cursor:"pointer", letterSpacing:"0.5px" }}>Open PlayStation.com →</button> },
    { n:2, icon:"⌨️", title:'Press F12',               desc:'Opens browser tools. On Mac use Cmd+Option+I.' },
    { n:3, icon:"🍪", title:"Go to Application → Cookies", desc:'Click the "Application" tab at the top, then "Cookies" → "www.playstation.com" in the left panel.' },
    { n:4, icon:"📋", title:'Find "npsso" → Copy Value', desc:"Scroll to find the cookie named npsso. Click it, then copy the long text in the Value column.", action: <button onClick={() => setStep(2)} style={{ marginTop:8, padding:"8px 16px", borderRadius:8, border:`0.5px solid ${C.green}`, background:`${C.green}18`, color:C.green, fontSize:12, fontWeight:600, cursor:"pointer" }}>I copied it →</button> },
  ];

  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.87)", zIndex:400, display:"flex", alignItems:"flex-end", justifyContent:"center", backdropFilter:"blur(14px)" }}>
      <div style={{ background:C.surface, borderRadius:"16px 16px 0 0", width:"100%", maxWidth:440, paddingBottom:40, border:`0.5px solid ${C.border}`, borderBottom:"none", animation:"slideUp .22s ease", overflow:"hidden", maxHeight:"85vh", overflowY:"auto" }}>
        <StripeBar height={3} />
        <div style={{ display:"flex", justifyContent:"center", padding:"14px 0 6px" }}>
          <div style={{ width:36, height:3, borderRadius:2, background:C.border }} />
        </div>
        <div style={{ padding:"4px 24px 0" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
            <span style={{ fontSize:22 }}>🎮</span>
            <div style={{ fontSize:17, fontWeight:500, letterSpacing:"-0.3px" }}>Connect PlayStation</div>
          </div>
          <div style={{ fontSize:12, color:"#555", marginBottom:20, lineHeight:1.5 }}>
            Links your PSN account to show your library and hours played. Takes about 60 seconds.
          </div>

          {step === 1 ? (
            <>
              <div style={{ fontSize:10, color:"#444", letterSpacing:"2px", textTransform:"uppercase", marginBottom:14, fontWeight:600 }}>Follow these steps</div>
              <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:24 }}>
                {STEPS.map(s => (
                  <div key={s.n} style={{ display:"flex", gap:14, padding:"14px 16px", background:C.faint, borderRadius:12, border:`0.5px solid ${C.border}` }}>
                    <div style={{ width:32, height:32, borderRadius:"50%", background:"rgba(255,255,255,.04)", border:`0.5px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:16 }}>{s.icon}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:500, color:C.text, marginBottom:3 }}>{s.n}. {s.title}</div>
                      <div style={{ fontSize:12, color:"#555", lineHeight:1.5 }}>{s.desc}</div>
                      {s.action}
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => setStep(2)} style={{ width:"100%", padding:14, borderRadius:10, border:`0.5px solid ${C.border}`, background:"transparent", color:C.muted, fontSize:13, cursor:"pointer" }}>
                Skip guide — I already have my token
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setStep(1)} style={{ background:"none", border:"none", color:"#555", fontSize:12, cursor:"pointer", padding:"0 0 16px", display:"flex", alignItems:"center", gap:6 }}>← Back to guide</button>
              <div style={{ fontSize:10, color:"#444", letterSpacing:"2px", textTransform:"uppercase", marginBottom:8, fontWeight:600 }}>Paste your npsso token</div>
              <textarea
                value={npsso}
                onChange={e => { setNpsso(e.target.value); setError(""); setPreview(null); }}
                onPaste={handlePaste}
                placeholder="Paste the npsso value here…"
                rows={3}
                style={{ width:"100%", background:C.faint, border:`0.5px solid ${error ? C.pink : C.border}`, borderRadius:8, padding:"12px 14px", color:C.text, fontSize:12, outline:"none", boxSizing:"border-box", fontFamily:"monospace", resize:"none", marginBottom:10, lineHeight:1.5 }}
              />
              {loading && <div style={{ fontSize:12, color:C.muted, marginBottom:12, textAlign:"center" }}>Verifying…</div>}
              {error   && <div style={{ fontSize:12, color:C.pink,  marginBottom:14, padding:"10px 14px", background:"rgba(204,51,119,.08)", borderRadius:8 }}>{error}</div>}
              {preview ? (
                <>
                  <div style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", background:C.faint, borderRadius:10, marginBottom:16, border:`0.5px solid ${C.green}44` }}>
                    {preview.avatarUrl && <img src={preview.avatarUrl} style={{ width:46, height:46, borderRadius:"50%", objectFit:"cover" }} alt="" />}
                    <div>
                      <div style={{ fontSize:14, fontWeight:500 }}>{preview.onlineId}</div>
                      <div style={{ fontSize:11, color:C.green }}>Account verified ✓</div>
                    </div>
                  </div>
                  <button onClick={() => onConnect(npsso.trim(), preview)} style={{ width:"100%", padding:14, borderRadius:10, border:"none", background:C.blue, color:"#fff", fontWeight:600, fontSize:14, cursor:"pointer", letterSpacing:"1px" }}>
                    Connect PlayStation
                  </button>
                </>
              ) : (
                <button onClick={() => verify()} disabled={loading || !npsso.trim()} style={{ width:"100%", padding:14, borderRadius:10, border:"none", background:npsso.trim() ? "#003791" : C.faint, color:npsso.trim() ? "#fff" : C.muted, fontWeight:600, fontSize:14, cursor:npsso.trim()?"pointer":"default", letterSpacing:"1px", transition:"all .15s" }}>
                  {loading ? "Verifying…" : "Verify Token"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── CONNECT XBOX SHEET ────────────────────────────────────────────────────────
function ConnectXboxSheet({ onConnect, onClose }) {
  const [key,     setKey]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [preview, setPreview] = useState(null);

  const verify = async () => {
    const k = key.trim();
    if (!k) { setError("Paste your OpenXBL API key above."); return; }
    setLoading(true); setError(""); setPreview(null);
    const data = await xboxApi("profile", k);
    const pu = data?.profileUsers?.[0];
    if (!pu) { setError("Invalid API key. Make sure you copied it from openxbl.com."); setLoading(false); return; }
    const gamertag = pu.settings?.find(s => s.id === "Gamertag")?.value || "";
    const avatar   = pu.settings?.find(s => s.id === "GameDisplayPicRaw")?.value || "";
    if (!gamertag) { setError("Couldn't read Gamertag. Try again."); setLoading(false); return; }
    setPreview({ gamertag, avatar });
    setLoading(false);
  };

  const sheetStyle = { background:C.surface, borderRadius:"16px 16px 0 0", width:"100%", maxWidth:440, paddingBottom:40, border:`0.5px solid ${C.border}`, borderBottom:"none", animation:"slideUp .22s ease", overflow:"hidden" };
  const inp = { width:"100%", background:C.faint, border:`0.5px solid ${error ? C.pink : C.border}`, borderRadius:8, padding:"12px 14px", color:C.text, fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"monospace" };

  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.87)", zIndex:400, display:"flex", alignItems:"flex-end", justifyContent:"center", backdropFilter:"blur(14px)" }}>
      <div style={sheetStyle}>
        <StripeBar height={3} />
        <div style={{ display:"flex", justifyContent:"center", padding:"14px 0 6px" }}>
          <div style={{ width:36, height:3, borderRadius:2, background:C.border }} />
        </div>
        <div style={{ padding:"4px 24px 0" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
            <span style={{ fontSize:24 }}>🎮</span>
            <div style={{ fontSize:17, fontWeight:500, letterSpacing:"-0.3px" }}>Connect Xbox</div>
          </div>
          <div style={{ fontSize:13, color:C.muted, marginBottom:20, lineHeight:1.6 }}>Sync your Xbox game library and achievements using a free OpenXBL API key.</div>

          <div style={{ background:C.faint, borderRadius:10, padding:"14px 16px", marginBottom:20, border:`0.5px solid ${C.border}` }}>
            <div style={{ fontSize:10, color:"#444", letterSpacing:"2px", textTransform:"uppercase", marginBottom:10, fontWeight:600 }}>How to get your free API key</div>
            <div style={{ fontSize:12, color:C.muted, lineHeight:1.8 }}>
              1. Go to <span style={{ color:C.green }}>openxbl.com</span><br/>
              2. Click <b>Sign In</b> and connect your Microsoft / Xbox account<br/>
              3. After signing in, copy your <b>API Key</b> from the dashboard<br/>
              4. Paste it below — it's free, no credit card needed
            </div>
          </div>

          <div style={{ fontSize:10, color:"#444", letterSpacing:"2px", textTransform:"uppercase", marginBottom:8 }}>OpenXBL API Key</div>
          <input value={key} onChange={e=>{ setKey(e.target.value); setPreview(null); setError(""); }}
            placeholder="Paste API key here…" style={{ ...inp, marginBottom:10 }} />

          {error && <div style={{ fontSize:12, color:C.pink, marginBottom:14, padding:"10px 14px", background:"rgba(204,51,119,.08)", borderRadius:8 }}>{error}</div>}

          {preview ? (
            <>
              <div style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", background:C.faint, borderRadius:10, marginBottom:16, border:`0.5px solid ${C.green}44` }}>
                {preview.avatar && <img src={preview.avatar} style={{ width:46, height:46, borderRadius:"50%", objectFit:"cover" }} alt="" />}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:500, color:C.text, marginBottom:2 }}>{preview.gamertag}</div>
                  <div style={{ fontSize:11, color:C.green }}>Xbox account verified ✓</div>
                </div>
              </div>
              <button onClick={() => onConnect(key.trim(), preview)} style={{ width:"100%", padding:14, borderRadius:8, border:"none", background:C.green, color:"#fff", fontWeight:500, fontSize:14, cursor:"pointer", textTransform:"uppercase", letterSpacing:"1.5px" }}>
                Connect Xbox
              </button>
            </>
          ) : (
            <button onClick={verify} disabled={loading || !key.trim()} style={{ width:"100%", padding:14, borderRadius:8, border:"none", background:key.trim() ? C.green : C.faint, color:key.trim() ? "#fff" : C.muted, fontWeight:500, fontSize:14, cursor:key.trim()?"pointer":"default", textTransform:"uppercase", letterSpacing:"1.5px", transition:"all .15s" }}>
              {loading ? "Verifying…" : "Verify Key"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── PSN GAMES ROW ─────────────────────────────────────────────────────────────
function parsePsnDuration(iso) {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return null;
  const h = parseInt(m[1] || "0"), min = parseInt(m[2] || "0");
  if (h > 0 && min > 0) return `${h}h ${min}m`;
  if (h > 0) return `${h}h`;
  if (min > 0) return `${min}m`;
  return null;
}

function PSNGamesRow({ accessToken, onGameClick }) {
  const [games, setGames] = useState([]);
  useEffect(() => {
    if (!accessToken) return;
    psnGetGames(accessToken).then(data => {
      // Gamelist API format (preferred — has playtime)
      if (data.titles) {
        setGames(data.titles.slice(0, 20).map(t => {
          const img = t.imageURLs?.find(i => i.type === "BACKGROUND_IMAGE_DARK")?.url
                   || t.imageURLs?.find(i => i.type === "MASTER")?.url
                   || t.imageURLs?.[0]?.url || "";
          return {
            id:       `psn-${t.titleId}`,
            title:    t.name || t.localizedName,
            cover:    img,
            hero:     img,
            platform: (t.categories || []).includes("ps5_native_game") ? "PS5" : "PS4",
            playtime: parsePsnDuration(t.playDuration),
            playCount: t.playCount || 0,
            lastPlayed: t.lastPlayedDateTime,
            status:   "played",
            year:     t.lastPlayedDateTime ? new Date(t.lastPlayedDateTime).getFullYear() : null,
          };
        }));
      } else {
        // Trophy titles fallback
        const titles = data.trophyTitles || [];
        setGames(titles.slice(0, 20).map(t => ({
          id:       `psn-${t.npCommunicationId}`,
          title:    t.trophyTitleName,
          cover:    t.trophyTitleIconUrl || "",
          hero:     t.trophyTitleIconUrl || "",
          platform: t.trophyTitlePlatform || "PlayStation",
          progress: t.progress || 0,
          playtime: null,
          status:   "played",
          year:     t.lastUpdatedDateTime ? new Date(t.lastUpdatedDateTime).getFullYear() : null,
        })));
      }
    }).catch(() => {});
  }, [accessToken]);

  if (!games.length) return null;
  return (
    <div style={{ display:"flex", gap:"clamp(10px,2vw,14px)", overflowX:"auto", paddingBottom:4, scrollSnapType:"x mandatory", marginLeft:"-clamp(18px,5vw,48px)", marginRight:"-clamp(18px,5vw,48px)", paddingLeft:"clamp(18px,5vw,48px)", paddingRight:"clamp(18px,5vw,48px)" }}>
      {games.map(g => (
        <div key={g.id} onClick={() => onGameClick(g)} style={{ width:"clamp(100px,18vw,130px)", flexShrink:0, scrollSnapAlign:"start", cursor:"pointer" }}>
          <div style={{ width:"100%", aspectRatio:"1/1", borderRadius:10, overflow:"hidden", background:C.faint, marginBottom:6, border:`0.5px solid ${C.border}` }}>
            <Img src={g.cover} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
          </div>
          <div style={{ fontSize:10, fontWeight:500, color:C.text, lineHeight:1.3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{g.title}</div>
          <div style={{ display:"flex", gap:5, marginTop:1 }}>
            {g.playtime && <div style={{ fontSize:9, color:C.blue }}>{g.playtime}</div>}
            {!g.playtime && g.progress > 0 && <div style={{ fontSize:9, color:C.blue }}>{g.progress}% trophies</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── XBOX GAMES ROW ────────────────────────────────────────────────────────────
function parseXboxMinutes(stats) {
  if (!Array.isArray(stats)) return 0;
  const s = stats.find(s => s.id === "MinutesPlayed" || s.name === "MinutesPlayed");
  return s ? Math.round(parseInt(s.value || "0") / 60) : 0;
}

function XboxGamesRow({ xboxKey, onGameClick }) {
  const [games, setGames] = useState([]);
  useEffect(() => {
    if (!xboxKey) return;
    // Use /titles for full game library (not /achievements which is just recent activity)
    xboxApi("titles", xboxKey).then(data => {
      const titles = data.titles || [];
      setGames(
        titles
          .filter(t => t.name && t.type === "Game")
          .slice(0, 20)
          .map(t => {
            const hours = parseXboxMinutes(t.stats);
            const boxart = t.images?.find(i => i.type === "BoxArt")?.url || t.displayImage || "";
            return {
              id:           `xbox-${t.titleId}`,
              title:        t.name,
              cover:        boxart,
              hero:         t.displayImage || boxart,
              platform:     "Xbox",
              gamerscore:   t.achievement?.currentGamerscore ?? 0,
              totalScore:   t.achievement?.totalGamerscore ?? 0,
              achievements: t.achievement?.currentAchievements ?? 0,
              totalAch:     t.achievement?.totalAchievements ?? 0,
              hours,
              status:       "played",
            };
          })
      );
    }).catch(() => {
      // Fall back to achievements endpoint for older OpenXBL keys
      xboxApi("achievements", xboxKey).then(data => {
        const raw = data.titles || data.achievements || [];
        const seen = new Map();
        raw.forEach(item => {
          const name  = item.name || item.titleName || item.title;
          const img   = item.displayImage || item.titleImage || item.images?.[0]?.url || "";
          const id    = item.titleId || item.id || name;
          const score = item.achievement?.currentGamerscore ?? item.gamerscore ?? 0;
          if (name && !seen.has(name)) seen.set(name, { id:`xbox-${id}`, title:name, cover:img, hero:img, platform:"Xbox", gamerscore:score, hours:0, status:"played" });
        });
        setGames([...seen.values()].slice(0, 20));
      }).catch(() => {});
    });
  }, [xboxKey]);

  if (!games.length) return null;
  return (
    <div style={{ display:"flex", gap:"clamp(10px,2vw,14px)", overflowX:"auto", paddingBottom:4, scrollSnapType:"x mandatory", marginLeft:"-clamp(18px,5vw,48px)", marginRight:"-clamp(18px,5vw,48px)", paddingLeft:"clamp(18px,5vw,48px)", paddingRight:"clamp(18px,5vw,48px)" }}>
      {games.map(g => (
        <div key={g.id} onClick={() => onGameClick(g)} style={{ width:"clamp(100px,18vw,130px)", flexShrink:0, scrollSnapAlign:"start", cursor:"pointer" }}>
          <div style={{ width:"100%", aspectRatio:"1/1", borderRadius:10, overflow:"hidden", background:C.faint, marginBottom:6, border:`0.5px solid ${C.border}` }}>
            <Img src={g.cover} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
          </div>
          <div style={{ fontSize:10, fontWeight:500, color:C.text, lineHeight:1.3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{g.title}</div>
          <div style={{ display:"flex", gap:5, marginTop:1 }}>
            {g.hours > 0 && <div style={{ fontSize:9, color:C.blue }}>{g.hours}h</div>}
            {g.gamerscore > 0 && <div style={{ fontSize:9, color:C.green }}>{g.gamerscore}G</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── STEAM COMPONENTS ─────────────────────────────────────────────────────────
// ── GAMING NEWS ───────────────────────────────────────────────────────────────
const NEWS_FEEDS = [
  { key:"ign",      url:"https://feeds.ign.com/ign/all",    name:"IGN",      color:C.pink   },
  { key:"gameranx", url:"https://gameranx.com/feed/",       name:"Gameranx", color:C.yellow },
  { key:"eurogamer",url:"https://www.eurogamer.net/feed",   name:"Eurogamer",color:C.blue   },
  { key:"pcgamer",  url:"https://www.pcgamer.com/rss/",     name:"PC Gamer", color:C.green  },
];

const GAMING_KWS = ["game","games","gaming","xbox","playstation","ps5","ps4","nintendo","switch","steam","rpg","fps","shooter","dlc","patch","trailer","developer","studio","esport","gta","cod","review","preview","announcement","sequel","remaster","remake","indie","console","pc gaming"];
const isGamingArticle = a => GAMING_KWS.some(kw => (a.title+" "+(a.link||"")).toLowerCase().includes(kw));

function parseRSSXml(xml) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  return Array.from(doc.querySelectorAll("item")).map(item => {
    const get = tag => item.querySelector(tag)?.textContent?.trim() || "";
    const mediaUrl = item.querySelector("[url]")?.getAttribute("url")
                  || item.querySelector("enclosure")?.getAttribute("url") || "";
    const descHtml = get("description");
    const imgMatch = descHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
    const thumb    = mediaUrl || (imgMatch?.[1] ?? "");
    return {
      title:     get("title"),
      link:      get("link") || item.querySelector("link")?.getAttribute("href") || "",
      pubDate:   get("pubDate") || get("published") || "",
      thumbnail: thumb && !thumb.includes("1x1") && !thumb.includes("pixel") && thumb.startsWith("http") ? thumb : "",
    };
  });
}

async function fetchFeed(feed) {
  const res = await fetch(IGDB_PROXY, {
    method: "POST", headers: PROXY_HEADERS,
    body: JSON.stringify({ endpoint:"rss", feedUrl:feed.url }),
  });
  const { xml } = await res.json();
  return parseRSSXml(xml).map(item => ({ ...item, _source:feed.name, _color:feed.color, _key:feed.key }));
}

// ── NEWS ARTICLE CARD ─────────────────────────────────────────────────────────
function NewsCard({ a, compact }) {
  const ts = a.pubDate ? relTime(new Date(a.pubDate)) : "";
  return (
    <a href={a.link} target="_blank" rel="noopener noreferrer"
      style={{ display:"flex", gap:10, padding:compact?"10px 0":"12px 0", borderBottom:`0.5px solid ${C.border}`, textDecoration:"none", alignItems:"center", transition:"opacity .15s" }}
      onMouseEnter={e=>e.currentTarget.style.opacity="0.7"}
      onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
      <div style={{ width:compact?60:76, height:compact?44:54, borderRadius:6, overflow:"hidden", flexShrink:0, background:C.faint }}>
        {a.thumbnail
          ? <img src={a.thumbnail} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e=>{e.target.parentNode.style.background=`${a._color}18`;e.target.style.display="none";}} />
          : <div style={{ width:"100%", height:"100%", background:`${a._color}18`, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <span style={{ fontSize:10, color:a._color, fontWeight:700 }}>{a._source?.[0]}</span>
            </div>
        }
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:3 }}>
          <span style={{ fontSize:8, fontWeight:700, color:a._color, letterSpacing:"1.5px", textTransform:"uppercase" }}>{a._source}</span>
          {ts && <span style={{ fontSize:8, color:"#444" }}>· {ts}</span>}
        </div>
        <div style={{ fontSize:compact?11:12, fontWeight:500, color:C.text, lineHeight:1.4, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>
          {a.title}
        </div>
      </div>
    </a>
  );
}

// ── KORTANA WEEKLY TAB ────────────────────────────────────────────────────────
const KORTANA_TRAILERS = [
  { id:"aQoEd5rnxiQ", title:"Mixtape",            dev:"Beethoven & Dinosaur", label:"LAUNCH TRAILER"  },
  { id:"ePFf7FCVTyQ", title:"Pragmata",            dev:"Capcom",              label:"LAUNCH TRAILER"  },
  { id:"tbWZIxw7Uto", title:"007 First Light",     dev:"IO Interactive",      label:"REVEAL TRAILER"  },
  { id:"sLcksHR30UA", title:"Ghost of Yōtei",      dev:"Sucker Punch",        label:"LAUNCH TRAILER"  },
  { id:"VQRLujxTm3c", title:"Grand Theft Auto VI", dev:"Rockstar Games",      label:"TRAILER 2"       },
];

function KortanaWeeklyTab({ articles }) {
  return (
    <div>
      <div style={{ fontSize:9, color:C.blue, fontWeight:700, letterSpacing:"3px", textTransform:"uppercase", marginBottom:14 }}>
        Kortana Picks — Trailers
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:28 }}>
        {KORTANA_TRAILERS.map(t => (
          <a key={t.id} href={`https://www.youtube.com/watch?v=${t.id}`} target="_blank" rel="noopener noreferrer"
            style={{ display:"block", textDecoration:"none", borderRadius:10, overflow:"hidden",
              border:`0.5px solid ${C.border}`, background:C.card, transition:"opacity .15s" }}
            onMouseEnter={e=>e.currentTarget.style.opacity="0.75"}
            onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
            <div style={{ position:"relative", width:"100%", aspectRatio:"16/9", background:"#111", overflow:"hidden" }}>
              <img src={`https://img.youtube.com/vi/${t.id}/maxresdefault.jpg`} alt={t.title}
                style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }}
                onError={e=>{ e.target.src=`https://img.youtube.com/vi/${t.id}/hqdefault.jpg`; }} />
              <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center",
                background:"rgba(0,0,0,0.18)" }}>
                <div style={{ width:46, height:46, background:"rgba(220,20,20,0.92)", borderRadius:"50%",
                  display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 2px 14px rgba(0,0,0,0.55)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                </div>
              </div>
              <div style={{ position:"absolute", top:8, left:8, background:"rgba(0,0,0,0.72)", borderRadius:4,
                padding:"2px 7px", fontSize:8, fontWeight:700, color:"#fff", letterSpacing:"1.5px", textTransform:"uppercase" }}>
                {t.label}
              </div>
            </div>
            <div style={{ padding:"9px 11px" }}>
              <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:2 }}>{t.title}</div>
              <div style={{ fontSize:10, color:C.muted }}>{t.dev}</div>
            </div>
          </a>
        ))}
      </div>

      {articles.length > 0 && (
        <>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
            <span style={{ fontSize:8, color:"#444", letterSpacing:"2px", textTransform:"uppercase", fontWeight:500, flexShrink:0 }}>Latest News</span>
            <div style={{ flex:1, height:"0.5px", background:C.border }} />
          </div>
          {articles.slice(0, 6).map((a, i) => <NewsCard key={i} a={a} compact />)}
        </>
      )}
    </div>
  );
}

// Module-level cache so news survives NewsRow remounts
let _newsCache = {};
let _newsFetching = false;
const _newsListeners = new Set();
function loadFeeds() {
  if (_newsFetching || Object.keys(_newsCache).length > 0) return;
  _newsFetching = true;
  Promise.allSettled(NEWS_FEEDS.map(fetchFeed)).then(results => {
    const map = {};
    results.forEach((r, i) => {
      if (r.status === "fulfilled") map[NEWS_FEEDS[i].key] = r.value;
    });
    _newsCache = map;
    _newsFetching = false;
    _newsListeners.forEach(fn => fn(map));
  });
}

// ── NEWS ROW ─────────────────────────────────────────────────────────────────
function NewsRow() {
  const [bySource, setBySource] = useState(_newsCache);
  const [newsTab,  setNewsTab]  = useState("kortana");
  const allArticles = Object.values(bySource).flat();

  useEffect(() => {
    if (Object.keys(_newsCache).length > 0) { setBySource({ ..._newsCache }); return; }
    const update = map => setBySource({ ...map });
    _newsListeners.add(update);
    loadFeeds();
    return () => _newsListeners.delete(update);
  }, []);

  const ignArticles      = (bySource.ign || []).filter(isGamingArticle);
  const gameranxArticles = bySource.gameranx || [];
  const kortanaAll       = allArticles
    .filter(isGamingArticle)
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .filter((a, i, arr) => arr.findIndex(x => x.title === a.title) === i);

  const NEWS_TABS = [
    { key:"kortana",  label:"Kortana"  },
    { key:"ign",      label:"IGN"      },
    { key:"gameranx", label:"Gameranx" },
  ];

  return (
    <div style={{ paddingTop:28 }}>
      {/* Tab bar */}
      <div style={{ display:"flex", gap:6, marginBottom:16, overflowX:"auto", paddingBottom:2 }}>
        {NEWS_TABS.map(t => (
          <button key={t.key} onClick={() => setNewsTab(t.key)} style={{
            flexShrink:0, padding:"5px 14px", borderRadius:20, cursor:"pointer",
            background: newsTab===t.key ? C.blue : "transparent",
            border: `0.5px solid ${newsTab===t.key ? C.blue : C.border}`,
            color: newsTab===t.key ? "#fff" : C.muted,
            fontSize:10, fontWeight:500, letterSpacing:"1.5px", textTransform:"uppercase", transition:"all .15s",
          }}>{t.label}</button>
        ))}
      </div>

      {newsTab === "kortana"  && <KortanaWeeklyTab articles={kortanaAll} />}
      {newsTab === "ign"      && (ignArticles.length
        ? ignArticles.map((a, i) => <NewsCard key={i} a={a} />)
        : <div style={{ fontSize:11, color:"#333", padding:"20px 0", letterSpacing:"1px" }}>Loading IGN…</div>
      )}
      {newsTab === "gameranx" && (gameranxArticles.length
        ? gameranxArticles.map((a, i) => <NewsCard key={i} a={a} />)
        : <div style={{ fontSize:11, color:"#333", padding:"20px 0", letterSpacing:"1px" }}>Loading Gameranx…</div>
      )}
    </div>
  );
}

function NowPlayingCard({ steamId }) {
  const [game, setGame] = useState(null);

  useEffect(() => {
    if (!steamId) return;
    const check = async () => {
      try {
        const data = await steamApi("nowplaying", steamId);
        const player = data?.response?.players?.[0];
        if (player?.gameid) {
          setGame({ appId: player.gameid, title: player.gameextrainfo || "Unknown Game" });
        } else {
          setGame(null);
        }
      } catch {}
    };
    check();
    const interval = setInterval(check, 120000);
    return () => clearInterval(interval);
  }, [steamId]);

  if (!game) return null;
  return (
    <div style={{ position:"relative", height:160, overflow:"hidden", borderRadius:12, margin:"0 clamp(18px,5vw,48px) 24px" }}>
      <Img src={steamHero(game.appId)} style={{ width:"100%", height:"100%", filter:"brightness(.3) saturate(.5)" }} />
      <div style={{ position:"absolute", inset:0, background:"linear-gradient(to right, rgba(10,10,10,.95) 0%, rgba(10,10,10,.4) 100%)" }} />
      <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", gap:16, padding:"0 20px" }}>
        <div style={{ width:72, height:96, borderRadius:6, overflow:"hidden", flexShrink:0, boxShadow:"0 4px 20px rgba(0,0,0,.8)" }}>
          <Img src={steamCover(game.appId)} style={{ width:"100%", height:"100%" }} />
        </div>
        <div>
          <div style={{ fontSize:9, color:C.green, fontWeight:500, letterSpacing:"2px", textTransform:"uppercase", marginBottom:6, display:"flex", alignItems:"center", gap:5 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:C.green, animation:"steamPulse 2s infinite" }} />
            Now Playing on Steam
          </div>
          <div style={{ fontSize:"clamp(16px,3vw,22px)", fontWeight:500, lineHeight:1.2, letterSpacing:"-0.3px" }}>{game.title}</div>
        </div>
      </div>
    </div>
  );
}

function SteamRecentRow({ steamId, onGameClick }) {
  const [games, setGames] = useState([]);

  useEffect(() => {
    if (!steamId) return;
    steamApi("recentlyplayed", steamId)
      .then(data => {
        const list = data?.response?.games || [];
        setGames(list.slice(0, 10).map(g => ({
          id: `steam-${g.appid}`,
          title: g.name,
          cover: steamCover(g.appid),
          hero: steamHero(g.appid),
          steamId: String(g.appid),
          hoursRecent: g.playtime_2weeks ? Math.round(g.playtime_2weeks / 60 * 10) / 10 : 0,
          totalHours: g.playtime_forever ? Math.round(g.playtime_forever / 60) : 0,
          year: null, developer: "Steam", rating: 0, status: "", goty: false,
          desc: "", review: "", publisher: "", genre: "", playtime: g.playtime_forever ? Math.round(g.playtime_forever / 60) : 0,
        })));
      })
      .catch(() => {});
  }, [steamId]);

  if (!steamId || !games.length) return null;
  return (
    <div style={{ paddingTop:32 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <span style={{ fontSize:10, fontWeight:500, letterSpacing:"2px", color:"#444", textTransform:"uppercase", flexShrink:0 }}>Recently Played on Steam</span>
        <div style={{ flex:1, height:"0.5px", background:C.border }} />
      </div>
      <div style={{ display:"flex", gap:"clamp(10px,2vw,14px)", overflowX:"auto", paddingBottom:4, scrollSnapType:"x mandatory", marginLeft:"-clamp(18px,5vw,48px)", marginRight:"-clamp(18px,5vw,48px)", paddingLeft:"clamp(18px,5vw,48px)", paddingRight:"clamp(18px,5vw,48px)" }}>
        {games.map(g => (
          <div key={g.id} onClick={() => onGameClick(g)} style={{ width:"clamp(130px,22vw,170px)", flexShrink:0, scrollSnapAlign:"start", cursor:"pointer" }}>
            <div style={{ position:"relative", aspectRatio:"2/3", borderRadius:8, overflow:"hidden", background:C.faint, boxShadow:"0 4px 20px rgba(0,0,0,.6)" }}>
              <Img src={g.cover} style={{ width:"100%", height:"100%" }} />
              <div style={{ position:"absolute", inset:0, background:"linear-gradient(to top, rgba(10,10,10,.9) 0%, transparent 55%)" }} />
              <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"8px 10px" }}>
                <div style={{ fontSize:11, fontWeight:500, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", lineHeight:1.3, marginBottom:2 }}>{g.title}</div>
                {g.totalHours > 0 && <div style={{ fontSize:9, color:"#555" }}>{g.totalHours}h total</div>}
              </div>
              {g.hoursRecent > 0 && (
                <div style={{ position:"absolute", top:6, right:6, background:"rgba(0,168,80,.15)", border:`0.5px solid ${C.green}44`, borderRadius:4, padding:"2px 6px", fontSize:9, color:C.green, fontWeight:500 }}>{g.hoursRecent}h this week</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SteamLibraryStats({ steamId }) {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    if (!steamId) return;
    steamApi("library", steamId)
      .then(data => {
        const games = data?.response?.games || [];
        if (!games.length) return;
        const totalHours = Math.round(games.reduce((s, g) => s + (g.playtime_forever || 0), 0) / 60);
        const top = [...games].sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0))[0];
        setStats({ count: games.length, totalHours, topName: top?.name || null, topHours: top ? Math.round(top.playtime_forever / 60) : 0 });
      })
      .catch(() => {});
  }, [steamId]);
  if (!stats) return null;
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"clamp(8px,2vw,12px)", marginBottom:8 }}>
      {[
        ["Games Owned", stats.count.toLocaleString(), C.blue],
        ["Hours Played", stats.totalHours.toLocaleString(), C.green],
        ["Most Played", stats.topHours > 0 ? `${stats.topHours}h` : "—", C.yellow],
      ].map(([l, v, col]) => (
        <div key={l} style={{ background:C.surface, borderRadius:10, padding:"clamp(12px,2.5vw,16px)", textAlign:"center", border:`0.5px solid ${C.border}` }}>
          <div style={{ fontSize:"clamp(15px,3vw,20px)", fontWeight:500, color:col, letterSpacing:"-0.3px" }}>{v}</div>
          <div style={{ fontSize:9, color:"#444", marginTop:4, letterSpacing:"1.5px", textTransform:"uppercase", fontWeight:500 }}>{l}</div>
          {l === "Most Played" && stats.topName && (
            <div style={{ fontSize:8, color:"#333", marginTop:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{stats.topName}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── DESKTOP PANELS ────────────────────────────────────────────────────────────
function DesktopLeftPanel() {
  return (
    <div style={{ width:220, flexShrink:0, position:"sticky", top:58, height:"calc(100vh - 58px - 62px)", overflowY:"auto", borderRight:`0.5px solid ${C.border}`, padding:"0 16px 20px" }}>
      <NewsRow />
    </div>
  );
}

function DesktopRightPanel({ logs, onGameClick }) {
  const played    = logs.filter(l=>l.status==="played").length;
  const playing   = logs.filter(l=>l.status==="playing").length;
  const backlog   = logs.filter(l=>l.status==="want to play").length;
  const rated     = logs.filter(l=>l.rating>0);
  const avgRating = rated.length ? (rated.reduce((s,l)=>s+l.rating,0)/rated.length).toFixed(1) : "—";
  return (
    <div style={{ width:220, flexShrink:0, position:"sticky", top:58, height:"calc(100vh - 58px - 62px)", overflowY:"auto", borderLeft:`0.5px solid ${C.border}`, padding:"20px 16px 20px" }}>
      {/* Mini stats */}
      <div style={{ marginBottom:28 }}>
        <div style={{ fontSize:10, color:"#444", letterSpacing:"2px", textTransform:"uppercase", marginBottom:14, fontWeight:500 }}>Your Stats</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {[["Played",played,C.green],["Playing",playing,C.blue],["Backlog",backlog,C.yellow],["Avg",avgRating,C.pink]].map(([label,val,col])=>(
            <div key={label} style={{ background:C.surface, borderRadius:8, padding:"12px 10px", textAlign:"center", border:`0.5px solid ${C.border}` }}>
              <div style={{ fontSize:20, fontWeight:600, color:col, letterSpacing:"-0.5px", lineHeight:1 }}>{val}</div>
              <div style={{ fontSize:8, color:"#444", letterSpacing:"1.5px", textTransform:"uppercase", marginTop:5 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
      {/* GOTY Race */}
      <GotyRace onGameClick={onGameClick} />
    </div>
  );
}

// ── MONTHLY WRAPPED ───────────────────────────────────────────────────────────
function WrappedModal({ user, logs, steamId, psnToken, xboxKey, onClose }) {
  const [slide,       setSlide]       = useState(0);
  const [steamGames,  setSteamGames]  = useState([]);
  const [psnTitles,   setPsnTitles]   = useState([]);
  const [xboxTitles,  setXboxTitles]  = useState([]);
  const [loading,     setLoading]     = useState(true);

  const now        = new Date();
  const monthName  = now.toLocaleString("default", { month: "long" });
  const year       = now.getFullYear();
  const monthStart = new Date(year, now.getMonth(), 1);

  // Logs for this month
  const monthLogs    = logs.filter(l => l.created_at && new Date(l.created_at) >= monthStart);
  const played       = monthLogs.filter(l => l.status === "played");
  const playing      = monthLogs.filter(l => l.status === "playing");
  const backlog      = monthLogs.filter(l => l.status === "want to play");
  const rated        = monthLogs.filter(l => l.rating > 0);
  const avgRating    = rated.length ? (rated.reduce((s,l)=>s+l.rating,0)/rated.length).toFixed(1) : null;
  const topGame      = rated.length ? [...rated].sort((a,b)=>b.rating-a.rating)[0] : monthLogs[0] || null;
  const genres       = [...new Set(monthLogs.map(l=>l.genre).filter(Boolean))];

  // Playtime from connected platforms
  const steamHours   = steamGames.reduce((s,g)=>s+(g.playtime_2weeks||0),0) / 60;

  const psnMonthGames = psnTitles.filter(t => {
    const d = t.lastPlayedDateTime ? new Date(t.lastPlayedDateTime) : null;
    return d && d >= monthStart;
  });
  const psnHours = psnMonthGames.reduce((s,t)=>{
    if (!t.playDuration) return s;
    const m = t.playDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (!m) return s;
    return s + parseInt(m[1]||"0") + parseInt(m[2]||"0")/60;
  }, 0);

  const xboxScore   = xboxTitles.reduce((s,t)=>s+(t.achievement?.currentGamerscore||0), 0);
  const totalHours  = Math.round(steamHours + psnHours);

  const platformBreakdown = [
    steamHours > 0    && { name:"Steam",        hours:Math.round(steamHours*10)/10,   color:C.blue  },
    psnHours   > 0    && { name:"PlayStation",  hours:Math.round(psnHours*10)/10,     color:"#003791" },
  ].filter(Boolean);

  useEffect(() => {
    const tasks = [];
    if (steamId) tasks.push(
      steamApi("recentlyplayed", steamId)
        .then(d => setSteamGames(d?.response?.games || []))
        .catch(()=>{})
    );
    if (psnToken) tasks.push(
      psnGetGames(psnToken)
        .then(d => setPsnTitles(d.titles || d.trophyTitles || []))
        .catch(()=>{})
    );
    if (xboxKey) tasks.push(
      xboxApi("titles", xboxKey)
        .then(d => setXboxTitles(d.titles || []))
        .catch(()=>{})
    );
    Promise.allSettled(tasks).then(()=>setLoading(false));
    if (!tasks.length) setLoading(false);
  }, []);

  const SLIDE_COUNT = 5;
  const SLIDE_BG = [
    `radial-gradient(ellipse 80% 50% at 50% 0%, ${C.blue}40, transparent 70%)`,
    `radial-gradient(ellipse 80% 50% at 50% 0%, ${C.green}35, transparent 70%)`,
    `radial-gradient(ellipse 80% 50% at 50% 0%, ${C.yellow}35, transparent 70%)`,
    `radial-gradient(ellipse 80% 50% at 50% 0%, ${C.blue}35, transparent 70%)`,
    `radial-gradient(ellipse 80% 50% at 50% 0%, ${C.pink}35, transparent 70%)`,
  ];

  function SlideContent() {
    switch (slide) {
      case 0:
        return (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", textAlign:"center", padding:"40px 28px" }}>
            <div style={{ fontSize:11, color:C.blue, letterSpacing:"3px", textTransform:"uppercase", marginBottom:18, fontWeight:600 }}>Monthly Recap</div>
            <div style={{ fontSize:"clamp(48px,12vw,80px)", fontWeight:700, letterSpacing:"-3px", lineHeight:0.95, marginBottom:10,
              background:`linear-gradient(135deg,${C.blue},${C.pink},${C.yellow})`,
              WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
              {monthName}
            </div>
            <div style={{ fontSize:20, fontWeight:500, color:"#666", marginBottom:8 }}>{year}</div>
            <div style={{ fontSize:13, color:C.muted, lineHeight:1.7, marginBottom:48 }}>Your gaming life, this month.</div>
            <button onClick={()=>setSlide(1)} style={{ padding:"15px 40px", borderRadius:100, border:"none",
              background:`linear-gradient(135deg,${C.blue},${C.pink})`, color:"#fff",
              fontWeight:600, fontSize:14, cursor:"pointer", letterSpacing:"0.5px" }}>
              See Your Stats →
            </button>
          </div>
        );

      case 1: {
        const bar = (val, max, color) => (
          <div style={{ flex:1, height:4, borderRadius:2, background:C.faint, overflow:"hidden" }}>
            <div style={{ width:`${max>0 ? (val/max)*100 : 0}%`, height:"100%", background:color, borderRadius:2, transition:"width .6s ease" }} />
          </div>
        );
        const maxVal = Math.max(played.length, playing.length, backlog.length, 1);
        return (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", textAlign:"center", padding:"40px 28px" }}>
            <div style={{ fontSize:10, color:C.muted, letterSpacing:"3px", textTransform:"uppercase", marginBottom:16 }}>Games Logged</div>
            <div style={{ fontSize:"clamp(80px,20vw,128px)", fontWeight:700, letterSpacing:"-5px", lineHeight:0.85, color:monthLogs.length>0?C.text:"#333", marginBottom:8 }}>
              {monthLogs.length}
            </div>
            <div style={{ fontSize:16, color:C.muted, marginBottom:36 }}>game{monthLogs.length!==1?"s":""} this month</div>
            <div style={{ width:"100%", display:"flex", flexDirection:"column", gap:14 }}>
              {[["Completed", played.length, C.green],["Playing", playing.length, C.blue],["Backlog", backlog.length, C.yellow]].map(([l,v,col])=>(
                <div key={l} style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ fontSize:10, color:col, fontWeight:600, letterSpacing:"1.5px", textTransform:"uppercase", width:72, textAlign:"right", flexShrink:0 }}>{l}</div>
                  {bar(v, maxVal, col)}
                  <div style={{ fontSize:20, fontWeight:700, color:col, width:28, textAlign:"left", flexShrink:0 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        );
      }

      case 2:
        return (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", textAlign:"center", padding:"40px 28px" }}>
            <div style={{ fontSize:10, color:C.yellow, letterSpacing:"3px", textTransform:"uppercase", marginBottom:18, fontWeight:600 }}>
              {topGame ? "Top Game" : "No games yet"}
            </div>
            {topGame ? (
              <>
                <div style={{ width:100, height:134, borderRadius:12, overflow:"hidden", marginBottom:20, boxShadow:`0 16px 48px ${C.blue}55, 0 0 0 1px ${C.border}` }}>
                  <Img src={topGame.cover} style={{ width:"100%", height:"100%" }} />
                </div>
                <div style={{ fontSize:"clamp(18px,4vw,24px)", fontWeight:600, letterSpacing:"-0.3px", marginBottom:8, maxWidth:260, lineHeight:1.2 }}>{topGame.title}</div>
                {topGame.rating > 0 && <div style={{ marginBottom:10 }}><Stars value={topGame.rating} size={20} /></div>}
                <div style={{ fontSize:11, color:C.muted }}>{topGame.year}{topGame.developer&&topGame.developer!=="Unknown"?` · ${topGame.developer}`:""}</div>
                {genres.length > 0 && (
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", justifyContent:"center", marginTop:16 }}>
                    {genres.slice(0,3).map(g=>(
                      <span key={g} style={{ fontSize:9, color:C.blue, background:`${C.blue}18`, border:`0.5px solid ${C.blue}33`, borderRadius:20, padding:"3px 10px", letterSpacing:"1px", textTransform:"uppercase" }}>{g}</span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize:14, color:C.muted, lineHeight:1.7 }}>Log and rate games<br/>to see your top pick.</div>
            )}
          </div>
        );

      case 3:
        return (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", textAlign:"center", padding:"40px 28px" }}>
            <div style={{ fontSize:10, color:C.muted, letterSpacing:"3px", textTransform:"uppercase", marginBottom:16 }}>Time Played</div>
            {loading ? (
              <div style={{ fontSize:11, color:"#444", letterSpacing:"2px" }}>Loading…</div>
            ) : platformBreakdown.length > 0 ? (
              <>
                <div style={{ fontSize:"clamp(64px,16vw,100px)", fontWeight:700, letterSpacing:"-4px", lineHeight:0.85,
                  background:`linear-gradient(135deg,${C.blue},${C.green})`,
                  WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", marginBottom:8 }}>
                  {totalHours}
                </div>
                <div style={{ fontSize:16, color:C.muted, marginBottom:40 }}>hours this month</div>
                <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
                  {platformBreakdown.map(p=>(
                    <div key={p.name} style={{ background:C.surface, border:`0.5px solid ${C.border}`, borderRadius:12, padding:"14px 20px" }}>
                      <div style={{ fontSize:24, fontWeight:700, color:p.color, letterSpacing:"-1px" }}>{p.hours}h</div>
                      <div style={{ fontSize:9, color:"#555", letterSpacing:"1.5px", textTransform:"uppercase", marginTop:4 }}>{p.name}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize:44, marginBottom:16 }}>⏱️</div>
                <div style={{ fontSize:14, color:C.muted, lineHeight:1.7 }}>Connect Steam or PlayStation<br/>to track playtime.</div>
              </>
            )}
          </div>
        );

      case 4: {
        const hasXbox = xboxScore > 0;
        return (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", textAlign:"center", padding:"40px 28px" }}>
            <div style={{ fontSize:10, color:C.pink, letterSpacing:"3px", textTransform:"uppercase", marginBottom:18, fontWeight:600 }}>Your Ratings</div>
            {avgRating ? (
              <>
                <div style={{ fontSize:"clamp(72px,18vw,112px)", fontWeight:700, letterSpacing:"-4px", lineHeight:0.85,
                  background:`linear-gradient(135deg,${C.yellow},${C.pink})`,
                  WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", marginBottom:8 }}>
                  {avgRating}
                </div>
                <div style={{ fontSize:16, color:C.muted, marginBottom:16 }}>avg rating out of 5</div>
                <div style={{ marginBottom:36 }}><Stars value={Math.round(Number(avgRating))} size={26} /></div>
              </>
            ) : (
              <div style={{ fontSize:14, color:C.muted, marginBottom:40 }}>Rate games to see your score!</div>
            )}
            {hasXbox && (
              <div style={{ background:C.surface, border:`0.5px solid rgba(16,124,16,.3)`, borderRadius:12, padding:"14px 28px" }}>
                <div style={{ fontSize:24, fontWeight:700, color:"#107c10", letterSpacing:"-0.5px" }}>{xboxScore.toLocaleString()}G</div>
                <div style={{ fontSize:9, color:"#555", letterSpacing:"1.5px", textTransform:"uppercase", marginTop:4 }}>Xbox Gamerscore</div>
              </div>
            )}
            <div style={{ position:"absolute", bottom:90, left:0, right:0, textAlign:"center" }}>
              <div style={{ fontSize:12, color:"#444" }}>That's your {monthName} in gaming 🎮</div>
            </div>
          </div>
        );
      }

      default: return null;
    }
  }

  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.92)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(20px)", padding:"0 16px" }}>
      <div style={{ width:"100%", maxWidth:400, height:"min(680px,92vh)", background:"#080808", borderRadius:24, border:`0.5px solid ${C.border}`, overflow:"hidden", position:"relative", display:"flex", flexDirection:"column" }}>
        <StripeBar height={3} />

        <button onClick={onClose} style={{ position:"absolute", top:14, right:14, background:"rgba(255,255,255,.07)", border:"none", color:C.muted, width:30, height:30, borderRadius:"50%", cursor:"pointer", fontSize:13, zIndex:10, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>

        {/* Ambient gradient per slide */}
        <div style={{ position:"absolute", inset:0, pointerEvents:"none", background:SLIDE_BG[slide], opacity:0.6, transition:"background .4s ease" }} />

        {/* Content */}
        <div style={{ flex:1, position:"relative", overflow:"hidden" }}>
          <SlideContent />
        </div>

        {/* Dot nav + prev/next */}
        <div style={{ padding:"12px 24px 22px", display:"flex", alignItems:"center", gap:10, position:"relative" }}>
          {slide > 0 && (
            <button onClick={()=>setSlide(s=>s-1)} style={{ background:"transparent", border:`0.5px solid ${C.border}`, color:C.muted, width:32, height:32, borderRadius:"50%", cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>‹</button>
          )}
          <div style={{ display:"flex", gap:5, flex:1, justifyContent:"center" }}>
            {Array.from({length:SLIDE_COUNT}).map((_,i)=>(
              <div key={i} onClick={()=>setSlide(i)}
                style={{ width:i===slide?18:6, height:6, borderRadius:3, background:i===slide?C.blue:C.border, transition:"all .2s", cursor:"pointer" }} />
            ))}
          </div>
          {slide < SLIDE_COUNT-1 && (
            <button onClick={()=>setSlide(s=>s+1)} style={{ background:C.blue, border:"none", color:"#fff", width:32, height:32, borderRadius:"50%", cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>›</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── HOME ──────────────────────────────────────────────────────────────────────
function HomeScreen({ games, logs, onGameClick, steamId, onConnectSteam, psnToken, onConnectPSN, xboxKey, onConnectXbox, isDesktop, user, onOpenWrapped }) {
  const vw      = useWindowWidth();
  const hasLogs = logs.length > 0;
  const played  = hasLogs ? logs.filter(g=>g.status==="played") : [];
  const playing = hasLogs ? logs.filter(g=>g.status==="playing") : [];
  const avgR    = played.filter(g=>g.rating>0).length
    ? (played.filter(g=>g.rating>0).reduce((a,g)=>a+g.rating,0)/played.filter(g=>g.rating>0).length).toFixed(1) : "—";
  const heroGame = hasLogs ? logs[0] : null;

  const SectionHead = ({ label }) => (
    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
      <div style={{ width:3, height:14, borderRadius:2, background:`linear-gradient(to bottom, ${C.blue}, ${C.pink})`, flexShrink:0 }} />
      <span style={{ fontSize:10, fontWeight:600, letterSpacing:"2.5px", color:"#666", textTransform:"uppercase" }}>{label}</span>
    </div>
  );

  const PLATFORM_CONNECT = [
    !steamId  && { label:"Steam",       desc:"Library & playtime",              color:"#1b9af0", bg:"rgba(27,40,56,.8)",     border:"#2a475e55", onClick:onConnectSteam,
      icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489l3.075-3.739A3.5 3.5 0 0 1 15.5 11h.5l3.739-3.075A9.956 9.956 0 0 0 12 2z" fill="#1b9af0"/><path d="M11.97 14.5A2.5 2.5 0 1 0 9.47 12" stroke="#fff" strokeWidth="1.5" fill="none"/></svg> },
    !psnToken && { label:"PlayStation",  desc:"Trophies & PS4/PS5 games",        color:"#0070d1", bg:"rgba(0,36,80,.7)",      border:"rgba(0,120,255,.2)", onClick:onConnectPSN,
      icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 4v13.5l3.3 1.1c2.2.7 3.7.5 3.7-1V6.5c0-1.5-1-2.2-2.2-1.7L9 4zm8.5 11.5c.5-.6.5-1.3.5-2h-1.8v1c0 .5-.3.9-.8.7l-1.9-.6v1.8l1.9.6c1.2.4 2.1.1 2.1-1.5z" fill="#0070d1"/></svg> },
    !xboxKey  && { label:"Xbox",         desc:"Game library & achievements",      color:"#107c10", bg:"rgba(16,60,16,.5)",     border:"rgba(16,124,16,.25)", onClick:onConnectXbox,
      icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#107c10" strokeWidth="1.5"/><path d="M8.5 8.5C9.8 7 11 6 12 6s2.2 1 3.5 2.5" stroke="#107c10" strokeWidth="1.3" strokeLinecap="round"/><path d="M6 10.5C7.5 9 9 7.5 10 7l4 10c-1.5 1-4 1.5-5.5.5L6 10.5z" fill="#107c10" opacity=".7"/><path d="M18 10.5c-1.5-1.5-3-3-4-3.5l-4 10c1.5 1 4 1.5 5.5.5L18 10.5z" fill="#107c10" opacity=".5"/></svg> },
  ].filter(Boolean);

  return (
    <div style={{ paddingBottom:90, color:C.text }}>

      {/* ── Cinematic Hero ── */}
      {hasLogs && heroGame ? (
        <div onClick={() => onGameClick(heroGame)} style={{ position:"relative", height:"clamp(400px,62vh,620px)", overflow:"hidden", cursor:"pointer" }}>
          <Img src={heroGame.hero || heroGame.cover} style={{ width:"100%", height:"115%", marginTop:"-5%", objectFit:"cover", filter:"brightness(.22) saturate(.9) contrast(1.15)" }} />
          {/* Side vignette + bottom fade */}
          <div style={{ position:"absolute", inset:0, background:"linear-gradient(to right, rgba(6,8,15,.92) 0%, rgba(6,8,15,.4) 55%, transparent 100%)" }} />
          <div style={{ position:"absolute", inset:0, background:`linear-gradient(to bottom, transparent 35%, ${C.bg} 100%)` }} />
          {/* Subtle top fade */}
          <div style={{ position:"absolute", top:0, left:0, right:0, height:120, background:"linear-gradient(to bottom, rgba(6,8,15,.6) 0%, transparent 100%)" }} />

          {/* Content */}
          <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"0 clamp(18px,5vw,48px) clamp(32px,7vh,56px)", maxWidth:620 }}>
            {/* Status glow badge */}
            {heroGame.status && (
              <div style={{ display:"inline-flex", alignItems:"center", gap:7, marginBottom:"clamp(10px,2vh,16px)" }}>
                <div style={{ width:6, height:6, borderRadius:"50%", background: SC[heroGame.status] || C.muted, boxShadow:`0 0 10px ${SC[heroGame.status] || C.muted}` }} />
                <span style={{ fontSize:9, letterSpacing:"3px", color: SC[heroGame.status] || C.muted, textTransform:"uppercase", fontWeight:600 }}>
                  {heroGame.status === "played" ? "Completed" : heroGame.status === "playing" ? "Now Playing" : heroGame.status === "want to play" ? "On Backlog" : heroGame.status}
                </span>
              </div>
            )}
            <div style={{ fontSize:"clamp(34px,7vw,60px)", fontWeight:600, lineHeight:1, letterSpacing:"-1.5px", marginBottom:"clamp(10px,2vh,18px)", textShadow:"0 2px 20px rgba(0,0,0,.5)" }}>
              {heroGame.title}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
              {heroGame.year && <span style={{ fontSize:12, color:"#666" }}>{heroGame.year}</span>}
              {heroGame.developer && heroGame.developer !== "Unknown" && (
                <><span style={{ color:"#2a2a2a" }}>·</span><span style={{ fontSize:12, color:"#666" }}>{heroGame.developer}</span></>
              )}
              {heroGame.rating > 0 && (
                <><span style={{ color:"#2a2a2a" }}>·</span><Stars value={heroGame.rating} size={12} /></>
              )}
            </div>
          </div>
        </div>
      ) : !hasLogs && (
        <div style={{ position:"relative", height:"clamp(420px,65vh,580px)", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center" }}>
          {/* Deep space background */}
          <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse 140% 100% at 50% 120%, #060d2e 0%, #050709 55%)" }} />
          {/* Nebula glows */}
          <div style={{ position:"absolute", top:"15%", left:"8%",  width:"clamp(200px,35vw,340px)", height:220, borderRadius:"50%", background:`radial-gradient(ellipse, ${C.blue}2a 0%, transparent 65%)`,  filter:"blur(50px)", pointerEvents:"none" }} />
          <div style={{ position:"absolute", bottom:"5%", right:"5%", width:"clamp(160px,28vw,280px)", height:180, borderRadius:"50%", background:`radial-gradient(ellipse, ${C.pink}22 0%, transparent 65%)`,  filter:"blur(40px)", pointerEvents:"none" }} />
          <div style={{ position:"absolute", top:"45%", right:"18%", width:160,  height:100, borderRadius:"50%", background:`radial-gradient(ellipse, ${C.yellow}18 0%, transparent 70%)`, filter:"blur(30px)", pointerEvents:"none" }} />
          {/* Retro grid overlay */}
          <div style={{ position:"absolute", inset:0, backgroundImage:"linear-gradient(rgba(34,85,204,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(34,85,204,.07) 1px, transparent 1px)", backgroundSize:"44px 44px", mixBlendMode:"screen", pointerEvents:"none" }} />
          {/* Orbit rings */}
          <div style={{ position:"absolute", width:"clamp(300px,55vw,520px)", height:"clamp(300px,55vw,520px)", borderRadius:"50%", border:"0.5px solid rgba(80,130,230,.12)", top:"50%", left:"50%", transform:"translate(-50%,-50%) rotateX(72deg)", pointerEvents:"none" }} />
          <div style={{ position:"absolute", width:"clamp(200px,36vw,350px)", height:"clamp(200px,36vw,350px)", borderRadius:"50%", border:"0.5px solid rgba(200,80,200,.10)", top:"50%", left:"50%", transform:"translate(-50%,-50%) rotateX(72deg) rotateZ(55deg)", pointerEvents:"none" }} />
          {/* Star dots */}
          {[{t:"12%",l:"22%",s:2,o:.5},{t:"28%",l:"72%",s:1.5,o:.4},{t:"60%",l:"12%",s:1.5,o:.35},{t:"18%",l:"55%",s:1,o:.3},{t:"75%",l:"65%",s:2,o:.4},{t:"40%",l:"88%",s:1,o:.25},{t:"8%",l:"42%",s:1.5,o:.3}].map((s,i) => (
            <div key={i} style={{ position:"absolute", top:s.t, left:s.l, width:s.s, height:s.s, borderRadius:"50%", background:"#fff", opacity:s.o, pointerEvents:"none" }} />
          ))}
          {/* Content */}
          <div style={{ position:"relative", textAlign:"center", padding:"0 clamp(24px,6vw,56px)", zIndex:1 }}>
            <div style={{ fontSize:"clamp(10px,1.6vw,12px)", letterSpacing:"6px", color:"#2a3a6a", textTransform:"uppercase", fontWeight:600, marginBottom:18 }}>Welcome to</div>
            <div style={{
              fontSize:"clamp(52px,13vw,110px)", fontWeight:800, letterSpacing:"-3px", lineHeight:1, marginBottom:14,
              background:`linear-gradient(135deg, #c8d8ff 0%, ${C.blue} 30%, #8855ff 55%, ${C.pink} 78%, #ffaacc 100%)`,
              WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text",
              filter:"drop-shadow(0 0 40px rgba(80,120,255,.35))",
            }}>KORTANA</div>
            <div style={{ fontSize:"clamp(9px,1.4vw,11px)", letterSpacing:"5px", color:"#2a3a5a", textTransform:"uppercase", fontWeight:500, marginBottom:28 }}>Game Universe Tracker</div>
            <div style={{ fontSize:"clamp(12px,1.8vw,14px)", color:"#3a4a6a", lineHeight:1.8, maxWidth:340, margin:"0 auto" }}>
              Browse 200K+ games — log what you play, track your backlog, and map your entire game universe.
            </div>
          </div>
          {/* Bottom fade into page bg */}
          <div style={{ position:"absolute", bottom:0, left:0, right:0, height:"clamp(60px,12vh,100px)", background:`linear-gradient(to top, ${C.bg} 0%, transparent 100%)`, pointerEvents:"none" }} />
        </div>
      )}

      {/* ── Stats strip ── */}
      {hasLogs && (
        <div style={{ display:"flex", borderBottom:`0.5px solid ${C.border}`, margin:"0 clamp(18px,5vw,48px)", paddingBottom:24, marginBottom:32 }}>
          {[["Played", played.length, C.green], ["Playing", playing.length, C.blue], ["Avg", avgR === "—" ? "—" : avgR + " ★", C.yellow]].map(([l, v, col]) => (
            <div key={l} style={{ flex:1, textAlign:"center" }}>
              <div style={{ fontSize:"clamp(24px,5vw,34px)", fontWeight:500, color:col, letterSpacing:"-0.5px", lineHeight:1 }}>{v}</div>
              <div style={{ fontSize:9, color:"#444", marginTop:6, letterSpacing:"2.5px", textTransform:"uppercase", fontWeight:500 }}>{l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Steam Now Playing */}
      <div style={{ padding:"0 clamp(18px,5vw,48px)" }}>
        <NowPlayingCard steamId={steamId} />
      </div>

      {/* ── Body ── */}
      <div style={{ padding:"0 clamp(18px,5vw,48px)" }}>

        {/* Now Playing spotlight */}
        {playing.length > 0 && (
          <div style={{ marginBottom:36 }}>
            <SectionHead label="Now Playing" />
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {playing.map(g => (
                <div key={g.id} onClick={() => onGameClick(g)} style={{ position:"relative", height:"clamp(100px,16vw,130px)", borderRadius:14, overflow:"hidden", cursor:"pointer" }}>
                  <Img src={g.hero || g.cover} style={{ width:"100%", height:"140%", marginTop:"-10%", objectFit:"cover", filter:"brightness(.3) saturate(.8)" }} />
                  <div style={{ position:"absolute", inset:0, background:"linear-gradient(to right, rgba(6,8,15,.95) 0%, rgba(6,8,15,.5) 50%, transparent 100%)" }} />
                  <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", padding:"0 20px" }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:9, letterSpacing:"2.5px", color:C.blue, textTransform:"uppercase", fontWeight:600, marginBottom:6 }}>Playing</div>
                      <div style={{ fontSize:"clamp(15px,3vw,20px)", fontWeight:600, letterSpacing:"-0.3px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{g.title}</div>
                      <div style={{ fontSize:11, color:"#555", marginTop:4 }}>{g.year}{g.developer && g.developer !== "Unknown" ? ` · ${g.developer}` : ""}</div>
                    </div>
                    {g.rating > 0 && <div style={{ flexShrink:0, marginLeft:12 }}><Stars value={g.rating} size={14} /></div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Monthly Wrapped */}
        <div style={{ marginBottom:36 }}>
          <div onClick={onOpenWrapped} style={{ position:"relative", borderRadius:16, overflow:"hidden", cursor:"pointer", padding:"clamp(18px,3vw,26px)", background:"linear-gradient(135deg, #0d0a22 0%, #0a1020 50%, #0a150d 100%)", border:"0.5px solid rgba(255,255,255,.05)", transition:"transform .15s" }}
            onMouseEnter={e=>e.currentTarget.style.transform="scale(1.01)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
            <div style={{ position:"absolute", top:-30, right:-20, width:140, height:140, borderRadius:"50%", background:`radial-gradient(circle, ${C.pink}35 0%, transparent 70%)`, pointerEvents:"none" }} />
            <div style={{ position:"absolute", bottom:-40, left:10, width:120, height:120, borderRadius:"50%", background:`radial-gradient(circle, ${C.blue}28 0%, transparent 70%)`, pointerEvents:"none" }} />
            <div style={{ position:"relative" }}>
              <div style={{ fontSize:9, color:"#555", letterSpacing:"3px", textTransform:"uppercase", fontWeight:600, marginBottom:8 }}>
                {new Date().toLocaleString("default", { month:"long" })} · Monthly Recap
              </div>
              <div style={{ fontSize:"clamp(18px,3.5vw,24px)", fontWeight:600, letterSpacing:"-0.4px", marginBottom:5 }}>Your Gaming Wrapped</div>
              <div style={{ fontSize:12, color:"#555" }}>Stats, top games & highlights →</div>
            </div>
          </div>
        </div>

        {/* Recently Logged */}
        <div style={{ marginBottom:36 }}>
          <SectionHead label="Recently Logged" />
          {hasLogs ? (
            <div style={{ display:"flex", gap:"clamp(10px,2vw,14px)", overflowX:"auto", paddingBottom:4, scrollSnapType:"x mandatory", marginLeft:"-clamp(18px,5vw,48px)", marginRight:"-clamp(18px,5vw,48px)", paddingLeft:"clamp(18px,5vw,48px)", paddingRight:"clamp(18px,5vw,48px)" }}>
              {[...logs].sort((a,b) => new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,10).map(g => (
                <div key={g.id} style={{ width:"clamp(160px,28vw,240px)", flexShrink:0, scrollSnapAlign:"start" }}>
                  <PosterCard game={g} onClick={onGameClick} />
                </div>
              ))}
            </div>
          ) : <Empty label="No games logged yet" />}
        </div>

        {/* Platform connect row — compact, only unconnected */}
        {PLATFORM_CONNECT.length > 0 && (
          <div style={{ marginBottom:36 }}>
            <SectionHead label="Connect Platforms" />
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {PLATFORM_CONNECT.map(p => (
                <div key={p.label} onClick={p.onClick} style={{ display:"flex", alignItems:"center", gap:14, padding:"clamp(13px,2.5vw,16px)", background:p.bg, borderRadius:12, border:`0.5px solid ${p.border}`, cursor:"pointer", transition:"opacity .15s" }}
                  onMouseEnter={e=>e.currentTarget.style.opacity="0.75"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                  <div style={{ width:36, height:36, borderRadius:9, background:"rgba(255,255,255,.05)", border:`0.5px solid ${p.color}33`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{p.icon}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:500, color:C.text, marginBottom:2 }}>{p.label}</div>
                    <div style={{ fontSize:11, color:"#555" }}>{p.desc}</div>
                  </div>
                  <div style={{ fontSize:16, color:p.color, opacity:.6, flexShrink:0 }}>›</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Steam Library */}
        {steamId && (
          <div style={{ marginBottom:36 }}>
            <SectionHead label="Steam Library" />
            <SteamLibraryStats steamId={steamId} />
          </div>
        )}

        {/* PlayStation Library */}
        {psnToken && (
          <div style={{ marginBottom:36 }}>
            <SectionHead label="PlayStation Library" />
            <PSNGamesRow accessToken={psnToken} onGameClick={onGameClick} />
          </div>
        )}

        {/* Xbox Library */}
        {xboxKey && (
          <div style={{ marginBottom:36 }}>
            <SectionHead label="Xbox Library" />
            <XboxGamesRow xboxKey={xboxKey} onGameClick={onGameClick} />
          </div>
        )}

        {!isDesktop && <NewsRow />}

        <div style={{ marginBottom:36 }}>
          <StorefrontDeals />
        </div>

        <div style={{ marginBottom:36 }}>
          <SectionHead label="New & Hot" />
          <NewAndHot onGameClick={onGameClick} />
        </div>

        <SteamRecentRow steamId={steamId} onGameClick={onGameClick} />

        {!isDesktop && (
          <div style={{ marginTop:36 }}>
            <GotyRace onGameClick={onGameClick} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── DIARY ─────────────────────────────────────────────────────────────────────
function DiaryScreen({ logs, onGameClick }) {
  const [filter, setFilter] = useState("all");
  const list = logs.filter(g=>filter==="all"||g.status===filter).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  return (
    <div style={{ paddingBottom:90, color:C.text }}>
      <div style={{ padding:"clamp(52px,12vh,72px) clamp(18px,5vw,48px) clamp(14px,3vh,20px)", position:"sticky", top:0, background:C.bg, zIndex:10, borderBottom:`0.5px solid ${C.border}` }}>
        <div style={{ fontSize:"clamp(20px,4vw,28px)", fontWeight:500, marginBottom:"clamp(14px,2vh,20px)", letterSpacing:"-0.3px" }}>Diary</div>
        <Pills items={["all","played","playing","want to play","dropped"]} active={filter} onSelect={setFilter} />
      </div>
      <div style={{ padding:"clamp(6px,1.5vh,12px) clamp(18px,5vw,48px) 0" }}>
        {list.map((g,i)=><DiaryRow key={g.id} game={g} index={i} onClick={onGameClick} />)}
        {list.length===0 && <Empty label="No diary entries yet" />}
      </div>
    </div>
  );
}

// ── BROWSE ────────────────────────────────────────────────────────────────────
const IGDB_PLATFORMS = "6,48,49,130,167,169,14"; // PC, PS4/5, XB1/XSX, Switch, Mac

const BROWSE_GENRES = [
  { name:"Action",     filter:"themes = (1)"   },
  { name:"RPG",        filter:"genres = (12)"  },
  { name:"Adventure",  filter:"genres = (31)"  },
  { name:"Horror",     filter:"themes = (19)"  },
  { name:"Strategy",   filter:"genres = (15)"  },
  { name:"Indie",      filter:"genres = (32)"  },
  { name:"Platformer", filter:"genres = (8)"   },
  { name:"Shooter",    filter:"genres = (5)"   },
  { name:"Fighting",   filter:"genres = (4)"   },
  { name:"Sports",     filter:"genres = (14)"  },
];

const BROWSE_DEVS = [
  "Nintendo", "Naughty Dog", "FromSoftware", "Rockstar Games",
  "CD Projekt Red", "Larian Studios", "Insomniac Games", "Valve",
  "Supergiant Games", "Bethesda Game Studios", "Square Enix", "Bandai Namco",
];

function GenreRow({ genre, onGameClick, onBrowseGenre }) {
  const [games, setGames] = useState([]);
  useEffect(() => {
    igdb("games", `
      fields id, name, first_release_date, cover.image_id, artworks.image_id,
        screenshots.image_id, genres.name,
        involved_companies.company.name, involved_companies.developer,
        external_games.uid, external_games.category, rating;
      where ${genre.filter} & platforms = (${IGDB_PLATFORMS}) & cover != null
        & version_parent = null & rating > 78 & rating_count > 400
        & first_release_date > 946684800;
      sort rating_count desc;
      limit 10;
    `)
      .then(data => {
        if (Array.isArray(data)) setGames(data.filter(g => g.cover?.image_id).map(normalizeIgdbGame));
      })
      .catch(() => {});
  }, [genre.name]);
  if (!games.length) return null;
  return (
    <div style={{ marginBottom:"clamp(24px,5vh,36px)" }}>
      <div onClick={() => onBrowseGenre(genre)} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"clamp(10px,2vh,14px)", cursor:"pointer" }}>
        <span style={{ fontSize:"clamp(15px,2.5vw,19px)", fontWeight:500, letterSpacing:"-0.2px" }}>{genre.name}</span>
        <span style={{ fontSize:11, color:C.muted, letterSpacing:"1px" }}>See all ›</span>
      </div>
      <div style={{ display:"flex", gap:"clamp(10px,2vw,14px)", overflowX:"auto", paddingBottom:8, scrollSnapType:"x mandatory", marginLeft:"-clamp(18px,5vw,48px)", marginRight:"-clamp(18px,5vw,48px)", paddingLeft:"clamp(18px,5vw,48px)", paddingRight:"clamp(18px,5vw,48px)" }}>
        {games.map(g => (
          <div key={g.id} style={{ width:"clamp(150px,26vw,200px)", flexShrink:0, scrollSnapAlign:"start" }}>
            <PosterCard game={g} onClick={onGameClick} />
          </div>
        ))}
      </div>
    </div>
  );
}

const ITAD_KEY = "804b64e3e8f12509ed083929448fc2fea70b77f8";



// ── STOREFRONT DEALS (ITAD multi-platform) ────────────────────────────────────
async function fetchItadDeals(shops) {
  const res = await fetch(IGDB_PROXY, {
    method: "POST", headers: PROXY_HEADERS,
    body: JSON.stringify({ endpoint: "itad/deals", shops }),
  });
  return res.json();
}

const STOREFRONT_TABS = [
  { key:"all",      label:"All",          shops:"",             color:C.muted    },
  { key:"steam",    label:"Steam",        shops:"steam",        color:"#1b9af0"  },
  { key:"psn",      label:"PlayStation",  shops:"psn",          color:"#003791"  },
  { key:"xbox",     label:"Xbox",         shops:"xboxgames",    color:"#107c10"  },
  { key:"nintendo", label:"Nintendo",     shops:"nintendo",     color:"#e60012"  },
  { key:"epic",     label:"Epic",         shops:"epicgames",    color:"#c7c7c7"  },
  { key:"gog",      label:"GOG",          shops:"gog",          color:"#86328a"  },
];

function StorefrontDeals() {
  // PSN is the default — best console deals; all tabs always visible regardless of account connection
  const [tab,     setTab]     = useState("psn");
  const [deals,   setDeals]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [cache,   setCache]   = useState({});

  const activeTab = STOREFRONT_TABS.find(t => t.key === tab) || STOREFRONT_TABS[0];

  useEffect(() => {
    if (cache[tab]) { setDeals(cache[tab]); return; }
    setLoading(true);
    fetchItadDeals(activeTab.shops)
      .then(raw => {
        const list = Array.isArray(raw) ? raw : (raw?.list || raw?.data?.list || []);
        const normalized = list
          .filter(d => (d.deal?.cut ?? d.price_cut ?? 0) >= 20)
          .slice(0, 24)
          .map(d => ({
            title:       d.title || d.plain || "",
            image:       d.assets?.banner300 || d.assets?.boxart || d.image || "",
            salePrice:   Number(d.deal?.price?.amount ?? d.price_new ?? 0).toFixed(2),
            normalPrice: Number(d.deal?.regular?.amount ?? d.price_old ?? 0).toFixed(2),
            cut:         Math.round(d.deal?.cut ?? d.price_cut ?? 0),
            url:         d.deal?.url ?? d.url ?? "#",
            store:       d.deal?.shop?.name ?? d.shop?.name ?? "Store",
            storeId:     d.deal?.shop?.id   ?? d.shop?.id   ?? "",
          }));
        setDeals(normalized);
        setCache(c => ({ ...c, [tab]: normalized }));
      })
      .catch(() => setDeals([]))
      .finally(() => setLoading(false));
  }, [tab]);

  const storeColor = id => ({
    steam: "#1b9af0", psn: "#003791", xboxgames: "#107c10",
    nintendo: "#e60012", epicgames: "#c7c7c7", gog: "#86328a",
  }[id] || C.muted);

  return (
    <div style={{ marginBottom:"clamp(24px,5vh,36px)" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"clamp(10px,2vh,14px)" }}>
        <span style={{ fontSize:"clamp(15px,2.5vw,19px)", fontWeight:500, letterSpacing:"-0.2px" }}>Storefront Deals</span>
      </div>

      <div style={{ display:"flex", gap:6, marginBottom:"clamp(10px,2vh,14px)", overflowX:"auto", paddingBottom:2 }}>
        {STOREFRONT_TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flexShrink:0, padding:"5px 14px", borderRadius:20, cursor:"pointer",
            border:`0.5px solid ${tab===t.key ? t.color : C.border}`,
            background: tab===t.key ? `${t.color}22` : "transparent",
            color: tab===t.key ? t.color : C.muted,
            fontSize:11, fontWeight:500, letterSpacing:"1px", textTransform:"uppercase", transition:"all .15s",
          }}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding:"24px 0", fontSize:11, color:"#444", letterSpacing:"2px", textTransform:"uppercase" }}>Loading deals…</div>
      ) : deals.length > 0 ? (
        <div style={{ display:"flex", gap:"clamp(10px,2vw,14px)", overflowX:"auto", paddingBottom:8, scrollSnapType:"x mandatory", marginLeft:"-clamp(18px,5vw,48px)", marginRight:"-clamp(18px,5vw,48px)", paddingLeft:"clamp(18px,5vw,48px)", paddingRight:"clamp(18px,5vw,48px)" }}>
          {deals.map((d,i) => (
            <a key={i} href={d.url} target="_blank" rel="noopener noreferrer"
              style={{ display:"block", width:"clamp(130px,20vw,165px)", flexShrink:0, scrollSnapAlign:"start", textDecoration:"none" }}>
              <div style={{ position:"relative", borderRadius:8, overflow:"hidden", boxShadow:"0 4px 20px rgba(0,0,0,.6)", aspectRatio:"2/3", background:C.surface }}>
                {d.image
                  ? <Img src={d.image} style={{ width:"100%", height:"100%" }} />
                  : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", padding:12 }}>
                      <span style={{ fontSize:10, color:"#555", textAlign:"center", lineHeight:1.4 }}>{d.title}</span>
                    </div>
                }
                <div style={{ position:"absolute", inset:0, background:"linear-gradient(to top, rgba(10,10,10,.96) 0%, rgba(10,10,10,.15) 55%, transparent 100%)" }} />
                <div style={{ position:"absolute", top:8, left:8, background:C.green, borderRadius:5, padding:"3px 7px", fontSize:10, fontWeight:700, color:"#000" }}>-{d.cut}%</div>
                <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"clamp(8px,2vw,11px)" }}>
                  <div style={{ fontSize:"clamp(10px,1.5vw,12px)", fontWeight:500, color:C.text, lineHeight:1.3, marginBottom:4, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.title}</div>
                  <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
                    <span style={{ fontSize:14, fontWeight:700, color:C.green }}>${d.salePrice}</span>
                    <span style={{ fontSize:10, color:"#555", textDecoration:"line-through" }}>${d.normalPrice}</span>
                  </div>
                  <div style={{ fontSize:9, marginTop:3, color:storeColor(d.storeId), fontWeight:500 }}>{d.store}</div>
                </div>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div style={{ padding:"24px 0", fontSize:11, color:"#444", letterSpacing:"2px", textTransform:"uppercase" }}>No deals right now</div>
      )}
    </div>
  );
}

const HOT_DEAL_TABS = [
  { key:"all",      label:"All",         shops:"",             color:C.green                                      },
  { key:"steam",    label:"Steam",       shops:"steam",        color:"#1b9af0", direct:"steam/store-deals"        },
  { key:"psn",      label:"PlayStation", shops:"psn",          color:"#003791", direct:"psn/store-deals"          },
  { key:"xbox",     label:"Xbox",        shops:"xboxgames",    color:"#107c10", direct:"xbox/store-deals"         },
  { key:"nintendo", label:"Nintendo",    shops:"nintendo",     color:"#e60012"                                    },
  { key:"epic",     label:"Epic",        shops:"epicgames",    color:"#c7c7c7", direct:"epic/store-deals"         },
];

const PLATFORM_ICON = {
  steam:      "🖥",
  psn:        "🎮",
  xboxgames:  "🟢",
  nintendo:   "🔴",
  epicgames:  "⚫",
  gog:        "🟣",
};

function DealsRow() {
  const [tab,     setTab]     = useState("all");
  const [deals,   setDeals]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [cache,   setCache]   = useState({});

  const activeTab = HOT_DEAL_TABS.find(t => t.key === tab);

  useEffect(() => {
    if (cache[tab]) { setDeals(cache[tab]); return; }
    setLoading(true);
    const normalizeItad = raw => {
      const list = Array.isArray(raw) ? raw : (raw?.list || raw?.data?.list || []);
      return list
        .filter(d => (d.deal?.cut ?? 0) > 0)
        .slice(0, 50)
        .map(d => ({
          title:       d.title || "",
          image:       d.assets?.boxart || d.assets?.banner300 || d.assets?.banner145 || "",
          salePrice:   Number(d.deal?.price?.amount ?? 0).toFixed(2),
          normalPrice: Number(d.deal?.regular?.amount ?? 0).toFixed(2),
          cut:         Math.round(d.deal?.cut ?? 0),
          url:         d.deal?.url ?? "#",
          store:       d.deal?.shop?.name ?? "Store",
          storeId:     d.deal?.shop?.id   ?? "",
          isAtLow:     d.deal?.flag === "K" || (d.deal?.price?.amount > 0 && d.deal?.historyLow?.amount > 0 && d.deal.price.amount <= d.deal.historyLow.amount),
        }));
    };
    const fetchDirect = endpoint =>
      fetch(IGDB_PROXY, { method:"POST", headers:PROXY_HEADERS, body:JSON.stringify({ endpoint }) }).then(r => r.json());
    const run = async () => {
      if (activeTab?.direct) {
        const raw = await fetchDirect(activeTab.direct).catch(() => []);
        if (Array.isArray(raw) && raw.length) return raw;
        // fall back to ITAD if direct returned empty
        const itad = await fetchItadDeals(activeTab.shops).catch(() => []);
        return normalizeItad(itad);
      }
      const raw = await fetchItadDeals(activeTab.shops);
      return normalizeItad(raw);
    };
    run()
      .then(normalized => { setDeals(normalized); setCache(c => ({ ...c, [tab]: normalized })); })
      .catch(() => setDeals([]))
      .finally(() => setLoading(false));
  }, [tab]);

  const maxCut = deals.length ? Math.max(...deals.map(d => d.cut)) : 0;
  const storeColor = id => HOT_DEAL_TABS.find(t => t.shops === id)?.color ?? C.muted;

  return (
    <div style={{ marginBottom:"clamp(24px,5vh,36px)" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"clamp(10px,2vh,14px)" }}>
        <span style={{ fontSize:"clamp(15px,2.5vw,19px)", fontWeight:500, letterSpacing:"-0.2px" }}>Hot Deals</span>
        {maxCut > 0 && !loading && <span style={{ fontSize:11, color:C.green, fontWeight:600 }}>Up to {maxCut}% off</span>}
      </div>

      {/* Platform tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:"clamp(10px,2vh,14px)", overflowX:"auto", paddingBottom:2 }}>
        {HOT_DEAL_TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flexShrink:0, padding:"5px 14px", borderRadius:20, cursor:"pointer",
            border:`0.5px solid ${tab===t.key ? t.color : C.border}`,
            background: tab===t.key ? `${t.color}22` : "transparent",
            color: tab===t.key ? t.color : C.muted,
            fontSize:11, fontWeight:500, letterSpacing:"1px", textTransform:"uppercase", transition:"all .15s",
          }}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding:"24px 0", fontSize:11, color:"#444", letterSpacing:"2px", textTransform:"uppercase" }}>Loading deals…</div>
      ) : deals.length > 0 ? (
        <div style={{ display:"flex", gap:"clamp(10px,2vw,14px)", overflowX:"auto", paddingBottom:8, scrollSnapType:"x mandatory", marginLeft:"-clamp(18px,5vw,48px)", marginRight:"-clamp(18px,5vw,48px)", paddingLeft:"clamp(18px,5vw,48px)", paddingRight:"clamp(18px,5vw,48px)" }}>
          {deals.map((d,i) => (
            <a key={i} href={d.url} target="_blank" rel="noopener noreferrer"
              style={{ display:"block", width:"clamp(130px,20vw,165px)", flexShrink:0, scrollSnapAlign:"start", textDecoration:"none" }}>
              <div style={{ position:"relative", borderRadius:8, overflow:"hidden", boxShadow:"0 4px 20px rgba(0,0,0,.6)", aspectRatio:"2/3", background:C.surface }}>
                {d.image
                  ? <Img src={d.image} style={{ width:"100%", height:"100%" }} />
                  : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", padding:"12px" }}>
                      <span style={{ fontSize:11, color:"#555", textAlign:"center", lineHeight:1.4 }}>{d.title}</span>
                    </div>
                }
                <div style={{ position:"absolute", inset:0, background:"linear-gradient(to top, rgba(10,10,10,.97) 0%, rgba(10,10,10,.1) 55%, transparent 100%)" }} />
                {/* Discount badge */}
                <div style={{ position:"absolute", top:8, left:8, background:C.green, borderRadius:5, padding:"3px 7px", fontSize:10, fontWeight:700, color:"#000" }}>-{d.cut}%</div>
                {/* ATL badge */}
                {d.isAtLow && <div style={{ position:"absolute", top:30, left:8, background:"#FAC000", borderRadius:5, padding:"2px 6px", fontSize:9, fontWeight:800, color:"#000", letterSpacing:"0.5px" }}>🔥 ATL</div>}
                {/* Platform badge */}
                <div style={{ position:"absolute", top:8, right:8, fontSize:13, lineHeight:1 }}>{PLATFORM_ICON[d.storeId] || "🎮"}</div>
                <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"clamp(8px,2vw,11px)" }}>
                  <div style={{ fontSize:"clamp(10px,1.5vw,12px)", fontWeight:500, color:C.text, lineHeight:1.3, marginBottom:5, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{d.title}</div>
                  <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
                    <span style={{ fontSize:14, fontWeight:700, color:C.green }}>${d.salePrice}</span>
                    <span style={{ fontSize:10, color:"#555", textDecoration:"line-through" }}>${d.normalPrice}</span>
                  </div>
                  <div style={{ fontSize:9, marginTop:3, color:storeColor(d.storeId), fontWeight:500, textTransform:"uppercase", letterSpacing:"0.5px" }}>{d.store}</div>
                </div>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div style={{ padding:"24px 0", fontSize:11, color:"#444", letterSpacing:"2px", textTransform:"uppercase" }}>No deals right now</div>
      )}
    </div>
  );
}

function RecommendFlow({ onClose, onGameClick }) {
  const [step, setStep] = useState(1);
  const [rateGames, setRateGames] = useState([]);
  const [ratings, setRatings] = useState({});
  const [pickedGenres, setPickedGenres] = useState([]);
  const [recGames, setRecGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (step !== 1) return;
    setLoading(true);
    igdb("games", `
      fields id, name, first_release_date, cover.image_id, artworks.image_id,
        screenshots.image_id, involved_companies.company.name, involved_companies.developer,
        external_games.uid, external_games.category, rating, rating_count;
      where rating_count > 500 & platforms = (${IGDB_PLATFORMS}) & cover != null
        & version_parent = null & rating > 85;
      sort rating_count desc;
      limit 12;
    `)
      .then(data => {
        if (Array.isArray(data)) { setRateGames(data.filter(g => g.cover?.image_id).map(normalizeIgdbGame)); }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [step]);

  useEffect(() => {
    if (step !== 3 || !pickedGenres.length) return;
    setLoading(true);
    const combined = pickedGenres.length === 1
      ? pickedGenres[0].filter
      : `(${pickedGenres.map(g => g.filter).join(" | ")})`;
    igdb("games", `
      fields id, name, first_release_date, cover.image_id, artworks.image_id,
        screenshots.image_id, genres.name,
        involved_companies.company.name, involved_companies.developer,
        external_games.uid, external_games.category, rating;
      where ${combined} & platforms = (${IGDB_PLATFORMS}) & cover != null
        & version_parent = null & rating > 75;
      sort rating desc;
      limit 20;
    `)
      .then(data => {
        if (Array.isArray(data)) { setRecGames(data.filter(g => g.cover?.image_id).map(normalizeIgdbGame)); }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [step, pickedGenres]);

  const ratedCount = Object.values(ratings).filter(v => v !== "skip").length;

  const RateCard = ({ game }) => {
    const r = ratings[game.id];
    return (
      <div style={{ display:"flex", gap:"clamp(12px,2vw,16px)", padding:"clamp(12px,2vh,14px)", background:r === "like" ? `${C.green}18` : r === "dislike" ? `${C.pink}18` : C.surface, borderRadius:12, border:`0.5px solid ${r === "like" ? C.green : r === "dislike" ? C.pink : C.border}`, transition:"all .15s", alignItems:"center" }}>
        <div style={{ width:48, height:48, borderRadius:8, overflow:"hidden", flexShrink:0 }}>
          <Img src={game.cover} style={{ width:"100%", height:"100%" }} />
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:500, marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{game.title}</div>
          <div style={{ fontSize:11, color:C.muted }}>{game.year}</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={() => setRatings(p => ({ ...p, [game.id]:"like" }))} style={{ background:r==="like"?C.green:"transparent", border:`0.5px solid ${r==="like"?C.green:C.border}`, borderRadius:8, width:36, height:36, fontSize:15, cursor:"pointer", transition:"all .15s" }}>👍</button>
          <button onClick={() => setRatings(p => ({ ...p, [game.id]:"dislike" }))} style={{ background:r==="dislike"?C.pink:"transparent", border:`0.5px solid ${r==="dislike"?C.pink:C.border}`, borderRadius:8, width:36, height:36, fontSize:15, cursor:"pointer", transition:"all .15s" }}>👎</button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.95)", zIndex:400, overflowY:"auto", backdropFilter:"blur(16px)" }}>
      <div style={{ maxWidth:500, margin:"0 auto", padding:"clamp(24px,5vw,48px) clamp(18px,5vw,24px)", minHeight:"100vh" }}>
        <button onClick={onClose} style={{ background:"none", border:"none", color:C.muted, fontSize:11, cursor:"pointer", padding:0, fontWeight:500, letterSpacing:"2px", textTransform:"uppercase", marginBottom:28 }}>✕ Close</button>

        {step === 1 && (
          <>
            <div style={{ fontSize:"clamp(18px,4vw,24px)", fontWeight:500, marginBottom:6, letterSpacing:"-0.3px" }}>Rate some games</div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:"clamp(16px,3vh,24px)" }}>Help us find your taste. Rate at least 3 to continue.</div>
            {loading
              ? <div style={{ textAlign:"center", padding:40, fontSize:11, color:"#444", letterSpacing:"2px" }}>Loading…</div>
              : <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:24 }}>
                  {rateGames.map(g => <RateCard key={g.id} game={g} />)}
                </div>
            }
            <button onClick={() => setStep(2)} disabled={ratedCount < 3} style={{ width:"100%", padding:"clamp(12px,2vh,15px)", borderRadius:10, border:"none", background:ratedCount >= 3 ? C.pink : "#222", color:ratedCount >= 3 ? "#fff" : C.muted, fontWeight:500, fontSize:14, cursor:ratedCount >= 3 ? "pointer" : "default", textTransform:"uppercase", letterSpacing:"1.5px", transition:"all .2s" }}>
              Next ({ratedCount} rated) ›
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ fontSize:"clamp(18px,4vw,24px)", fontWeight:500, marginBottom:6, letterSpacing:"-0.3px" }}>Pick your genres</div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:"clamp(16px,3vh,24px)" }}>Choose up to 5 genres you enjoy.</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginBottom:28 }}>
              {BROWSE_GENRES.map(g => {
                const on = pickedGenres.some(p => p.name === g.name);
                return (
                  <button key={g.name} onClick={() => { if (on) setPickedGenres(p => p.filter(x => x.name !== g.name)); else if (pickedGenres.length < 5) setPickedGenres(p => [...p, g]); }}
                    style={{ padding:"10px 20px", borderRadius:24, border:`0.5px solid ${on ? C.blue : C.border}`, background:on ? C.blue : "transparent", color:on ? "#fff" : C.muted, fontSize:13, fontWeight:500, cursor:"pointer", transition:"all .15s" }}>
                    {g.name}
                  </button>
                );
              })}
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setStep(1)} style={{ padding:"clamp(12px,2vh,15px) 20px", borderRadius:10, border:`0.5px solid ${C.border}`, background:"transparent", color:C.muted, fontWeight:500, fontSize:14, cursor:"pointer" }}>‹ Back</button>
              <button onClick={() => setStep(3)} disabled={!pickedGenres.length} style={{ flex:1, padding:"clamp(12px,2vh,15px)", borderRadius:10, border:"none", background:pickedGenres.length ? C.pink : "#222", color:pickedGenres.length ? "#fff" : C.muted, fontWeight:500, fontSize:14, cursor:pickedGenres.length ? "pointer" : "default", textTransform:"uppercase", letterSpacing:"1.5px", transition:"all .2s" }}>
                Find Games ›
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div style={{ fontSize:"clamp(18px,4vw,24px)", fontWeight:500, marginBottom:6, letterSpacing:"-0.3px" }}>Recommended for you</div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:"clamp(16px,3vh,24px)" }}>Based on your taste: {pickedGenres.map(g => g.name).join(", ")}.</div>
            {loading
              ? <div style={{ textAlign:"center", padding:40, fontSize:11, color:"#444", letterSpacing:"2px" }}>Finding games…</div>
              : <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:24 }}>
                  {recGames.map(g => (
                    <div key={g.id} onClick={() => onGameClick(g)} style={{ display:"flex", gap:"clamp(12px,2vw,16px)", padding:"clamp(12px,2vh,14px)", background:C.surface, borderRadius:12, border:`0.5px solid ${C.border}`, cursor:"pointer", alignItems:"center" }}>
                      <div style={{ width:52, height:52, borderRadius:8, overflow:"hidden", flexShrink:0 }}>
                        <Img src={g.cover} style={{ width:"100%", height:"100%" }} />
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:14, fontWeight:500, marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{g.title}</div>
                        <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>{g.year} · {g.genre}</div>
                        <Stars value={g.rating} size={11} />
                      </div>
                    </div>
                  ))}
                  {!recGames.length && <Empty label="No recommendations found" />}
                </div>
            }
            <button onClick={() => { setStep(1); setRatings({}); setPickedGenres([]); setRecGames([]); }} style={{ width:"100%", padding:"clamp(12px,2vh,15px)", borderRadius:10, border:`0.5px solid ${C.border}`, background:"transparent", color:C.muted, fontWeight:500, fontSize:14, cursor:"pointer" }}>Start Over</button>
          </>
        )}
      </div>
    </div>
  );
}

function BrowseScreen({ games, onGameClick }) {
  const [search,  setSearch]  = useState("");
  const [minYear, setMinYear] = useState(null);
  const [remoteResults, setRemoteResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [filterMode, setFilterMode] = useState(null); // { type:"genre"|"dev", name, slug? }
  const [filterGames, setFilterGames] = useState([]);
  const [filterLoading, setFilterLoading] = useState(false);
  const [showRecommend, setShowRecommend] = useState(false);

  const searchingOnline = search.trim().length > 0;

  useEffect(() => {
    const query = search.trim();
    if (!query) { setRemoteResults([]); setError(null); setLoading(false); return; }
    setLoading(true); setError(null);
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const yearClause = minYear
          ? `& first_release_date > ${Math.floor(new Date(`${minYear}-01-01`).getTime() / 1000)}`
          : "";
        const data = await igdb("games", `
          search "${query.replace(/"/g, '\\"')}";
          fields id, name, first_release_date, cover.image_id, artworks.image_id,
            screenshots.image_id, summary, genres.name,
            involved_companies.company.name, involved_companies.developer, involved_companies.publisher,
            external_games.uid, external_games.category,
            rating, aggregated_rating, rating_count, hypes;
          where cover != null & version_parent = null
            & (rating_count > 0 | hypes > 5)
            & involved_companies.developer = true
            ${yearClause};
          limit 10;
        `);
        if (!active) return;
        if (Array.isArray(data)) setRemoteResults(data.filter(g => g.cover?.image_id).map(normalizeIgdbGame));
        else setError("Search failed");
      } catch (err) {
        if (active) setError(err.message || "Unable to load results");
      } finally {
        if (active) setLoading(false);
      }
    }, 480);
    return () => { active = false; clearTimeout(timer); };
  }, [search, minYear]);

  useEffect(() => {
    if (!filterMode) { setFilterGames([]); return; }
    setFilterLoading(true); setFilterGames([]);
    let active = true;
    const run = async () => {
      try {
        let data;
        if (filterMode.type === "genre") {
          data = await igdb("games", `
            fields id, name, first_release_date, cover.image_id, artworks.image_id,
              screenshots.image_id, genres.name,
              involved_companies.company.name, involved_companies.developer,
              external_games.uid, external_games.category, rating;
            where ${filterMode.filter} & platforms = (${IGDB_PLATFORMS}) & cover != null
              & version_parent = null & rating > 74 & rating_count > 200;
            sort rating_count desc;
            limit 20;
          `);
        } else {
          const escaped = filterMode.name.replace(/"/g, '\\"');
          const target = filterMode.name.toLowerCase();
          // Use search (case-insensitive full-text) and validate results have real IDs
          const raw = await igdb("companies", `
            search "${escaped}";
            fields id, name;
            limit 15;
          `);
          const companies = Array.isArray(raw) ? raw.filter(c => c.id && c.name) : [];
          const exact = companies.filter(c => c.name.toLowerCase() === target);
          const pool  = exact.length ? exact : companies.slice(0, 3);
          const devIds = pool.map(c => c.id).filter(Boolean);
          if (!devIds.length) {
            data = [];
          } else {
            const ids = devIds.length > 1 ? `(${devIds.join(",")})` : String(devIds[0]);
            const res = await igdb("games", `
              fields id, name, first_release_date, cover.image_id, artworks.image_id,
                screenshots.image_id, genres.name,
                involved_companies.company.name, involved_companies.developer,
                external_games.uid, external_games.category, rating, rating_count;
              where involved_companies.company = ${ids} & cover != null;
              sort rating_count desc;
              limit 30;
            `);
            data = Array.isArray(res) ? res : [];
          }
        }
        if (active && Array.isArray(data))
          setFilterGames(data.filter(g => g.cover?.image_id).map(normalizeIgdbGame));
      } catch {}
      finally { if (active) setFilterLoading(false); }
    };
    run();
    return () => { active = false; };
  }, [filterMode]);

  const mcColor = mc => mc >= 90 ? C.yellow : mc >= 75 ? C.green : C.blue;
  const openGenre = genre => setFilterMode({ type:"genre", name:genre.name, filter:genre.filter });
  const openDev   = name  => setFilterMode({ type:"dev", name });
  const clearFilter = () => setFilterMode(null);

  return (
    <div style={{ paddingBottom:90, color:C.text }}>
      <div style={{ padding:"clamp(52px,12vh,72px) clamp(18px,5vw,48px) clamp(14px,3vh,20px)", position:"sticky", top:0, background:C.bg, zIndex:10, borderBottom:`0.5px solid ${C.border}` }}>
        {filterMode ? (
          <div>
            <button onClick={clearFilter} style={{ background:"none", border:"none", color:C.muted, fontSize:11, cursor:"pointer", padding:0, fontWeight:500, letterSpacing:"2px", textTransform:"uppercase", marginBottom:"clamp(10px,2vh,16px)" }}>‹ Browse</button>
            <div style={{ fontSize:"clamp(20px,4vw,28px)", fontWeight:500, letterSpacing:"-0.3px" }}>
              {filterMode.type === "genre" ? filterMode.name : `Games by ${filterMode.name}`}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ position:"relative", marginBottom:"clamp(12px,2vh,18px)" }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search games…"
                style={{ width:"100%", background:C.surface, border:`0.5px solid ${C.border}`, borderRadius:8, padding:"clamp(10px,2vh,13px) 14px", color:C.text, fontSize:14, outline:"none", boxSizing:"border-box" }} />
            </div>
            {searchingOnline && (
              <div style={{ display:"flex", flexDirection:"column", gap:"clamp(8px,1.5vh,10px)" }}>
                <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:2 }}>
                  {YEAR_OPTS.map(opt => {
                    const active = minYear === opt.value;
                    return (
                      <button key={opt.label} onClick={() => setMinYear(opt.value)} style={{ flexShrink:0, padding:"6px 14px", borderRadius:20, border:`0.5px solid ${active ? C.pink : C.border}`, cursor:"pointer", fontSize:11, fontWeight:500, letterSpacing:"1px", textTransform:"uppercase", background:active ? C.pink : "transparent", color:active ? "#fff" : C.muted, transition:"all .15s" }}>{opt.label}</button>
                    );
                  })}
                </div>
                <div style={{ fontSize:11, color:"#444", letterSpacing:"1px" }}>
                  {loading ? "Searching…" : error ? `Error: ${error}` : !remoteResults.length ? "" : `${remoteResults.length} result${remoteResults.length===1?"":"s"} · sorted by popularity`}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ padding:"clamp(14px,3vh,20px) clamp(18px,5vw,48px) 0" }}>
        {filterMode ? (
          <div>
            {filterLoading && <div style={{ padding:"40px 0", textAlign:"center", fontSize:11, color:"#444", letterSpacing:"2px", textTransform:"uppercase" }}>Loading…</div>}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(clamp(150px,24vw,200px),1fr))", gap:"clamp(10px,2vw,14px)" }}>
              {filterGames.map(g => <PosterCard key={g.id} game={g} onClick={onGameClick} />)}
            </div>
            {!filterLoading && !filterGames.length && <Empty label="No games found" />}
          </div>
        ) : searchingOnline ? (
          <div style={{ display:"flex", flexDirection:"column", gap:"clamp(10px,2vw,12px)" }}>
            {loading && !remoteResults.length && (
              <div style={{ padding:"40px 0", textAlign:"center" }}>
                <div style={{ fontSize:11, color:"#444", letterSpacing:"2px", textTransform:"uppercase" }}>Searching…</div>
              </div>
            )}
            {remoteResults.map(g => (
              <div key={g.id} style={{ display:"flex", gap:"clamp(12px,2vw,16px)", padding:"clamp(12px,2vh,16px)", background:C.surface, borderRadius:12, border:`0.5px solid ${C.border}`, cursor:"pointer" }}>
                <div onClick={() => onGameClick(g)} style={{ width:"clamp(56px,12vw,84px)", height:"clamp(74px,16vw,112px)", borderRadius:6, overflow:"hidden", flexShrink:0, background:C.faint }}>
                  <Img src={g.cover} style={{ width:"100%", height:"100%" }} />
                </div>
                <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", justifyContent:"space-between" }}>
                  <div onClick={() => onGameClick(g)}>
                    <div style={{ fontSize:"clamp(14px,2.5vw,16px)", fontWeight:500, marginBottom:4, lineHeight:1.3 }}>{g.title}</div>
                    <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>
                      {g.year || "—"}
                      {g.developer !== "Unknown" && (
                        <> · <span onClick={e => { e.stopPropagation(); openDev(g.developer); }} style={{ color:C.blue, cursor:"pointer" }}>{g.developer}</span></>
                      )}
                    </div>
                    <div style={{ fontSize:13, color:C.muted, lineHeight:1.6, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{g.desc}</div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:10, flexWrap:"wrap" }}>
                    {g.metacritic > 0 && (
                      <div style={{ display:"flex", alignItems:"center", gap:4, background:"rgba(0,0,0,.3)", border:`0.5px solid ${mcColor(g.metacritic)}33`, borderRadius:6, padding:"3px 8px" }}>
                        <span style={{ fontSize:12, fontWeight:500, color:mcColor(g.metacritic) }}>{g.metacritic}</span>
                        <span style={{ fontSize:9, color:"#444", textTransform:"uppercase", letterSpacing:"0.5px" }}>MC</span>
                      </div>
                    )}
                    {g.genre !== "Unknown" && (
                      <div onClick={e => { e.stopPropagation(); const match = BROWSE_GENRES.find(bg => bg.name.toLowerCase() === g.genre.toLowerCase()); if (match) openGenre(match); }}
                        style={{ fontSize:10, color:"#444", background:C.faint, borderRadius:4, padding:"3px 8px", letterSpacing:"0.5px", cursor:"pointer" }}>{g.genre}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {!loading && !remoteResults.length && !error && <Empty label="No results — try a different search or year filter" />}
          </div>
        ) : (
          <div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"clamp(16px,3vh,24px)" }}>
              <div style={{ fontSize:"clamp(20px,4vw,28px)", fontWeight:500, letterSpacing:"-0.3px" }}>Browse</div>
              <button onClick={() => setShowRecommend(true)} style={{ background:C.pink, border:"none", color:"#fff", padding:"8px 18px", borderRadius:20, fontSize:11, fontWeight:500, cursor:"pointer", letterSpacing:"1px", textTransform:"uppercase" }}>For You</button>
            </div>
            <DealsRow />
            {/* Developer pills */}
            <div style={{ marginBottom:"clamp(20px,4vh,32px)" }}>
              <div style={{ fontSize:10, color:"#444", letterSpacing:"2px", textTransform:"uppercase", marginBottom:10 }}>Developers</div>
              <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:6, marginLeft:"-clamp(18px,5vw,48px)", marginRight:"-clamp(18px,5vw,48px)", paddingLeft:"clamp(18px,5vw,48px)", paddingRight:"clamp(18px,5vw,48px)" }}>
                {BROWSE_DEVS.map(dev => (
                  <button key={dev} onClick={() => openDev(dev)} style={{ flexShrink:0, padding:"7px 16px", borderRadius:20, border:`0.5px solid ${C.border}`, background:"transparent", color:C.muted, fontSize:12, fontWeight:500, cursor:"pointer", transition:"all .15s", whiteSpace:"nowrap" }}>{dev}</button>
                ))}
              </div>
            </div>
            {BROWSE_GENRES.map(g => (
              <GenreRow key={g.name} genre={g} onGameClick={onGameClick} onBrowseGenre={openGenre} />
            ))}
          </div>
        )}
      </div>

      {showRecommend && <RecommendFlow onClose={() => setShowRecommend(false)} onGameClick={g => { setShowRecommend(false); onGameClick(g); }} />}
    </div>
  );
}

// ── SAVED LOGS ────────────────────────────────────────────────────────────────
function LogsScreen({ logs, loading }) {
  return (
    <div style={{ paddingBottom:90, color:C.text }}>
      <div style={{ padding:"clamp(52px,12vh,72px) clamp(18px,5vw,48px) clamp(14px,3vh,20px)", position:"sticky", top:0, background:C.bg, zIndex:10, borderBottom:`0.5px solid ${C.border}` }}>
        <div style={{ fontSize:"clamp(20px,4vw,28px)", fontWeight:500, marginBottom:6, letterSpacing:"-0.3px" }}>Saved Logs</div>
        <div style={{ fontSize:13, color:C.muted }}>Your game log entries synced from Supabase.</div>
      </div>
      <div style={{ padding:"clamp(14px,3vh,20px) clamp(18px,5vw,48px) 0" }}>
        {loading ? <Empty label="Loading…" /> : logs.length===0 ? <Empty label="No saved logs yet" /> : (
          <div style={{ display:"grid", gap:"clamp(8px,2vw,10px)" }}>
            {logs.map(log=>(
              <div key={log.id} style={{ display:"flex", gap:"clamp(12px,2vw,16px)", padding:"clamp(12px,2vh,16px)", borderRadius:12, background:C.surface, border:`0.5px solid ${C.border}` }}>
                <div style={{ width:"clamp(62px,12vw,90px)", height:"clamp(82px,14vw,120px)", borderRadius:6, overflow:"hidden", flexShrink:0, background:C.faint }}>
                  <Img src={log.cover} style={{ width:"100%", height:"100%" }} />
                </div>
                <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ fontSize:"clamp(13px,2.5vw,15px)", fontWeight:500, marginBottom:4 }}>{log.title}</div>
                    <div style={{ fontSize:12, color:C.muted, marginBottom:8 }}>{log.year||"—"} · {log.developer||"Unknown"}</div>
                    <div style={{ fontSize:13, color:C.muted, lineHeight:1.6, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{log.review||"No review yet."}</div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, marginTop:12 }}>
                    <span style={{ fontSize:10, fontWeight:500, color:SC[log.status]||C.muted, textTransform:"uppercase", letterSpacing:"1.5px" }}>{log.status||"Unknown"}</span>
                    <Stars value={log.rating||0} size={13} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── LISTS ─────────────────────────────────────────────────────────────────────
function ListsScreen({ lists, games, setLists, onGameClick }) {
  const [open,    setOpen]    = useState(null);
  const [editing, setEditing] = useState(false);
  const [adding,  setAdding]  = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const wide = useWindowWidth() >= 860;

  const iSt = { width:"100%", background:C.faint, border:`0.5px solid ${C.border}`, borderRadius:8, padding:"clamp(10px,2vh,13px) 14px", color:C.text, fontSize:14, outline:"none", boxSizing:"border-box" };

  const createList = () => {
    if (!newName.trim()) return;
    const l = { id:Date.now(), name:newName.trim(), desc:newDesc.trim(), gameIds:[] };
    setLists(p=>[...p,l]); setNewName(""); setNewDesc(""); setAdding(false); setOpen(l);
  };
  const updateList = u => { setLists(p=>p.map(l=>l.id===u.id?u:l)); setOpen(u); };
  const deleteList = id => { setLists(p=>p.filter(l=>l.id!==id)); setOpen(null); };

  if (open) {
    const listGames = games.filter(g=>open.gameIds.includes(g.id));
    const notIn     = games.filter(g=>!open.gameIds.includes(g.id));
    return (
      <div style={{ minHeight:"100vh", background:C.bg, color:C.text, paddingBottom:90 }}>
        <div style={{ padding:"clamp(52px,12vh,72px) clamp(18px,5vw,48px) clamp(16px,3vh,24px)", background:C.bg, position:"sticky", top:0, zIndex:10, borderBottom:`0.5px solid ${C.border}` }}>
          <button onClick={()=>{setOpen(null);setEditing(false);setAdding(false);}} style={{ background:"none", border:"none", color:C.muted, fontSize:11, cursor:"pointer", marginBottom:"clamp(12px,2vh,18px)", padding:0, fontWeight:500, letterSpacing:"2px", textTransform:"uppercase" }}>‹ Lists</button>
          {editing ? (
            <>
              <input value={open.name} onChange={e=>updateList({...open,name:e.target.value})} style={{...iSt,fontSize:"clamp(17px,3vw,22px)",fontWeight:500,marginBottom:10}} />
              <input value={open.desc||""} onChange={e=>updateList({...open,desc:e.target.value})} placeholder="Description…" style={{...iSt,marginBottom:"clamp(12px,2vh,16px)"}} />
              <div style={{ display:"flex", gap:8, marginTop:12 }}>
                <button onClick={()=>setEditing(false)} style={{ flex:1, padding:"clamp(10px,2vh,13px)", borderRadius:8, border:"none", background:C.pink, color:"#fff", fontWeight:500, cursor:"pointer", textTransform:"uppercase", letterSpacing:"1px", fontSize:13 }}>Done</button>
                <button onClick={()=>deleteList(open.id)} style={{ padding:"clamp(10px,2vh,13px) 16px", borderRadius:8, border:"none", background:"rgba(204,51,119,.12)", color:C.pink, fontWeight:500, cursor:"pointer", fontSize:13 }}>Delete</button>
              </div>
            </>
          ) : (
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:"clamp(20px,4vw,28px)", fontWeight:500, letterSpacing:"-0.3px" }}>{open.name}</div>
                {open.desc && <div style={{ fontSize:13, color:C.muted, marginTop:4 }}>{open.desc}</div>}
                <div style={{ fontSize:11, color:"#444", marginTop:6, letterSpacing:"1px" }}>{listGames.length} game{listGames.length!==1?"s":""}</div>
              </div>
              <button onClick={()=>setEditing(true)} style={{ background:"transparent", border:`0.5px solid ${C.border}`, color:C.muted, padding:"7px 16px", borderRadius:8, fontSize:11, fontWeight:500, cursor:"pointer", letterSpacing:"1.5px", textTransform:"uppercase" }}>Edit</button>
            </div>
          )}
        </div>
        <div style={{ padding:"clamp(8px,1.5vh,12px) clamp(18px,5vw,48px) 0" }}>
          {listGames.map((g,i)=>(
            <div key={g.id} style={{ display:"flex", alignItems:"center" }}>
              <div style={{ flex:1 }}><DiaryRow game={g} index={i} onClick={onGameClick} /></div>
              <button onClick={()=>updateList({...open,gameIds:open.gameIds.filter(id=>id!==g.id)})} style={{ background:"none", border:"none", color:"#444", fontSize:16, cursor:"pointer", padding:"0 4px" }}>✕</button>
            </div>
          ))}
          {listGames.length===0 && <Empty label="No games in this list" />}
        </div>
        <div style={{ padding:"0 clamp(18px,5vw,48px)", marginTop:16 }}>
          {!adding ? (
            <button onClick={()=>setAdding(true)} style={{ width:"100%", padding:"clamp(12px,2vh,15px)", borderRadius:8, border:`0.5px dashed ${C.border}`, background:"transparent", color:C.muted, fontSize:13, fontWeight:500, cursor:"pointer", letterSpacing:"1px", textTransform:"uppercase" }}>+ Add a Game</button>
          ) : (
            <div>
              <div style={{ fontSize:10, color:"#444", letterSpacing:"2px", textTransform:"uppercase", marginBottom:12 }}>Add to list</div>
              {notIn.map(g=>(
                <div key={g.id} onClick={()=>updateList({...open,gameIds:[...open.gameIds,g.id]})}
                  style={{ display:"flex", alignItems:"center", gap:"clamp(12px,2vw,16px)", padding:"clamp(11px,2vh,14px) 0", borderBottom:`0.5px solid ${C.border}`, cursor:"pointer" }}>
                  <div style={{ width:"clamp(36px,7vw,48px)", height:"clamp(48px,10vw,64px)", borderRadius:6, overflow:"hidden", flexShrink:0 }}>
                    <Img src={g.cover} style={{ width:"100%", height:"100%" }} />
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:"clamp(13px,2.5vw,15px)", fontWeight:500 }}>{g.title}</div>
                    <div style={{ fontSize:12, color:C.muted }}>{g.year} · {g.genre}</div>
                  </div>
                  <span style={{ fontSize:18, color:C.blue }}>+</span>
                </div>
              ))}
              {notIn.length===0 && <div style={{ fontSize:13, color:C.muted, textAlign:"center", padding:"20px 0" }}>All games added</div>}
              <button onClick={()=>setAdding(false)} style={{ width:"100%", marginTop:14, padding:"clamp(12px,2vh,13px)", borderRadius:8, border:"none", background:C.faint, color:C.muted, fontWeight:500, cursor:"pointer", textTransform:"uppercase", letterSpacing:"1px", fontSize:13 }}>Done</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom:90, color:C.text }}>
      <div style={{ padding:"clamp(52px,12vh,72px) clamp(18px,5vw,48px) clamp(20px,4vh,28px)" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
          <div style={{ fontSize:"clamp(20px,4vw,28px)", fontWeight:500, letterSpacing:"-0.3px" }}>Your Lists</div>
          <button onClick={()=>setAdding(true)} style={{ background:C.pink, border:"none", color:"#fff", padding:"8px 18px", borderRadius:20, fontSize:11, fontWeight:500, cursor:"pointer", letterSpacing:"1px", textTransform:"uppercase" }}>+ New</button>
        </div>
        {adding && (
          <div style={{ background:C.surface, border:`0.5px solid ${C.border}`, borderRadius:12, padding:"clamp(16px,3vw,22px)", marginTop:16, marginBottom:8 }}>
            <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="List name…" style={{...iSt,fontSize:"clamp(15px,2.5vw,17px)",fontWeight:500,marginBottom:10}} />
            <input value={newDesc} onChange={e=>setNewDesc(e.target.value)} placeholder="Description (optional)…" style={{...iSt,marginBottom:"clamp(12px,2vh,16px)"}} />
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={createList} style={{ flex:1, padding:"clamp(12px,2vh,13px)", borderRadius:8, border:"none", background:C.pink, color:"#fff", fontWeight:500, cursor:"pointer", textTransform:"uppercase", letterSpacing:"1px", fontSize:13 }}>Create</button>
              <button onClick={()=>{setAdding(false);setNewName("");setNewDesc("");}} style={{ padding:"clamp(12px,2vh,13px) 16px", borderRadius:8, border:"none", background:C.faint, color:C.muted, fontWeight:500, cursor:"pointer", fontSize:13 }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
      <div style={{ display: wide?"grid":"block", gridTemplateColumns: wide?"1fr 240px":"1fr", gap: wide?40:0, padding:"0 clamp(18px,5vw,48px)", alignItems:"start" }}>
        <div>
          {lists.length===0&&!adding && <Empty label="Create your first list" />}
          {lists.map(list=>{
            const covers = games.filter(g=>list.gameIds.slice(0,3).includes(g.id));
            return (
              <div key={list.id} onClick={()=>{setOpen(list);setEditing(false);setAdding(false);}}
                style={{ display:"flex", alignItems:"center", gap:"clamp(12px,2vw,18px)", padding:"clamp(14px,2vh,18px) 0", borderBottom:`0.5px solid ${C.border}`, cursor:"pointer" }}>
                <div style={{ display:"flex", gap:"clamp(3px,0.5vw,5px)", flexShrink:0 }}>
                  {[0,1,2].map(i=>(
                    <div key={i} style={{ width:"clamp(36px,7vw,52px)", height:"clamp(36px,7vw,52px)", borderRadius:6, overflow:"hidden", background:C.surface, border:`0.5px solid ${C.border}` }}>
                      {covers[i] && <Img src={covers[i].cover} style={{ width:"100%", height:"100%" }} />}
                    </div>
                  ))}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:"clamp(14px,2.5vw,16px)", fontWeight:500 }}>{list.name}</div>
                  {list.desc && <div style={{ fontSize:12, color:C.muted, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{list.desc}</div>}
                  <div style={{ fontSize:11, color:"#444", marginTop:4, letterSpacing:"1px" }}>{list.gameIds.length} game{list.gameIds.length!==1?"s":""}</div>
                </div>
                <div style={{ color:C.blue, fontSize:18 }}>›</div>
              </div>
            );
          })}
        </div>
        <div style={{ position: wide?"sticky":"static", top:80, paddingTop: wide?0:32 }}>
          <GotyHistory onGameClick={onGameClick} />
        </div>
      </div>
    </div>
  );
}

// ── SETTINGS ─────────────────────────────────────────────────────────────────
function UserAvatar({ initial, photoUrl, size=34 }) {
  const [err, setErr] = useState(false);
  return photoUrl && !err
    ? <img src={photoUrl} onError={()=>setErr(true)} style={{ width:size, height:size, borderRadius:"50%", objectFit:"cover", border:`0.5px solid ${C.border}`, flexShrink:0, display:"block" }} alt="" />
    : <div style={{ width:size, height:size, borderRadius:"50%", background:C.blue, display:"flex", alignItems:"center", justifyContent:"center", fontSize:Math.round(size*.38), fontWeight:500, color:"#fff", flexShrink:0 }}>{initial}</div>;
}

function SettingsDropdown({ user, displayName, photoUrl, onAccount, onFriends, onSignOut }) {
  const initial = (displayName || user.email)[0].toUpperCase();
  const Item = ({ label, onClick, color }) => (
    <button onClick={onClick} style={{ width:"100%", padding:"12px 16px", background:"none", border:"none", cursor:"pointer", textAlign:"left", fontSize:13, fontWeight:500, color:color||C.text, display:"block", transition:"background .1s" }}>{label}</button>
  );
  return (
    <div style={{ position:"absolute", top:"calc(100% + 10px)", right:0, zIndex:300, background:C.surface, border:`0.5px solid ${C.border}`, borderRadius:12, minWidth:230, overflow:"hidden", boxShadow:"0 20px 60px rgba(0,0,0,.7)", animation:"fadeUp .15s ease" }}>
      <div style={{ padding:"14px 16px", borderBottom:`0.5px solid ${C.border}`, display:"flex", alignItems:"center", gap:12 }}>
        <UserAvatar initial={initial} photoUrl={photoUrl} size={38} />
        <div style={{ minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:500, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{displayName || "Set a username"}</div>
          <div style={{ fontSize:11, color:"#444", marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.email}</div>
        </div>
      </div>
      <div style={{ padding:"6px 0" }}>
        <Item label="Account" onClick={onAccount} />
        <Item label="Friends" onClick={onFriends} />
      </div>
      <div style={{ borderTop:`0.5px solid ${C.border}`, padding:"6px 0" }}>
        <Item label="Sign Out" onClick={onSignOut} color={C.pink} />
      </div>
    </div>
  );
}

function AccountModal({ user, displayName, photoUrl, setDisplayName, setPhotoUrl, steamId, setSteamId, onClose }) {
  const [name,    setName]    = useState(displayName);
  const [url,     setUrl]     = useState(photoUrl);
  const [sid,     setSid]     = useState(steamId || "");
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState("");
  const initial = (name || user.email)[0].toUpperCase();

  const save = async () => {
    setSaving(true); setMsg("");
    const { error } = await supabase.auth.updateUser({
      data: { display_name: name.trim(), avatar_url: url.trim(), steam_id: sid.trim() },
    });
    if (error) setMsg(error.message);
    else {
      setDisplayName(name.trim());
      setPhotoUrl(url.trim());
      setSteamId(sid.trim());
      setMsg("Saved.");
    }
    setSaving(false);
  };

  const inp = { width:"100%", background:C.faint, border:`0.5px solid ${C.border}`, borderRadius:8, padding:"12px 14px", color:C.text, fontSize:14, outline:"none", boxSizing:"border-box" };

  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.82)", zIndex:400, display:"flex", alignItems:"flex-end", justifyContent:"center", backdropFilter:"blur(12px)" }}>
      <div style={{ background:C.surface, borderRadius:"16px 16px 0 0", width:"100%", maxWidth:440, paddingBottom:40, border:`0.5px solid ${C.border}`, borderBottom:"none", animation:"slideUp .22s ease", overflow:"hidden" }}>
        <StripeBar height={3} />
        <div style={{ display:"flex", justifyContent:"center", padding:"14px 0 6px" }}>
          <div style={{ width:36, height:3, borderRadius:2, background:C.border }} />
        </div>
        <div style={{ padding:"4px 24px 0" }}>
          <div style={{ fontSize:17, fontWeight:500, letterSpacing:"-0.3px", marginBottom:28 }}>Account</div>
          <div style={{ display:"flex", justifyContent:"center", marginBottom:28 }}>
            <UserAvatar initial={initial} photoUrl={url} size={72} />
          </div>
          <div style={{ display:"grid", gap:16 }}>
            <div>
              <div style={{ fontSize:10, color:"#444", letterSpacing:"2px", textTransform:"uppercase", marginBottom:8 }}>Display Name</div>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" style={inp} />
            </div>
            <div>
              <div style={{ fontSize:10, color:"#444", letterSpacing:"2px", textTransform:"uppercase", marginBottom:8 }}>Profile Photo URL</div>
              <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://…" style={inp} />
            </div>
            <div>
              <div style={{ fontSize:10, color:"#444", letterSpacing:"2px", textTransform:"uppercase", marginBottom:8 }}>Steam ID</div>
              {sid ? (
                <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", background:C.faint, borderRadius:8, border:`0.5px solid ${C.green}44` }}>
                  <div style={{ flex:1, fontSize:13, color:C.text, fontFamily:"monospace" }}>{sid}</div>
                  <button onClick={()=>setSid("")} style={{ background:"none", border:"none", color:"#444", fontSize:11, cursor:"pointer", fontWeight:500, letterSpacing:"1px", textTransform:"uppercase", padding:0, flexShrink:0 }}>Disconnect</button>
                </div>
              ) : (
                <input value={sid} onChange={e=>setSid(e.target.value)} placeholder="76561198xxxxxxxxx" maxLength={17} style={inp} />
              )}
              {!sid && <div style={{ fontSize:11, color:"#444", marginTop:5 }}>Find yours at steamidfinder.com</div>}
            </div>
            {msg && <div style={{ fontSize:13, color: msg==="Saved." ? C.green : C.pink }}>{msg}</div>}
            <button onClick={save} disabled={saving} style={{ width:"100%", padding:14, borderRadius:8, border:"none", background:C.pink, color:"#fff", fontWeight:500, fontSize:14, cursor:"pointer", textTransform:"uppercase", letterSpacing:"1.5px" }}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FriendsModal({ onClose }) {
  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.82)", zIndex:400, display:"flex", alignItems:"flex-end", justifyContent:"center", backdropFilter:"blur(12px)" }}>
      <div style={{ background:C.surface, borderRadius:"16px 16px 0 0", width:"100%", maxWidth:440, paddingBottom:40, border:`0.5px solid ${C.border}`, borderBottom:"none", animation:"slideUp .22s ease", overflow:"hidden" }}>
        <StripeBar height={3} />
        <div style={{ display:"flex", justifyContent:"center", padding:"14px 0 6px" }}>
          <div style={{ width:36, height:3, borderRadius:2, background:C.border }} />
        </div>
        <div style={{ padding:"4px 24px 0" }}>
          <div style={{ fontSize:17, fontWeight:500, letterSpacing:"-0.3px", marginBottom:8 }}>Friends</div>
          <div style={{ fontSize:13, color:C.muted, marginBottom:40, lineHeight:1.6 }}>See what your friends are playing. Coming soon.</div>
          <Empty label="No friends yet" />
        </div>
      </div>
    </div>
  );
}

// ── FAVORITE PICKER ───────────────────────────────────────────────────────────
function FavoritePicker({ onPick, onClose }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if (!query) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await igdb("games", `
          search "${query.replace(/"/g, '\\"')}";
          fields id, name, cover.image_id, first_release_date;
          where cover != null & version_parent = null & (rating_count > 0 | hypes > 5);
          limit 8;
        `);
        setResults(Array.isArray(data) ? data.filter(g => g.cover?.image_id) : []);
      } catch {}
      setLoading(false);
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.88)", zIndex:500, display:"flex", alignItems:"flex-end", justifyContent:"center", backdropFilter:"blur(16px)" }}>
      <div style={{ background:C.surface, borderRadius:"16px 16px 0 0", width:"100%", maxWidth:480, paddingBottom:40, border:`0.5px solid ${C.border}`, borderBottom:"none", animation:"slideUp .22s ease", overflow:"hidden", maxHeight:"85vh", display:"flex", flexDirection:"column" }}>
        <StripeBar height={3} />
        <div style={{ display:"flex", justifyContent:"center", padding:"12px 0 8px" }}>
          <div style={{ width:36, height:3, borderRadius:2, background:C.border }} />
        </div>
        <div style={{ padding:"0 20px 14px" }}>
          <div style={{ fontSize:13, fontWeight:500, color:"#666", letterSpacing:"2px", textTransform:"uppercase", marginBottom:14 }}>Add to Top 5</div>
          <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search any game…"
            style={{ width:"100%", background:C.faint, border:`0.5px solid ${C.border}`, borderRadius:8, padding:"12px 14px", color:C.text, fontSize:14, outline:"none", boxSizing:"border-box" }} />
        </div>
        <div style={{ overflowY:"auto", flex:1 }}>
          {loading && <div style={{ padding:"20px", textAlign:"center", fontSize:11, color:"#444", letterSpacing:"2px" }}>Searching…</div>}
          {!loading && results.map(g => (
            <div key={g.id} onClick={() => onPick({ id:g.id, title:g.name, cover:igdbImg(g.cover.image_id, "cover_big_2x") })}
              style={{ display:"flex", gap:14, padding:"12px 20px", borderBottom:`0.5px solid ${C.border}`, cursor:"pointer", alignItems:"center", transition:"background .1s" }}
              onMouseEnter={e=>e.currentTarget.style.background=C.faint}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{ width:38, height:50, borderRadius:4, overflow:"hidden", flexShrink:0, background:C.faint }}>
                <img src={igdbImg(g.cover.image_id, "cover_big_2x")} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
              </div>
              <div>
                <div style={{ fontSize:13, fontWeight:500, color:C.text }}>{g.name}</div>
                {g.first_release_date && <div style={{ fontSize:11, color:"#555", marginTop:2 }}>{new Date(g.first_release_date*1000).getFullYear()}</div>}
              </div>
            </div>
          ))}
          {!loading && q.trim() && !results.length && <div style={{ padding:"20px", textAlign:"center", fontSize:11, color:"#444", letterSpacing:"2px" }}>No results</div>}
          {!q.trim() && <div style={{ padding:"20px", textAlign:"center", fontSize:11, color:"#333", letterSpacing:"1.5px" }}>Type a game title to search</div>}
        </div>
      </div>
    </div>
  );
}

// ── ONBOARDING ────────────────────────────────────────────────────────────────
function OnboardingFlow({ user, onDone }) {
  const [step, setStep] = useState(0);
  const [games, setGames] = useState([]);
  const [ratings, setRatings] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (step !== 1) return;
    setLoading(true);
    igdb("games", `
      fields id, name, cover.image_id, artworks.image_id, screenshots.image_id,
        involved_companies.company.name, involved_companies.developer,
        external_games.uid, external_games.category, rating, rating_count;
      where rating_count > 1000 & platforms = (${IGDB_PLATFORMS}) & cover != null
        & version_parent = null & rating > 85;
      sort rating_count desc;
      limit 15;
    `).then(data => {
      if (Array.isArray(data)) setGames(data.filter(g=>g.cover?.image_id).map(normalizeIgdbGame));
      setLoading(false);
    }).catch(()=>setLoading(false));
  }, [step]);

  const rated = Object.values(ratings).filter(v=>v>0).length;
  const finish = () => {
    localStorage.setItem(`kortana_onboarded_${user.id}`, "1");
    onDone();
  };

  if (step === 0) return (
    <div style={{ position:"fixed", inset:0, background:C.bg, zIndex:600, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"clamp(24px,6vw,60px)" }}>
      <div style={{ position:"absolute", inset:0, backgroundImage:`linear-gradient(${C.border} 1px,transparent 1px),linear-gradient(90deg,${C.border} 1px,transparent 1px)`, backgroundSize:"60px 60px", opacity:0.2 }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:"50%", background:`radial-gradient(ellipse 80% 60% at 50% 0%, ${C.blue}30, transparent 70%)`, pointerEvents:"none" }} />
      <div style={{ position:"relative", zIndex:1, textAlign:"center", maxWidth:400 }}>
        <svg width="64" height="64" viewBox="0 0 110 110" fill="none" style={{ marginBottom:24 }}>
          <path d="M16 10 L16 100 L34 100 L34 62 L68 100 L92 100 L54 55 L90 10 L66 10 L34 46 L34 10 Z" fill="none" stroke={C.blue} strokeWidth="5"/>
          <path d="M90 10 L54 55" stroke={C.pink} strokeWidth="5" fill="none"/>
          <path d="M34 62 L68 100 L92 100" stroke={C.yellow} strokeWidth="5" fill="none"/>
          <path d="M54 55 L92 100" stroke={C.green} strokeWidth="5" fill="none"/>
        </svg>
        <div style={{ fontSize:"clamp(28px,6vw,40px)", fontWeight:600, letterSpacing:"-1px", marginBottom:12 }}>Welcome to Kortana</div>
        <div style={{ fontSize:15, color:C.muted, lineHeight:1.7, marginBottom:40 }}>Your gaming life, all in one place. Track what you play, discover what's next, and build your collection.</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:40, textAlign:"left" }}>
          {[["📖","Diary","Log every game you play"],["⭐","Rate","Rate and review your games"],["🔍","Discover","Browse top games by genre"],["📋","Lists","Build custom game collections"]].map(([icon,title,desc])=>(
            <div key={title} style={{ background:C.surface, borderRadius:12, padding:"16px 14px", border:`0.5px solid ${C.border}` }}>
              <div style={{ fontSize:20, marginBottom:6 }}>{icon}</div>
              <div style={{ fontSize:13, fontWeight:500, color:C.text, marginBottom:3 }}>{title}</div>
              <div style={{ fontSize:11, color:"#555", lineHeight:1.4 }}>{desc}</div>
            </div>
          ))}
        </div>
        <button onClick={()=>setStep(1)} style={{ width:"100%", padding:"16px 0", borderRadius:12, border:"none", background:`linear-gradient(135deg,${C.blue},${C.pink})`, color:"#fff", fontWeight:600, fontSize:15, cursor:"pointer", letterSpacing:"0.5px" }}>
          Let's Go →
        </button>
        <button onClick={finish} style={{ marginTop:14, background:"none", border:"none", color:"#444", fontSize:12, cursor:"pointer", letterSpacing:"1px" }}>Skip for now</button>
      </div>
    </div>
  );

  return (
    <div style={{ position:"fixed", inset:0, background:C.bg, zIndex:600, overflowY:"auto" }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:"30%", background:`radial-gradient(ellipse 80% 60% at 50% 0%, ${C.pink}20, transparent 70%)`, pointerEvents:"none" }} />
      <div style={{ position:"relative", zIndex:1, maxWidth:540, margin:"0 auto", padding:"clamp(24px,6vw,60px) clamp(20px,5vw,40px) 100px" }}>
        <div style={{ marginBottom:32 }}>
          <div style={{ fontSize:10, color:C.pink, fontWeight:600, letterSpacing:"3px", textTransform:"uppercase", marginBottom:8 }}>Step 2 of 2</div>
          <div style={{ fontSize:"clamp(22px,4vw,30px)", fontWeight:600, letterSpacing:"-0.5px", marginBottom:8 }}>Rate some games</div>
          <div style={{ fontSize:13, color:C.muted, lineHeight:1.6 }}>Rate at least 5 games you've played. This helps Kortana personalise your experience.</div>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:32 }}>
          {loading && <div style={{ textAlign:"center", padding:40, fontSize:11, color:"#444", letterSpacing:"2px" }}>Loading games…</div>}
          {!loading && games.map(g => {
            const r = ratings[g.id] || 0;
            return (
              <div key={g.id} style={{ display:"flex", gap:14, padding:"14px", background:r>0?`${C.blue}12`:C.surface, borderRadius:12, border:`0.5px solid ${r>0?C.blue:C.border}`, alignItems:"center", transition:"all .15s" }}>
                <div style={{ width:44, height:60, borderRadius:6, overflow:"hidden", flexShrink:0 }}>
                  <Img src={g.cover} style={{ width:"100%", height:"100%" }} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:500, marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{g.title}</div>
                  <div style={{ fontSize:11, color:C.muted }}>{g.year}</div>
                </div>
                <Stars value={r} onChange={v=>setRatings(prev=>({...prev,[g.id]:v}))} size={22} />
              </div>
            );
          })}
        </div>

        <div style={{ position:"fixed", bottom:0, left:0, right:0, padding:"16px clamp(20px,5vw,40px)", background:`${C.bg}ee`, backdropFilter:"blur(12px)", borderTop:`0.5px solid ${C.border}` }}>
          <div style={{ maxWidth:540, margin:"0 auto", display:"flex", alignItems:"center", gap:16 }}>
            <div style={{ fontSize:12, color:rated>=5?C.green:C.muted, flex:1 }}>{rated>=5?"Ready!" : `Rate ${5-rated} more to continue`}</div>
            <button onClick={finish} disabled={rated<5} style={{ padding:"13px 28px", borderRadius:10, border:"none", background:rated>=5?`linear-gradient(135deg,${C.blue},${C.pink})`:"#1a1a1a", color:rated>=5?"#fff":C.muted, fontWeight:600, fontSize:14, cursor:rated>=5?"pointer":"default", transition:"all .2s" }}>
              {rated>=5?"Finish Setup →":"Rate 5 to continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PROFILE ───────────────────────────────────────────────────────────────────
function ProfileScreen({ user, logs, displayName, photoUrl }) {
  const [avatarErr, setAvatarErr]   = useState(false);
  const [pickerSlot, setPickerSlot] = useState(null); // 0-4
  const [favorites, setFavorites]   = useState(() => {
    try { return JSON.parse(localStorage.getItem(`kortana_favs_${user.id}`)) || [null,null,null,null,null]; }
    catch { return [null,null,null,null,null]; }
  });

  const saveFavs = favs => {
    setFavorites(favs);
    try { localStorage.setItem(`kortana_favs_${user.id}`, JSON.stringify(favs)); } catch {}
  };

  const pickGame = game => {
    const next = [...favorites];
    next[pickerSlot] = game;
    saveFavs(next);
    setPickerSlot(null);
  };

  const removeSlot = i => {
    const next = [...favorites];
    next[i] = null;
    saveFavs(next);
  };

  const initial   = (displayName || user.email)[0].toUpperCase();
  const joinYear  = user.created_at ? new Date(user.created_at).getFullYear() : "";
  const played    = logs.filter(l => l.status === "played").length;
  const playing   = logs.filter(l => l.status === "playing").length;
  const backlog   = logs.filter(l => l.status === "want to play").length;
  const rated     = logs.filter(l => l.rating > 0);
  const avgRating = rated.length ? (rated.reduce((s, l) => s + l.rating, 0) / rated.length).toFixed(1) : "—";
  const recent    = [...logs].slice(0, 8);

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, paddingBottom:100 }}>
      {pickerSlot !== null && <FavoritePicker onPick={pickGame} onClose={()=>setPickerSlot(null)} />}

      <div style={{ position:"fixed", inset:0, zIndex:0, pointerEvents:"none",
        backgroundImage:`linear-gradient(${C.border} 1px,transparent 1px),linear-gradient(90deg,${C.border} 1px,transparent 1px)`,
        backgroundSize:"60px 60px", opacity:0.25 }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:420, zIndex:0, pointerEvents:"none",
        background:`radial-gradient(ellipse 90% 55% at 50% -5%, ${C.blue}35 0%, transparent 72%)` }} />
      <div style={{ position:"absolute", top:80, right:0, width:280, height:280, zIndex:0, pointerEvents:"none",
        background:`radial-gradient(circle at 100% 0%, ${C.pink}18 0%, transparent 65%)` }} />

      <div style={{ position:"relative", zIndex:1 }}>

        {/* ── Identity ── */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", paddingTop:"clamp(90px,14vh,118px)", paddingBottom:28 }}>
          <div style={{ width:118, height:118, borderRadius:"50%", padding:3,
            background:`conic-gradient(${C.blue}, ${C.pink}, ${C.yellow}, ${C.green}, ${C.blue})`,
            boxShadow:`0 0 44px ${C.blue}55, 0 0 90px ${C.blue}22`,
            marginBottom:22, flexShrink:0 }}>
            <div style={{ width:"100%", height:"100%", borderRadius:"50%", overflow:"hidden", background:C.bg }}>
              {photoUrl && !avatarErr
                ? <img src={photoUrl} onError={()=>setAvatarErr(true)} style={{ width:"100%", height:"100%", objectFit:"cover" }} alt="" />
                : <div style={{ width:"100%", height:"100%", background:`linear-gradient(135deg,${C.blue},${C.pink})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:42, fontWeight:600, color:"#fff" }}>{initial}</div>
              }
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:6 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:C.green, boxShadow:`0 0 8px ${C.green}` }} />
            <span style={{ fontSize:9, color:C.green, letterSpacing:"2.5px", textTransform:"uppercase", fontWeight:500 }}>Online</span>
          </div>
          <div style={{ fontSize:"clamp(24px,5vw,32px)", fontWeight:600, letterSpacing:"-0.5px", marginBottom:5, textAlign:"center" }}>
            {displayName || "Operative"}
          </div>
          <div style={{ fontSize:9, color:"#444", letterSpacing:"3px", textTransform:"uppercase", marginBottom:32 }}>
            Kortana{joinYear ? ` · Since ${joinYear}` : ""}
          </div>
          <div style={{ display:"flex", gap:0, background:C.surface, borderRadius:14, border:`0.5px solid ${C.border}`, overflow:"hidden" }}>
            {[["Played",played,C.green],["Playing",playing,C.blue],["Backlog",backlog,C.yellow],["Avg Rating",avgRating,C.pink]].map(([label,val,col],i,a)=>(
              <div key={label} style={{ padding:"16px clamp(14px,3.5vw,26px)", textAlign:"center", borderRight:i<a.length-1?`0.5px solid ${C.border}`:"none" }}>
                <div style={{ fontSize:"clamp(22px,4vw,30px)", fontWeight:700, color:col, letterSpacing:"-1.5px", lineHeight:1, textShadow:`0 0 20px ${col}66` }}>{val}</div>
                <div style={{ fontSize:9, color:"#444", letterSpacing:"2px", textTransform:"uppercase", marginTop:6 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Top 5 (Letterboxd-style curated) ── */}
        <div style={{ padding:"0 clamp(18px,5vw,48px)", marginBottom:40 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18 }}>
            <span style={{ fontSize:10, fontWeight:500, letterSpacing:"2px", color:"#444", textTransform:"uppercase" }}>Top 5</span>
            <div style={{ flex:1, height:"0.5px", background:C.border }} />
            <span style={{ fontSize:10, color:"#444", letterSpacing:"1px" }}>Tap to add</span>
          </div>
          <div style={{ display:"flex", gap:10 }}>
            {favorites.map((fav, i) => (
              <div key={i} style={{ flex:1, position:"relative" }}>
                {fav ? (
                  <>
                    <div onClick={()=>setPickerSlot(i)} style={{ aspectRatio:"2/3", borderRadius:8, overflow:"hidden", cursor:"pointer", boxShadow:"0 4px 18px rgba(0,0,0,.7)", border:`0.5px solid ${C.border}` }}>
                      <img src={fav.cover} alt={fav.title} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                    </div>
                    <button onClick={e=>{e.stopPropagation();removeSlot(i);}} style={{ position:"absolute", top:4, right:4, width:20, height:20, borderRadius:"50%", background:"rgba(0,0,0,.8)", border:"none", color:"#888", fontSize:10, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}>✕</button>
                    <div style={{ marginTop:6, fontSize:10, fontWeight:500, color:C.text, lineHeight:1.3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", textAlign:"center" }}>{fav.title}</div>
                  </>
                ) : (
                  <div onClick={()=>setPickerSlot(i)} style={{ aspectRatio:"2/3", borderRadius:8, border:`1px dashed ${C.border}`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", cursor:"pointer", background:C.faint, transition:"border-color .15s" }}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=C.blue}
                    onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                    <div style={{ fontSize:20, color:"#333", marginBottom:4 }}>+</div>
                    <div style={{ fontSize:9, color:"#333", letterSpacing:"1px", textTransform:"uppercase" }}>{i+1}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Recent Activity ── */}
        {recent.length > 0 && (
          <div style={{ padding:"0 clamp(18px,5vw,48px)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:4 }}>
              <span style={{ fontSize:10, fontWeight:500, letterSpacing:"2px", color:"#444", textTransform:"uppercase" }}>Recent Activity</span>
              <div style={{ flex:1, height:"0.5px", background:C.border }} />
            </div>
            {recent.map((log, i) => {
              const ts = log.created_at ? new Date(log.created_at) : null;
              return (
                <div key={log.id||i} style={{ display:"flex", gap:14, padding:"13px 0", borderBottom:`0.5px solid ${C.border}`, alignItems:"center" }}>
                  <div style={{ width:40, height:54, borderRadius:5, overflow:"hidden", flexShrink:0, boxShadow:"0 2px 10px rgba(0,0,0,.6)" }}>
                    <Img src={log.cover} style={{ width:"100%", height:"100%" }} />
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:500, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginBottom:4 }}>{log.title}</div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:9, fontWeight:500, color:SC[log.status]||C.muted, letterSpacing:"1px", textTransform:"uppercase" }}>{log.status}</span>
                      {log.rating > 0 && <Stars value={log.rating} size={9} />}
                    </div>
                  </div>
                  <div style={{ fontSize:10, color:"#444", flexShrink:0 }}>{ts ? relTime(ts) : ""}</div>
                </div>
              );
            })}
          </div>
        )}

        {logs.length === 0 && <Empty label="Log some games to build your profile" />}
      </div>
    </div>
  );
}

// ── WISHLIST SALES SHEET ──────────────────────────────────────────────────────
function WishlistSalesSheet({ sales, onClose }) {
  const requestNotif = async () => {
    if ("Notification" in window) await Notification.requestPermission();
  };
  return (
    <div style={{ position:"fixed", inset:0, zIndex:820, display:"flex", flexDirection:"column" }} onClick={onClose}>
      <div style={{ flex:1 }} />
      <div onClick={e => e.stopPropagation()} style={{ background:C.surface, borderRadius:"20px 20px 0 0", border:`0.5px solid ${C.border}`, padding:"20px clamp(18px,5vw,32px) 36px", maxHeight:"80vh", overflowY:"auto" }}>
        <div style={{ width:40, height:4, borderRadius:2, background:C.border, margin:"0 auto 22px" }} />
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2zm6-6V11a6 6 0 0 0-5-5.91V4a1 1 0 0 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2z" fill={C.green}/>
          </svg>
          <div style={{ fontSize:17, fontWeight:500 }}>Wishlist on Sale</div>
        </div>
        <div style={{ fontSize:12, color:C.muted, marginBottom:20 }}>
          {sales.length} game{sales.length !== 1 ? "s" : ""} from your backlog {sales.length !== 1 ? "are" : "is"} on sale right now
        </div>
        <div>
          {sales.map((d, i) => (
            <a key={i} href={d.url} target="_blank" rel="noopener noreferrer"
              style={{ display:"flex", gap:12, alignItems:"center", padding:"12px 0", borderBottom:`0.5px solid ${C.border}`, textDecoration:"none" }}>
              <div style={{ width:44, height:60, borderRadius:6, overflow:"hidden", background:C.faint, flexShrink:0 }}>
                {d.image
                  ? <Img src={d.image} style={{ width:"100%", height:"100%" }} />
                  : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", padding:6 }}>
                      <span style={{ fontSize:8, color:"#555", textAlign:"center" }}>{d.title}</span>
                    </div>
                }
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontWeight:500, color:C.text, marginBottom:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.title}</div>
                <div style={{ fontSize:11, color:C.muted }}>{d.store}</div>
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <div style={{ display:"inline-block", background:`${C.green}22`, color:C.green, borderRadius:5, padding:"2px 7px", fontSize:10, fontWeight:700, marginBottom:5 }}>-{d.cut}%</div>
                <div style={{ fontSize:16, fontWeight:700, color:C.green }}>${d.salePrice}</div>
                <div style={{ fontSize:10, color:"#555", textDecoration:"line-through" }}>${d.normalPrice}</div>
              </div>
            </a>
          ))}
        </div>
        {"Notification" in window && Notification.permission === "default" && (
          <button onClick={requestNotif}
            style={{ width:"100%", marginTop:18, padding:"13px", background:`${C.blue}18`, border:`0.5px solid ${C.blue}55`, borderRadius:12, color:C.blue, fontSize:12, fontWeight:500, cursor:"pointer", letterSpacing:"0.3px" }}>
            Enable push notifications for future sales
          </button>
        )}
      </div>
    </div>
  );
}

// ── PLATFORMS SCREEN ─────────────────────────────────────────────────────────
function PlatformsScreen({
  steamId,   onConnectSteam,   onDisconnectSteam,
  psnNpsso,  psnProfile,       onConnectPSN,     onDisconnectPSN,
  xboxKey,   xboxProfile,      onConnectXbox,    onDisconnectXbox,
}) {
  const PLATFORMS = [
    {
      key:        "steam",
      name:       "Steam",
      desc:       "Sync your library, playtime & recently played games",
      connected:  !!steamId,
      identity:   steamId ? steamId : null,
      avatar:     null,
      accentBg:   "linear-gradient(135deg, rgba(27,40,56,.9) 0%, rgba(13,17,23,.95) 100%)",
      accentBorder: "rgba(27,154,240,.25)",
      accentText: "#1b9af0",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489l3.075-3.739A3.5 3.5 0 0 1 15.5 11h.5l3.739-3.075A9.956 9.956 0 0 0 12 2z" fill="#1b9af0" opacity=".9"/>
          <path d="M11.97 14.5A2.5 2.5 0 1 0 9.47 12" stroke="#fff" strokeWidth="1.5" fill="none"/>
        </svg>
      ),
      onConnect:    onConnectSteam,
      onDisconnect: onDisconnectSteam,
    },
    {
      key:        "psn",
      name:       "PlayStation",
      desc:       "Sync your trophy library, playtime & PS4/PS5 games",
      connected:  !!psnNpsso,
      identity:   psnProfile?.onlineId || null,
      avatar:     psnProfile?.avatarUrl || null,
      accentBg:   "linear-gradient(135deg, rgba(0,36,80,.85) 0%, rgba(10,10,20,.95) 100%)",
      accentBorder: "rgba(0,120,255,.25)",
      accentText: "#0070d1",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M9 4v13.5l3.3 1.1c2.2.7 3.7.5 3.7-1V6.5c0-1.5-1-2.2-2.2-1.7L9 4zm8.5 11.5c.5-.6.5-1.3.5-2h-1.8v1c0 .5-.3.9-.8.7l-1.9-.6v1.8l1.9.6c1.2.4 2.1.1 2.1-1.5z" fill="#0070d1"/>
        </svg>
      ),
      onConnect:    onConnectPSN,
      onDisconnect: onDisconnectPSN,
    },
    {
      key:        "xbox",
      name:       "Xbox",
      desc:       "Sync your game library, achievements & gamerscore via OpenXBL",
      connected:  !!xboxKey,
      identity:   xboxProfile?.gamertag || null,
      avatar:     xboxProfile?.avatar || null,
      accentBg:   "linear-gradient(135deg, rgba(16,124,16,.25) 0%, rgba(10,10,20,.95) 100%)",
      accentBorder: "rgba(16,124,16,.35)",
      accentText: "#107c10",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9.5" stroke="#107c10" strokeWidth="1.5"/>
          <path d="M8.5 8.5C9.8 7 11.3 6 12 6c.7 0 2.2 1 3.5 2.5" stroke="#107c10" strokeWidth="1.4" strokeLinecap="round"/>
          <path d="M6 10.5C7.5 9 9 7.5 10 7l4 10c-1.5 1-4 1.5-5.5.5L6 10.5z" fill="#107c10" opacity=".7"/>
          <path d="M18 10.5c-1.5-1.5-3-3-4-3.5l-4 10c1.5 1 4 1.5 5.5.5L18 10.5z" fill="#107c10" opacity=".5"/>
        </svg>
      ),
      onConnect:    onConnectXbox,
      onDisconnect: onDisconnectXbox,
    },
  ];

  return (
    <div style={{ paddingBottom:90, color:C.text }}>
      <div style={{ padding:"clamp(52px,12vh,72px) clamp(18px,5vw,48px) clamp(20px,4vh,28px)", position:"sticky", top:0, background:C.bg, zIndex:10, borderBottom:`0.5px solid ${C.border}` }}>
        <div style={{ fontSize:"clamp(20px,4vw,28px)", fontWeight:500, letterSpacing:"-0.3px", marginBottom:4 }}>Platforms</div>
        <div style={{ fontSize:13, color:C.muted }}>Connect your gaming accounts to sync your library.</div>
      </div>

      <div style={{ padding:"clamp(14px,3vh,20px) clamp(18px,5vw,48px) 0", display:"flex", flexDirection:"column", gap:14 }}>
        {PLATFORMS.map(p => (
          <div key={p.key} style={{ borderRadius:14, overflow:"hidden", border:`0.5px solid ${p.accentBorder}`, background:p.accentBg }}>
            {/* Header row */}
            <div style={{ display:"flex", alignItems:"center", gap:14, padding:"clamp(16px,3vw,20px)" }}>
              <div style={{ width:46, height:46, borderRadius:12, background:`${p.accentText}18`, border:`0.5px solid ${p.accentText}33`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                {p.icon}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ fontSize:15, fontWeight:500, color:C.text }}>{p.name}</div>
                  {p.connected && (
                    <div style={{ fontSize:9, fontWeight:600, color:C.green, background:`${C.green}18`, border:`0.5px solid ${C.green}44`, borderRadius:20, padding:"2px 8px", letterSpacing:"1.5px", textTransform:"uppercase" }}>Connected</div>
                  )}
                </div>
                <div style={{ fontSize:12, color:C.muted, marginTop:2, lineHeight:1.4 }}>{p.desc}</div>
              </div>
            </div>

            {/* Connected identity row */}
            {p.connected && p.identity && (
              <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px clamp(16px,3vw,20px)", borderTop:`0.5px solid ${p.accentBorder}`, background:"rgba(0,0,0,.25)" }}>
                {p.avatar && (
                  <img src={p.avatar} style={{ width:34, height:34, borderRadius:"50%", objectFit:"cover", border:`0.5px solid ${p.accentText}44` }} alt="" onError={e=>e.target.style.display="none"} />
                )}
                {!p.avatar && (
                  <div style={{ width:34, height:34, borderRadius:"50%", background:`${p.accentText}22`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>
                    {p.key === "steam" ? "🎮" : p.key === "psn" ? "🎮" : "🎮"}
                  </div>
                )}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:500, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.identity}</div>
                  <div style={{ fontSize:10, color:p.accentText, marginTop:1 }}>
                    {p.key === "steam" ? "Steam ID" : p.key === "psn" ? "PSN Online ID" : "Gamertag"}
                  </div>
                </div>
                <button
                  onClick={p.onDisconnect}
                  style={{ padding:"6px 14px", borderRadius:8, border:`0.5px solid ${C.pink}44`, background:`${C.pink}12`, color:C.pink, fontSize:11, fontWeight:500, cursor:"pointer", flexShrink:0, letterSpacing:"0.5px" }}>
                  Disconnect
                </button>
              </div>
            )}

            {/* Connect / already connected CTA */}
            <div style={{ padding:"0 clamp(16px,3vw,20px) clamp(16px,3vw,20px)" }}>
              {p.connected ? (
                <div style={{ fontSize:11, color:C.muted, textAlign:"center", padding:"8px 0" }}>
                  Library synced automatically
                </div>
              ) : (
                <button
                  onClick={p.onConnect}
                  style={{ width:"100%", padding:"12px 0", borderRadius:10, border:`0.5px solid ${p.accentText}44`, background:`${p.accentText}18`, color:p.accentText, fontSize:13, fontWeight:600, cursor:"pointer", letterSpacing:"0.5px", transition:"all .15s" }}
                  onMouseEnter={e=>e.currentTarget.style.background=`${p.accentText}2e`}
                  onMouseLeave={e=>e.currentTarget.style.background=`${p.accentText}18`}>
                  Connect {p.name} →
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Info note */}
        <div style={{ padding:"clamp(14px,2vh,18px)", background:C.surface, borderRadius:12, border:`0.5px solid ${C.border}`, marginTop:4 }}>
          <div style={{ fontSize:11, color:"#444", lineHeight:1.7 }}>
            Your credentials are stored securely in your account and only used to sync your gaming data. Kortana never stores your passwords.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function Kortana() {
  const [games,    setGames]    = useState(INIT_GAMES);
  const [lists,    setLists]    = useState(() => {
    try {
      const s = localStorage.getItem("kortana_lists");
      const stored = s ? JSON.parse(s) : [];
      if (!stored.some(l=>l.id==="goty-pick"))
        return [{ id:"goty-pick", name:"Your Game of the Year", desc:"Your personal GOTY pick for 2026", gameIds:[] }, ...stored];
      return stored;
    } catch { return [{ id:"goty-pick", name:"Your Game of the Year", desc:"Your personal GOTY pick for 2026", gameIds:[] }]; }
  });
  const [tab,    setTab]    = useState("home");
  const [detail, setDetail] = useState(null);
  const [user,   setUser]   = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [logs, setLogs]         = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [settingsOpen, setSettingsOpen]   = useState(false);
  const [settingsModal, setSettingsModal] = useState(null);
  const [displayName, setDisplayName]     = useState("");
  const [photoUrl, setPhotoUrl]           = useState("");
  const [steamId, setSteamId]             = useState("");
  const [psnNpsso,    setPsnNpsso]    = useState("");
  const [psnToken,    setPsnToken]    = useState("");
  const [psnProfile,  setPsnProfile]  = useState(null);
  const [xboxKey,     setXboxKey]     = useState("");
  const [xboxProfile, setXboxProfile] = useState(null);
  const [showConnectSteam, setShowConnectSteam] = useState(false);
  const [showConnectPSN,   setShowConnectPSN]   = useState(false);
  const [showConnectXbox,  setShowConnectXbox]  = useState(false);
  const [showOnboarding,   setShowOnboarding]   = useState(false);
  const [showWrapped,      setShowWrapped]      = useState(false);
  const [wishlistSales,    setWishlistSales]    = useState([]);
  const [showSalesSheet,   setShowSalesSheet]   = useState(false);
  const seenSalesKey = useRef(typeof window !== "undefined" ? (localStorage.getItem("kortana_seen_sales") || "") : "");
  const vw        = useWindowWidth();
  const isDesktop = vw >= 960;

  useEffect(() => {
    let mounted = true;
    const initAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) {
        setDisplayName(u.user_metadata?.display_name || "");
        setPhotoUrl(u.user_metadata?.avatar_url || "");
        setSteamId(u.user_metadata?.steam_id || "");
        setPsnNpsso(u.user_metadata?.psn_npsso || "");
        setXboxKey(u.user_metadata?.xbox_key || "");
        if (!localStorage.getItem(`kortana_onboarded_${u.id}`)) setShowOnboarding(true);
      }
      setAuthLoading(false);
    };
    initAuth();
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        setDisplayName(u.user_metadata?.display_name || "");
        setPhotoUrl(u.user_metadata?.avatar_url || "");
        setSteamId(u.user_metadata?.steam_id || "");
        setPsnNpsso(u.user_metadata?.psn_npsso || "");
        setXboxKey(u.user_metadata?.xbox_key || "");
        if (!localStorage.getItem(`kortana_onboarded_${u.id}`)) setShowOnboarding(true);
      }
    });
    return () => { mounted = false; subscription?.subscription?.unsubscribe?.(); };
  }, []);

  useEffect(() => {
    if (!user) { setLogs([]); return; }
    const loadLogs = async () => {
      setLogsLoading(true);
      const { data, error } = await supabase.from('game_logs').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (error) { console.error('Error loading saved logs:', error); setLogs([]); }
      else setLogs(data || []);
      setLogsLoading(false);
    };
    loadLogs();
  }, [user]);

  useEffect(() => {
    try { localStorage.setItem("kortana_lists", JSON.stringify(lists)); } catch {}
  }, [lists]);

  const updateGame = u => setGames(gs=>gs.map(g=>g.id===u.id?u:g));
  const handleLogSaved = log => setLogs(prev => {
    const exists = prev.find(l => String(l.game_id) === String(log.game_id));
    if (exists) return prev.map(l => String(l.game_id) === String(log.game_id) ? { ...l, ...log } : l);
    return [{ ...log, created_at: new Date().toISOString() }, ...prev];
  });
  const handleSignOut = async () => { await supabase.auth.signOut(); setUser(null); setDisplayName(""); setPhotoUrl(""); setSteamId(""); };

  // Check if any backlog games are on sale via ITAD
  useEffect(() => {
    if (!user || !logs.length) return;
    const wishlist = logs.filter(l => l.status === "want to play");
    if (!wishlist.length) return;
    const norm = s => (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
    const wishTitles = wishlist.map(l => norm(l.title)).filter(t => t.length > 3);
    fetchItadDeals("")
      .then(raw => {
        const list = Array.isArray(raw) ? raw : (raw?.list || []);
        const found = new Set();
        const onSale = list
          .filter(d => {
            const dt = norm(d.title);
            if (found.has(dt)) return false;
            const match = wishTitles.some(wt => dt === wt || dt.startsWith(wt + " ") || wt.startsWith(dt + " ") || (wt.length > 6 && dt.includes(wt)));
            if (match) { found.add(dt); return true; }
            return false;
          })
          .map(d => ({
            title:       d.title,
            cut:         Math.round(d.deal?.cut ?? 0),
            salePrice:   Number(d.deal?.price?.amount ?? 0).toFixed(2),
            normalPrice: Number(d.deal?.regular?.amount ?? 0).toFixed(2),
            url:         d.deal?.url ?? "#",
            store:       d.deal?.shop?.name ?? "Store",
            image:       d.assets?.boxart || d.assets?.banner300 || "",
          }))
          .filter(d => d.cut >= 20);
        setWishlistSales(onSale);
        if (onSale.length > 0) {
          const key = onSale.map(s => s.title).sort().join("|");
          if (key !== seenSalesKey.current && "Notification" in window && Notification.permission === "granted") {
            new Notification(`${onSale.length} wishlist game${onSale.length > 1 ? "s" : ""} on sale!`, {
              body: onSale.slice(0, 3).map(s => `${s.title} — ${s.cut}% off ($${s.salePrice})`).join("\n"),
            });
            seenSalesKey.current = key;
            localStorage.setItem("kortana_seen_sales", key);
          }
        }
      })
      .catch(() => {});
  }, [user?.id, logs.length]);

  const connectSteam = async (newSteamId) => {
    const { error } = await supabase.auth.updateUser({ data: { steam_id: newSteamId } });
    if (!error) { setSteamId(newSteamId); setShowConnectSteam(false); }
  };

  const connectPSN = async (npsso, profile) => {
    const { error } = await supabase.auth.updateUser({ data: { psn_npsso: npsso } });
    if (!error) {
      setPsnNpsso(npsso);
      setPsnToken(profile.access_token);
      setPsnProfile({ onlineId: profile.onlineId, avatarUrl: profile.avatarUrl });
      setShowConnectPSN(false);
    }
  };

  const connectXbox = async (key, profile) => {
    const { error } = await supabase.auth.updateUser({ data: { xbox_key: key } });
    if (!error) {
      setXboxKey(key);
      setXboxProfile(profile);
      setShowConnectXbox(false);
    }
  };

  const disconnectSteam = async () => {
    await supabase.auth.updateUser({ data: { steam_id: "" } });
    setSteamId("");
  };
  const disconnectPSN = async () => {
    await supabase.auth.updateUser({ data: { psn_npsso: "" } });
    setPsnNpsso(""); setPsnToken(""); setPsnProfile(null);
  };
  const disconnectXbox = async () => {
    await supabase.auth.updateUser({ data: { xbox_key: "" } });
    setXboxKey(""); setXboxProfile(null);
  };

  // Auto-reconnect PSN using stored NPSSO when session loads
  useEffect(() => {
    if (!psnNpsso || psnToken) return;
    psnConnect(psnNpsso).then(data => {
      if (data.access_token) {
        setPsnToken(data.access_token);
        setPsnProfile({ onlineId: data.onlineId, avatarUrl: data.avatarUrl });
      }
    }).catch(() => {});
  }, [psnNpsso]);

  // Auto-load Xbox profile when key loads
  useEffect(() => {
    if (!xboxKey || xboxProfile) return;
    xboxApi("profile", xboxKey).then(data => {
      const pu = data?.profileUsers?.[0];
      const gamertag = pu?.settings?.find(s => s.id === "Gamertag")?.value || "";
      const avatar   = pu?.settings?.find(s => s.id === "GameDisplayPicRaw")?.value || "";
      if (gamertag) setXboxProfile({ gamertag, avatar });
    }).catch(() => {});
  }, [xboxKey]);

  const TABS = [
    { key:"home",      label:"Home"      },
    { key:"diary",     label:"Diary"     },
    { key:"browse",    label:"Browse"    },
    { key:"lists",     label:"Lists"     },
    { key:"platforms", label:"Platforms" },
    { key:"profile",   label:"Profile"   },
  ];

  if (authLoading) return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ fontSize:11, color:"#444", letterSpacing:"2px", textTransform:"uppercase" }}>Loading…</div>
    </div>
  );

  if (!user) return <AuthScreen />;

  const initial = (displayName || user.email)[0].toUpperCase();

  return (
    <div style={{ minHeight:"100vh", background:C.bg, position:"relative", overflowX:"hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;1,400;1,500&display=swap');
        @keyframes fadeUp     { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp    { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes steamPulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;font-family:'Poppins',sans-serif}
        ::-webkit-scrollbar{display:none}
        input,textarea,select{color-scheme:dark}
        input::placeholder,textarea::placeholder{color:#444444!important}
        html,body{
          background-color:#06080f;
          background-image:
            linear-gradient(rgba(34,85,204,0.07) 1px,transparent 1px),
            linear-gradient(90deg,rgba(34,85,204,0.07) 1px,transparent 1px),
            repeating-linear-gradient(0deg,rgba(0,0,0,0.06) 0px,rgba(0,0,0,0.06) 1px,transparent 1px,transparent 3px);
          background-size:44px 44px,44px 44px,3px 3px;
          background-attachment:fixed;
        }
      `}</style>
      {/* Retro sci-fi grid overlay — visible through transparent areas */}
      <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:0,
        backgroundImage:`linear-gradient(rgba(34,85,204,0.07) 1px,transparent 1px),linear-gradient(90deg,rgba(34,85,204,0.07) 1px,transparent 1px),repeating-linear-gradient(0deg,rgba(0,0,0,0.06) 0px,rgba(0,0,0,0.06) 1px,transparent 1px,transparent 3px),radial-gradient(ellipse 100% 40% at 50% 0%,rgba(34,85,204,0.06) 0%,transparent 80%)`,
        backgroundSize:"44px 44px,44px 44px,3px 3px,100% 100%",
        mixBlendMode:"screen",
      }} />

      <div style={{ width:"100%" }}>

        {/* ── Top bar ── */}
        {!detail && (
          <>
            {settingsOpen && <div onClick={()=>setSettingsOpen(false)} style={{ position:"fixed", inset:0, zIndex:195 }} />}
            <div style={{ position:"fixed", top:0, left:0, right:0, zIndex:200, padding:"clamp(12px,2.5vw,20px) clamp(18px,5vw,48px)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>

              {/* Left: wordmark */}
              <div style={{ display:"flex", alignItems:"center", gap:9, pointerEvents:"none" }}>
                <svg width="22" height="22" viewBox="0 0 110 110" fill="none">
                  <path d="M16 10 L16 100 L34 100 L34 62 L68 100 L92 100 L54 55 L90 10 L66 10 L34 46 L34 10 Z" fill="none" stroke="#2255CC" strokeWidth="4"/>
                  <path d="M90 10 L54 55" stroke="#CC3377" strokeWidth="4" fill="none"/>
                  <path d="M34 62 L68 100 L92 100" stroke="#FAC000" strokeWidth="4" fill="none"/>
                  <path d="M54 55 L92 100" stroke="#00A850" strokeWidth="4" fill="none"/>
                </svg>
                <span style={{ fontSize:"clamp(16px,2.5vw,20px)", fontWeight:500, letterSpacing:"-0.5px", color:C.text }}>ortana</span>
              </div>

              {/* Right: bell + avatar / settings trigger */}
              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                {/* Wishlist sale bell */}
                <button onClick={() => setShowSalesSheet(true)} title="Wishlist sales" style={{ position:"relative", background:"none", border:"none", cursor:"pointer", padding:"6px 8px", color: wishlistSales.length > 0 ? C.green : "#444", transition:"color .15s" }}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                    <path d="M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2zm6-6V11a6 6 0 0 0-5-5.91V4a1 1 0 0 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2z" fill="currentColor"/>
                  </svg>
                  {wishlistSales.length > 0 && (
                    <div style={{ position:"absolute", top:4, right:4, minWidth:16, height:16, borderRadius:8, background:C.green, border:`2px solid ${C.bg}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, color:"#000", padding:"0 3px" }}>
                      {wishlistSales.length}
                    </div>
                  )}
                </button>

                <div style={{ position:"relative" }}>
                  <button onClick={()=>setSettingsOpen(v=>!v)} style={{ background:"none", border:"none", cursor:"pointer", padding:0, display:"flex", alignItems:"center" }}>
                    <UserAvatar initial={initial} photoUrl={photoUrl} size={34} />
                  </button>
                  {settingsOpen && (
                    <SettingsDropdown
                      user={user} displayName={displayName} photoUrl={photoUrl}
                      onAccount={()=>{ setSettingsOpen(false); setSettingsModal("account"); }}
                      onFriends={()=>{ setSettingsOpen(false); setSettingsModal("friends"); }}
                      onSignOut={()=>{ setSettingsOpen(false); handleSignOut(); }}
                    />
                  )}
                </div>
              </div>

            </div>
          </>
        )}

        {/* ── Screens ── */}
        {detail ? (
          <GameDetail game={games.find(g=>g.id===detail.id)||detail} user={user} onBack={()=>setDetail(null)} onUpdate={g=>{updateGame(g);setDetail(g);}} onLogSaved={handleLogSaved} />
        ) : (
          <div style={{ display: isDesktop && tab==="home" ? "flex" : "block", alignItems:"flex-start", width:"100%" }}>

            {/* Left sidebar — home tab desktop only */}
            {isDesktop && tab==="home" && <DesktopLeftPanel />}

            {/* Center column */}
            <div style={{ flex:1, minWidth:0, overflow:"hidden" }}>
              {tab==="home"    && <HomeScreen    games={games} logs={logs} onGameClick={setDetail} steamId={steamId} onConnectSteam={()=>setShowConnectSteam(true)} psnToken={psnToken} onConnectPSN={()=>setShowConnectPSN(true)} xboxKey={xboxKey} onConnectXbox={()=>setShowConnectXbox(true)} isDesktop={isDesktop} user={user} onOpenWrapped={()=>setShowWrapped(true)} />}
              {tab==="diary"   && <DiaryScreen   logs={logs} onGameClick={setDetail} />}
              {tab==="browse"  && <BrowseScreen  games={games} onGameClick={setDetail} />}
              {tab==="lists"   && <ListsScreen   lists={lists} games={[...new Map(logs.map(l=>[l.game_id||l.id,{...l,id:l.game_id||l.id,hero:l.cover}])).values()]} setLists={setLists} onGameClick={setDetail} />}
              {tab==="platforms" && <PlatformsScreen
                steamId={steamId}   onConnectSteam={()=>setShowConnectSteam(true)}   onDisconnectSteam={disconnectSteam}
                psnNpsso={psnNpsso} psnProfile={psnProfile} onConnectPSN={()=>setShowConnectPSN(true)} onDisconnectPSN={disconnectPSN}
                xboxKey={xboxKey}   xboxProfile={xboxProfile} onConnectXbox={()=>setShowConnectXbox(true)} onDisconnectXbox={disconnectXbox}
              />}
              {tab==="profile" && <ProfileScreen user={user} logs={logs} displayName={displayName} photoUrl={photoUrl} />}
            </div>

            {/* Right sidebar — home tab desktop only */}
            {isDesktop && tab==="home" && <DesktopRightPanel logs={logs} onGameClick={setDetail} />}

          </div>
        )}

        {/* ── Bottom tab bar ── */}
        {!detail && (
          <div style={{ position:"fixed", bottom:0, left:0, right:0, background:"rgba(10,10,10,.97)", backdropFilter:"blur(20px)", borderTop:`0.5px solid ${C.border}`, display:"grid", gridTemplateColumns:"repeat(5,1fr)", zIndex:100, paddingBottom:12, overflow:"hidden" }}>
            <StripeBar height={2} style={{ position:"absolute", top:0, left:0, right:0 }} />
            {TABS.map(t=>(
              <button key={t.key} onClick={()=>setTab(t.key)} style={{ background:"none", border:"none", cursor:"pointer", padding:"14px 8px 4px", display:"flex", flexDirection:"column", alignItems:"center" }}>
                <span style={{ fontSize:10, fontWeight:500, letterSpacing:"1.5px", textTransform:"uppercase", color:tab===t.key?C.blue:C.muted, transition:"color .15s", opacity:tab===t.key?1:0.6 }}>{t.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Onboarding ── */}
        {showOnboarding && <OnboardingFlow user={user} onDone={()=>setShowOnboarding(false)} />}

        {/* ── Modals ── */}
        {settingsModal === "account" && (
          <AccountModal user={user} displayName={displayName} photoUrl={photoUrl} setDisplayName={setDisplayName} setPhotoUrl={setPhotoUrl} steamId={steamId} setSteamId={setSteamId} onClose={()=>setSettingsModal(null)} />
        )}
        {settingsModal === "friends" && (
          <FriendsModal onClose={()=>setSettingsModal(null)} />
        )}
        {showConnectSteam && (
          <ConnectSteamSheet onConnect={connectSteam} onClose={()=>setShowConnectSteam(false)} />
        )}
        {showConnectPSN && (
          <ConnectPSNSheet onConnect={connectPSN} onClose={()=>setShowConnectPSN(false)} />
        )}
        {showConnectXbox && (
          <ConnectXboxSheet onConnect={connectXbox} onClose={()=>setShowConnectXbox(false)} />
        )}

        {showWrapped && (
          <WrappedModal
            user={user} logs={logs}
            steamId={steamId} psnToken={psnToken} xboxKey={xboxKey}
            onClose={()=>setShowWrapped(false)}
          />
        )}

        {showSalesSheet && (
          <WishlistSalesSheet
            sales={wishlistSales}
            onClose={() => setShowSalesSheet(false)}
          />
        )}

      </div>
    </div>
  );
}
