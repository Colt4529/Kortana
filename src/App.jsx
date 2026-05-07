import { useState, useEffect } from "react";
import { supabase, insertGameLog } from "./supabaseClient";

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

// Responsive sizing helper
const responsiveValue = (mobile, tablet, desktop, screenWidth = 768) => {
  if (screenWidth < 768) return mobile;
  if (screenWidth < 1024) return tablet;
  return desktop;
};

const STRIPES = ["#2255CC","#CC3377","#FAC000","#00A850"];
const SC = { "played":C.green, "playing":C.blue, "want to play":C.yellow, "dropped":C.muted };
const GENRES     = ["All","RPG","Action","Roguelike","Platformer","Metroidvania","Strategy","Horror","Sports","Adventure"];
const PUBLISHERS = ["All","Bandai Namco","Supergiant","Team Cherry","ZA/UM","Extremely OK","Activision","Motion Twin","Nintendo"];
const RAWG_API_KEY = "372eea2d4d9d4de7a1ee03d66d6842eb";
const RAWG_API_URL = "https://api.rawg.io/api";

function normalizeRawgGame(raw) {
  const cover = raw.background_image || raw.background_image_additional || raw.background || "";
  const hero = raw.background_image_additional || raw.background_image || raw.background || "";
  return {
    id: raw.id,
    title: raw.name,
    cover,
    hero,
    year: raw.released ? Number(raw.released.slice(0,4)) : null,
    developer: raw.developers?.[0]?.name || raw.developer || "Unknown",
    publisher: raw.publishers?.[0]?.name || raw.publisher || "Unknown",
    desc: raw.description_raw || raw.short_description || raw.description || "No description available.",
    rating: raw.rating ? Math.round(raw.rating) : 0,
    genre: raw.genres?.[0]?.name || "Unknown",
    status: "",
    goty: false,
    tagline: raw.tagline || "",
    playtime: 0,
    review: "",
  };
}

function StripeBar({ height=3, style }) {
  return (
    <div style={{ display:"flex", overflow:"hidden", ...style }}>
      {STRIPES.map((c,i)=><div key={i} style={{ flex:1, height, background:c }} />)}
    </div>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async () => {
    setLoading(true);
    setMessage("");
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setMessage("Enter both email and password.");
      setLoading(false);
      return;
    }

    if (mode === "sign-in") {
      const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
      if (error) setMessage(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email: trimmedEmail, password });
      if (error) setMessage(error.message);
      else setMessage("Signup successful — check your email to confirm.");
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ width:"100%", maxWidth:420, padding:28, borderRadius:18, background:C.surface, border:`1px solid ${C.border}`, boxShadow:"0 20px 60px rgba(0,0,0,.35)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <svg width="22" height="22" viewBox="0 0 110 110" fill="none">
                <path d="M16 10 L16 100 L34 100 L34 62 L68 100 L92 100 L54 55 L90 10 L66 10 L34 46 L34 10 Z" fill="none" stroke="#2255CC" strokeWidth="4"/>
                <path d="M90 10 L54 55" stroke="#CC3377" strokeWidth="4" fill="none"/>
                <path d="M34 62 L68 100 L92 100" stroke="#FAC000" strokeWidth="4" fill="none"/>
                <path d="M54 55 L92 100" stroke="#00A850" strokeWidth="4" fill="none"/>
              </svg>
              <span style={{ fontSize:22, fontWeight:500, letterSpacing:"-0.5px" }}>ortana</span>
            </div>
            <div style={{ fontSize:12, color:C.muted, marginTop:6 }}>Sign in or create an account to unlock your library.</div>
          </div>
          <div style={{ display:"flex", gap:6 }}>
            <button onClick={()=>setMode("sign-in")} style={{ padding:"8px 16px", borderRadius:999, border:"none", cursor:"pointer", background:mode==="sign-in"?C.pink:C.faint, color:mode==="sign-in"?"#fff":C.text, fontWeight:600 }}>Sign In</button>
            <button onClick={()=>setMode("sign-up")} style={{ padding:"8px 16px", borderRadius:999, border:"none", cursor:"pointer", background:mode==="sign-up"?C.pink:C.faint, color:mode==="sign-up"?"#fff":C.text, fontWeight:600 }}>Sign Up</button>
          </div>
        </div>

        <div style={{ display:"grid", gap:14 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:800, letterSpacing:"0.18em", textTransform:"uppercase", color:C.muted, marginBottom:8 }}>{mode==="sign-in"?"Login":"Create account"}</div>
            <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" style={{ width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:6, padding:"14px 16px", color:C.text, fontSize:14, outline:"none", boxSizing:"border-box" }} />
          </div>
          <div>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" style={{ width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:6, padding:"14px 16px", color:C.text, fontSize:14, outline:"none", boxSizing:"border-box" }} />
          </div>
          {message && <div style={{ color: message.startsWith("Signup successful") ? C.green : C.pink, fontSize:13, minHeight:18 }}>{message}</div>}
          <button onClick={submit} disabled={loading} style={{ width:"100%", padding:14, borderRadius:8, border:"none", background:C.pink, color:"#fff", fontWeight:600, cursor:"pointer", fontSize:14, textTransform:"uppercase", letterSpacing:"0.08em" }}>
            {loading ? "Working…" : mode === "sign-in" ? "Sign In" : "Create Account"}
          </button>
          <div style={{ textAlign:"center", fontSize:12, color:C.muted }}>
            By continuing you agree to use your email and password for Kortana authentication.
          </div>
        </div>
      </div>
    </div>
  );
}

const INIT_GAMES = [];
const INIT_LISTS = [];

// ── SHARED COMPONENTS ─────────────────────────────────────────────────────────

function Img({ src, style }) {
  const [ok, setOk] = useState(true);
  return ok
    ? <img src={src} style={{ ...style, objectFit:"cover" }} onError={()=>setOk(false)} alt="" />
    : <div style={{ ...style, background:"#1a1820" }} />;
}

function Stars({ value, onChange, size=28 }) {
  const [hov, setHov] = useState(0);
  const lit = hov || value;
  return (
    <div style={{ display:"flex" }}>
      {[1,2,3,4,5].map(n=>(
        <button key={n}
          onMouseEnter={()=>onChange&&setHov(n)}
          onMouseLeave={()=>onChange&&setHov(0)}
          onClick={()=>onChange?.(n)}
          style={{ background:"none", border:"none", padding:`${size*.1}px ${size*.06}px`,
            fontSize:`${size}px`, lineHeight:1, cursor:onChange?"pointer":"default",
            color: lit>=n ? C.yellow : C.faint,
            transition:"color .1s, transform .1s",
            transform: hov===n&&onChange?"scale(1.25)":"scale(1)" }}>★</button>
      ))}
    </div>
  );
}

function Pills({ items, active, onSelect }) {
  return (
    <div style={{ display:"flex", gap:"clamp(6px, 1.5vw, 10px)", overflowX:"auto", paddingBottom:2, scrollBehavior:"smooth" }}>
      {items.map(item=>(
        <button key={item} onClick={()=>onSelect(item)} style={{
          flexShrink:0, padding:"clamp(6px, 1.2vh, 10px) clamp(12px, 2vw, 18px)", borderRadius:3, border:"none", cursor:"pointer",
          fontSize:"clamp(10px, 1.2vw, 12px)", fontWeight:700, letterSpacing:"0.07em", textTransform:"uppercase",
          background: item===active ? C.blue : C.faint,
          color: item===active ? "#fff" : C.muted,
          transition:"all .15s ease",
        }}>{item}</button>
      ))}
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ padding:"32px clamp(18px, 5vw, 48px) 0" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:"clamp(14px, 3vh, 20px)" }}>
        <span style={{ fontSize:"clamp(10px, 1vw, 12px)", fontWeight:800, letterSpacing:"0.2em", color:C.muted, textTransform:"uppercase" }}>{label}</span>
        <div style={{ flex:1, height:1, background:C.border }} />
      </div>
      {children}
    </div>
  );
}

function PosterCard({ game, onClick }) {
  return (
    <div onClick={()=>onClick?.(game)} style={{
      position:"relative", aspectRatio:"2/3", borderRadius:6, overflow:"hidden", cursor:"pointer",
      boxShadow:"0 4px 20px rgba(0,0,0,.6)", transition:"all 0.3s ease",
    }}>
      <Img src={game.cover} style={{ width:"100%", height:"100%" }} />
      <div style={{ position:"absolute", inset:0, background:"linear-gradient(to top, rgba(14,14,16,.92) 0%, transparent 50%)" }} />
      <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"clamp(8px, 2vw, 14px)" }}>
        <div style={{ fontSize:"clamp(10px, 1.5vw, 13px)", fontWeight:800, color:C.text, lineHeight:1.2, marginBottom:3 }}>{game.title}</div>
        <Stars value={game.rating} size={10} />
      </div>
      {game.goty && (
        <div style={{ position:"absolute", top:"clamp(6px, 1vh, 10px)", right:"clamp(6px, 1vh, 10px)", background:C.yellow, borderRadius:2, padding:"2px 6px", fontSize:"clamp(7px, 1vw, 9px)", fontWeight:900, color:"#000", letterSpacing:"0.08em" }}>GOTY</div>
      )}
      <div style={{ position:"absolute", top:"clamp(8px, 1.5vh, 12px)", left:"clamp(8px, 1.5vh, 12px)", width:"clamp(5px, 1vw, 8px)", height:"clamp(5px, 1vw, 8px)", borderRadius:"50%", background:SC[game.status]||C.muted, opacity:0.8 }} />
    </div>
  );
}

function DiaryRow({ game, onClick, index=0 }) {
  return (
    <div onClick={()=>onClick?.(game)}
      style={{ display:"flex", gap:"clamp(12px, 2vw, 16px)", padding:"clamp(12px, 2vh, 16px) 0", borderBottom:`1px solid ${C.border}`, cursor:"pointer",
        animation:`fadeUp .3s ${Math.min(index,8)*.04}s both`, transition:"opacity 0.2s ease" }}>
      <div style={{ width:"clamp(42px, 8vw, 56px)", height:"clamp(56px, 11vw, 74px)", borderRadius:4, overflow:"hidden", flexShrink:0, boxShadow:"0 4px 14px rgba(0,0,0,.5)" }}>
        <Img src={game.cover} style={{ width:"100%", height:"100%" }} />
      </div>
      <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", justifyContent:"center", gap:3 }}>
        <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}>
          <span style={{ fontSize:"clamp(14px, 2.5vw, 16px)", fontWeight:800, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{game.title}</span>
          {game.goty && <span style={{ background:"rgba(250,192,0,.09)", border:`1px solid rgba(250,192,0,.25)`, borderRadius:2, padding:"0 5px", fontSize:"clamp(8px, 1vw, 9px)", fontWeight:600, color:C.yellow, flexShrink:0, letterSpacing:"0.08em" }}>GOTY</span>}
        </div>
        <Stars value={game.rating} size={13} />
        {game.review ? <div style={{ fontSize:"clamp(11px, 1.5vw, 12px)", fontStyle:"italic", color:C.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{game.review}</div> : null}
      </div>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", justifyContent:"space-between", flexShrink:0, gap:2 }}>
        <span style={{ fontSize:"clamp(8px, 1vw, 10px)", color:C.faint }}>{game.year}</span>
        <span style={{ fontSize:"clamp(8px, 1vw, 10px)", fontWeight:800, color:SC[game.status]||C.muted, letterSpacing:"0.08em", textTransform:"uppercase" }}>{game.status}</span>
      </div>
    </div>
  );
}

function Empty({ label, icon="🎮" }) {
  return (
    <div style={{ textAlign:"center", padding:"70px 0" }}>
      <div style={{ fontSize:38, marginBottom:12 }}>{icon}</div>
      <div style={{ fontSize:13, fontWeight:700, color:C.muted, letterSpacing:"0.06em" }}>{label}</div>
    </div>
  );
}

// ── ACTION SHEET (shared log/edit modal) ──────────────────────────────────────
function LogSheet({ game, onClose, onSave, user }) {
  const [form, setForm] = useState({
    rating: game.rating, status: game.status,
    review: game.review||"", liked: game.liked||false, goty: game.goty||false
  });

  const iSt = { width:"100%", background:C.faint, border:`1px solid ${C.border}`, borderRadius:3, padding:"11px 14px", color:C.text, fontSize:14, outline:"none", boxSizing:"border-box" };

  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.82)", zIndex:300, display:"flex", alignItems:"flex-end", justifyContent:"center", backdropFilter:"blur(10px)" }}>
      <div style={{ background:C.surface, borderRadius:"16px 16px 0 0", width:"100%", maxWidth:430, paddingBottom:36,
        border:`1px solid ${C.border}`, borderBottom:"none", animation:"slideUp .22s ease", overflow:"hidden" }}>
        {/* stripe only here on the sheet — signature moment */}
        <StripeBar height={4} />
        <div style={{ display:"flex", justifyContent:"center", padding:"12px 0 6px" }}>
          <div style={{ width:38, height:4, borderRadius:2, background:C.faint }} />
        </div>
        <div style={{ textAlign:"center", padding:"4px 20px 16px" }}>
          <div style={{ fontSize:18, fontWeight:900, color:C.text }}>{game.title}</div>
          <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{game.year} · {game.developer}</div>
        </div>

        {/* played / liked / backlog */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}` }}>
          {[["👁","Played","played",C.green],["♥","Liked","liked",C.pink],["🕒","Backlog","want to play",C.yellow]].map(([icon,label,val,col])=>{
            const active = val==="liked" ? form.liked : form.status===val;
            return (
              <button key={val} onClick={()=>val==="liked"?setForm({...form,liked:!form.liked}):setForm({...form,status:val})}
                style={{ background:"none", border:"none", padding:"18px 8px", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:5 }}>
                <span style={{ fontSize:26, filter:active?"none":"grayscale(1) opacity(.2)", transition:"filter .15s" }}>{icon}</span>
                <span style={{ fontSize:11, fontWeight:800, color:active?col:C.muted, letterSpacing:"0.06em", transition:"color .15s" }}>{label}</span>
              </button>
            );
          })}
        </div>

        {/* stars */}
        <div style={{ padding:"16px 20px 14px", borderBottom:`1px solid ${C.border}`, textAlign:"center" }}>
          <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.18em", textTransform:"uppercase", marginBottom:10 }}>Rate</div>
          <div style={{ display:"flex", justifyContent:"center" }}>
            <Stars value={form.rating} onChange={r=>setForm({...form,rating:r})} size={38} />
          </div>
        </div>

        {/* status */}
        <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}` }}>
          <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.18em", textTransform:"uppercase", marginBottom:10 }}>Status</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {["played","playing","want to play","dropped"].map(s=>(
              <button key={s} onClick={()=>setForm({...form,status:s})} style={{
                padding:"12px 8px", borderRadius:3, border:"none", cursor:"pointer",
                fontWeight:800, fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em",
                background: form.status===s ? SC[s] : C.faint,
                color: form.status===s ? "#000" : C.muted,
                transition:"all .15s",
              }}>{s}</button>
            ))}
          </div>
        </div>

        {/* review */}
        <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}` }}>
          <textarea value={form.review} onChange={e=>setForm({...form,review:e.target.value})}
            placeholder="Write a review…" rows={3}
            style={{ ...iSt, fontStyle:"italic", resize:"none", lineHeight:1.65, fontFamily:"Georgia,serif", fontSize:14 }} />
        </div>

        {/* goty */}
        <div style={{ padding:"12px 20px 14px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontSize:14, color:C.muted }}>🏆  Game of the Year</span>
          <button onClick={()=>setForm({...form,goty:!form.goty})}
            style={{ width:46, height:26, borderRadius:13, border:"none", cursor:"pointer", position:"relative", transition:"background .2s",
              background:form.goty?C.yellow:C.faint }}>
            <div style={{ position:"absolute", top:3, left:form.goty?23:3, width:20, height:20, borderRadius:"50%", background:"#fff", transition:"left .2s", boxShadow:"0 1px 4px rgba(0,0,0,.5)" }} />
          </button>
        </div>

        <div style={{ padding:"0 20px" }}>
          <button onClick={()=>onSave({...game,...form})} style={{
            width:"100%", padding:16, borderRadius:3, border:"none",
            background:C.pink, color:"#fff", fontSize:16, fontWeight:600, cursor:"pointer", letterSpacing:"0.06em", textTransform:"uppercase"
          }}>{user ? "Save & Sync" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

// ── GAME DETAIL ───────────────────────────────────────────────────────────────
function GameDetail({ game, onBack, onUpdate, user }) {
  const [sheet, setSheet] = useState(false);

  const saveAndSyncLog = async (g) => {
    onUpdate(g);
    if (!user) return;
    try {
      await insertGameLog({
        user_id: user.id,
        game_id: g.id,
        title: g.title,
        cover: g.cover,
        developer: g.developer,
        publisher: g.publisher,
        year: g.year,
        status: g.status,
        rating: g.rating,
        review: g.review,
      });
    } catch (err) {
      console.error("Failed to save game log to Supabase:", err);
    }
  };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"system-ui,sans-serif" }}>
      {/* hero — stripe only at very top, once */}
      <div style={{ position:"relative", height:"clamp(265px, 50vh, 520px)", overflow:"hidden" }}>
        <Img src={game.hero} style={{ width:"100%", height:"100%", filter:"brightness(.36) saturate(.7)" }} />
        <div style={{ position:"absolute", inset:0, background:`linear-gradient(to bottom, rgba(14,14,16,.05) 0%, ${C.bg} 100%)` }} />
        <StripeBar height={4} style={{ position:"absolute", top:0, left:0, right:0 }} />
        <button onClick={onBack} style={{ position:"absolute", top:"clamp(54px, 10vh, 84px)", left:"clamp(16px, 3vw, 32px)", background:"rgba(14,14,16,.75)", border:`1px solid ${C.border}`, color:C.text, width:36, height:36, borderRadius:2, fontSize:20, cursor:"pointer", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.2s" }}>‹</button>
      </div>

      {/* poster + title */}
      <div style={{ display:"flex", gap:"clamp(16px, 3vw, 24px)", padding:"0 clamp(18px, 5vw, 48px)", marginTop:"-clamp(60px, 12vh, 100px)", position:"relative", zIndex:2, maxWidth:"1200px", margin:"0 auto" }}>
        <div style={{ width:"clamp(80px, 15vw, 140px)", height:"clamp(105px, 22vw, 185px)", borderRadius:4, overflow:"hidden", flexShrink:0, boxShadow:"0 14px 44px rgba(0,0,0,.9)" }}>
          <Img src={game.cover} style={{ width:"100%", height:"100%" }} />
        </div>
        <div style={{ paddingTop:"clamp(60px, 15vh, 100px)" }}>
          <div style={{ fontSize:"clamp(24px, 5vw, 40px)", fontWeight:900, lineHeight:1.1, letterSpacing:"-.3px" }}>{game.title}</div>
          <div style={{ fontSize:"clamp(12px, 2vw, 15px)", color:C.muted, marginTop:5 }}>{game.year}</div>
          {game.rating>0 && <div style={{ marginTop:8 }}><Stars value={game.rating} size={20} /></div>}
        </div>
      </div>

      <div style={{ padding:"clamp(26px, 5vh, 40px) clamp(18px, 5vw, 48px) 0", maxWidth:"1200px", margin:"0 auto", width:"100%" }}>
        {game.tagline && (
          <div style={{ fontSize:"clamp(10px, 1vw, 12px)", fontWeight:800, color:C.muted, letterSpacing:"0.22em", textTransform:"uppercase", marginBottom:"clamp(22px, 4vh, 32px)" }}>{game.tagline}</div>
        )}

        {/* big developer */}
        <div style={{ marginBottom:"clamp(24px, 4vh, 36px)" }}>
          <div style={{ fontSize:"clamp(9px, 1vw, 11px)", color:C.muted, letterSpacing:"0.2em", textTransform:"uppercase", marginBottom:5 }}>Developed by</div>
          <div style={{ fontSize:"clamp(28px, 5vw, 44px)", fontWeight:900, color:C.text, letterSpacing:"-.4px", lineHeight:1 }}>{game.developer}</div>
        </div>

        {/* meta grid */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))", gap:"clamp(14px, 3vw, 20px)", marginBottom:"clamp(22px, 4vh, 32px)", padding:"clamp(16px, 3vw, 24px)", background:C.surface, borderRadius:4, border:`1px solid ${C.border}` }}>
          {[["PUBLISHED BY",game.publisher],["GENRE",game.genre],["RELEASE YEAR",String(game.year)],["YOUR PLAYTIME",game.playtime>0?`${game.playtime} hrs`:"—"]].map(([l,v])=>(
            <div key={l}>
              <div style={{ fontSize:"clamp(9px, 1vw, 11px)", color:C.muted, letterSpacing:"0.18em", textTransform:"uppercase", marginBottom:3 }}>{l}</div>
              <div style={{ fontSize:"clamp(14px, 2.5vw, 18px)", fontWeight:800, color:C.text }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ height:1, background:C.border, marginBottom:"clamp(18px, 3vh, 28px)" }} />
        <div style={{ fontSize:"clamp(13px, 2vw, 16px)", color:"rgba(240,237,232,.58)", lineHeight:1.9, marginBottom:"clamp(24px, 4vh, 36px)" }}>{game.desc}</div>

        {/* histogram */}
        <div style={{ marginBottom:"clamp(24px, 4vh, 36px)" }}>
          <div style={{ fontSize:"clamp(9px, 1vw, 11px)", color:C.muted, letterSpacing:"0.2em", textTransform:"uppercase", marginBottom:10 }}>Community Rating</div>
          <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:40 }}>
            {[2,4,8,13,20,30,25,17,10,5].map((h,i)=>(
              <div key={i} style={{ flex:1, borderRadius:"2px 2px 0 0", background:"rgba(240,237,232,.13)", height:`${(h/30)*100}%` }} />
            ))}
          </div>
        </div>

        {/* your log */}
        {game.status!=="want to play"&&(game.rating>0||game.review) && (
          <div style={{ background:C.surface, borderRadius:4, padding:"clamp(14px, 2vh, 20px)", marginBottom:"clamp(22px, 4vh, 32px)", border:`1px solid ${C.border}` }}>
            <div style={{ fontSize:"clamp(9px, 1vw, 11px)", color:C.muted, letterSpacing:"0.2em", textTransform:"uppercase", marginBottom:10 }}>Your Log</div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:game.review?10:0 }}>
              <Stars value={game.rating} size={22} />
              <span style={{ fontSize:"clamp(9px, 1vw, 11px)", fontWeight:800, color:SC[game.status], letterSpacing:"0.1em", textTransform:"uppercase" }}>{game.status}</span>
            </div>
            {game.review && <div style={{ fontStyle:"italic", fontSize:"clamp(13px, 2vw, 16px)", color:C.muted, lineHeight:1.8, borderLeft:`2px solid ${C.border}`, paddingLeft:12 }}>"{game.review}"</div>}
          </div>
        )}

        {game.goty && (
          <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(250,192,0,.07)", border:`1px solid rgba(250,192,0,.18)`, borderRadius:3, padding:"8px 14px", marginBottom:"clamp(24px, 4vh, 36px)" }}>
            <span>🏆</span>
            <span style={{ fontSize:"clamp(10px, 1.5vw, 12px)", fontWeight:900, color:C.yellow, letterSpacing:"0.1em", textTransform:"uppercase" }}>Game of the Year</span>
          </div>
        )}

        <div style={{ height:100 }} />
      </div>

      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:"calc(1200px + 24px)", padding:"12px clamp(18px, 5vw, 48px) clamp(24px, 4vh, 40px)", background:`linear-gradient(to top, ${C.bg} 65%, transparent)`, zIndex:50 }}>
        <button onClick={()=>setSheet(true)} style={{
          width:"100%", padding:"clamp(14px, 2vh, 18px)", borderRadius:3, border: game.status==="want to play"?`1px solid ${C.border}`:"none", cursor:"pointer",
          background: game.status==="want to play" ? C.surface : C.pink,
          color: game.status==="want to play" ? C.text : "#fff",
          fontSize:"clamp(14px, 2vw, 16px)", fontWeight:900, letterSpacing:"0.08em", textTransform:"uppercase", transition:"all 0.2s"
        }}>{game.status==="want to play" ? "Log this Game" : "Edit Log"}</button>
      </div>

      {sheet && (
        <LogSheet game={game} user={user} onClose={()=>setSheet(false)} onSave={g=>{saveAndSyncLog(g);setSheet(false);}} />
      )}
    </div>
  );
}

// ── HOME ──────────────────────────────────────────────────────────────────────
function HomeScreen({ games, logs, onGameClick }) {
  const hasLogs = logs.length > 0;
  const played  = hasLogs ? logs.filter(g=>g.status==="played") : [];
  const playing = hasLogs ? logs.filter(g=>g.status==="playing") : [];
  const goty    = hasLogs ? logs.filter(g=>g.goty) : [];
  const avgR    = played.filter(g=>g.rating>0).length
    ? (played.filter(g=>g.rating>0).reduce((a,g)=>a+g.rating,0)/played.filter(g=>g.rating>0).length).toFixed(1) : "—";
  const heroGame = hasLogs ? logs[0] : null;

  return (
    <div style={{ paddingBottom:90, color:C.text, fontFamily:"system-ui,sans-serif" }}>
      {hasLogs ? (
        heroGame && (
          <div onClick={()=>onGameClick(heroGame)} style={{ position:"relative", height:"clamp(280px, 45vh, 480px)", overflow:"hidden", cursor:"pointer", margin:"0 0 36px 0" }}>
            <Img src={heroGame.hero || heroGame.cover} style={{ width:"100%", height:"100%", filter:"brightness(.36) saturate(.7)" }} />
            <div style={{ position:"absolute", inset:0, background:`linear-gradient(to bottom, transparent 20%, ${C.bg} 100%)` }} />
            <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"0 clamp(18px, 5vw, 48px) clamp(22px, 6vh, 42px)" }}>
              <div style={{ fontSize:"clamp(10px, 1vw, 13px)", letterSpacing:"0.22em", color:C.muted, marginBottom:"clamp(8px, 2vh, 16px)", textTransform:"uppercase", fontWeight:800 }}>Featured</div>
              <div style={{ fontSize:"clamp(30px, 6vw, 52px)", fontWeight:900, lineHeight:1.05, letterSpacing:"-.4px" }}>{heroGame.title}</div>
              <div style={{ fontSize:"clamp(12px, 2vw, 16px)", color:C.muted, marginTop:"clamp(5px, 1vh, 12px)" }}>{heroGame.year} · {heroGame.developer}</div>
            </div>
          </div>
        )
      ) : (
        <div style={{ padding:"32px clamp(18px, 5vw, 48px)", marginBottom:24, borderRadius:12, background:C.surface, border:`1px solid ${C.border}` }}>
          <div style={{ fontSize:"clamp(22px, 4vw, 32px)", fontWeight:900, marginBottom:14 }}>Welcome to Kortana</div>
          <div style={{ fontSize:"clamp(13px, 2vw, 16px)", color:C.muted, lineHeight:1.7 }}>This account has played 0 games so far. Start browsing games and save your first log to build your library.</div>
        </div>
      )}

      {/* stats grid — responsive */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(140px, 1fr))", margin:"0 clamp(18px, 5vw, 48px) 32px", gap:"clamp(8px, 2vw, 16px)" }}>
        {[["Played",played.length,C.green],["Playing",playing.length,C.blue],["Avg",avgR==="—"?avgR:avgR+"★",C.text],["GOTY",goty.length,C.yellow]].map(([l,v,col])=>(
          <div key={l} style={{ background:C.surface, borderRadius:6, padding:"clamp(14px, 3vw, 20px)", textAlign:"center", border:`1px solid ${C.border}`, transition:"all 0.3s ease", cursor:"default" }}>
            <div style={{ fontSize:"clamp(18px, 4vw, 32px)", fontWeight:900, color:col, letterSpacing:"-.2px" }}>{v}</div>
            <div style={{ fontSize:"clamp(9px, 1vw, 11px)", color:C.muted, marginTop:"clamp(3px, 1vh, 8px)", letterSpacing:"0.12em", textTransform:"uppercase" }}>{l}</div>
          </div>
        ))}
      </div>

      <Section label="Recently Logged">
        {hasLogs ? (
          <div style={{ display:"flex", gap:"clamp(10px, 2vw, 16px)", overflowX:"auto", paddingBottom:4, scrollSnapType:"x mandatory", paddingLeft:"clamp(18px, 5vw, 48px)", paddingRight:"clamp(18px, 5vw, 48px)", marginLeft:"-clamp(18px, 5vw, 48px)", marginRight:"-clamp(18px, 5vw, 48px)" }}>
            {[...logs].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,8).map(g=>(
              <div key={g.id} style={{ width:"clamp(100px, 20vw, 160px)", flexShrink:0, scrollSnapAlign:"start" }}>
                <PosterCard game={g} onClick={onGameClick} />
              </div>
            ))}
          </div>
        ) : (
          <Empty label="No games logged yet" icon="📝" />
        )}
      </Section>

      {playing.length>0 && (
        <Section label="Currently Playing">
          {playing.map((g,i)=><DiaryRow key={g.id} game={g} index={i} onClick={onGameClick} />)}
        </Section>
      )}

      {goty.length>0 && (
        <Section label="Games of the Year">
          <div style={{ display:"flex", gap:"clamp(10px, 2vw, 16px)", overflowX:"auto", paddingBottom:4, scrollSnapType:"x mandatory", paddingLeft:"clamp(18px, 5vw, 48px)", paddingRight:"clamp(18px, 5vw, 48px)", marginLeft:"-clamp(18px, 5vw, 48px)", marginRight:"-clamp(18px, 5vw, 48px)" }}>
            {goty.map(g=>(
              <div key={g.id} style={{ width:"clamp(100px, 20vw, 160px)", flexShrink:0, scrollSnapAlign:"start" }}>
                <PosterCard game={g} onClick={onGameClick} />
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ── DIARY ─────────────────────────────────────────────────────────────────────
function DiaryScreen({ logs, onGameClick }) {
  const [filter, setFilter] = useState("all");
  const list = logs.filter(g=>filter==="all"||g.status===filter).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  return (
    <div style={{ paddingBottom:90, color:C.text, fontFamily:"system-ui,sans-serif" }}>
      <div style={{ padding:"clamp(52px, 12vh, 72px) clamp(18px, 5vw, 48px) clamp(14px, 3vh, 20px)", position:"sticky", top:0, background:C.bg, zIndex:10, borderBottom:`1px solid ${C.border}` }}>
        <div style={{ fontSize:"clamp(22px, 4vw, 32px)", fontWeight:900, marginBottom:"clamp(14px, 2vh, 20px)", letterSpacing:"-.3px" }}>Diary</div>
        <Pills items={["all","played","playing","want to play","dropped"]} active={filter} onSelect={setFilter} />
      </div>
      <div style={{ padding:"clamp(6px, 1.5vh, 12px) clamp(18px, 5vw, 48px) 0" }}>
        {list.map((g,i)=><DiaryRow key={g.id} game={g} index={i} onClick={onGameClick} />)}
        {list.length===0 && <Empty label="No diary entries yet" />}
      </div>
    </div>
  );
}

// ── BROWSE ────────────────────────────────────────────────────────────────────
function BrowseScreen({ games, onGameClick }) {
  const [search, setSearch] = useState("");
  const [genre,  setGenre]  = useState("All");
  const [pub,    setPub]    = useState("All");
  const [sort,   setSort]   = useState("recent");
  const [remoteResults, setRemoteResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const searchingOnline = search.trim().length > 0;

  useEffect(() => {
    const query = search.trim();
    const controller = new AbortController();
    let active = true;

    if (!query) {
      setRemoteResults([]);
      setError(null);
      setLoading(false);
      return () => controller.abort();
    }

    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      fetch(`${RAWG_API_URL}/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(query)}&page_size=8`, { signal: controller.signal })
        .then(res => {
          if (!res.ok) throw new Error("RAWG search failed");
          return res.json();
        })
        .then(async data => {
          if (!active) return;
          const results = data.results || [];
          const details = await Promise.all(results.map(async item => {
            try {
              const detailRes = await fetch(`${RAWG_API_URL}/games/${item.id}?key=${RAWG_API_KEY}`, { signal: controller.signal });
              if (!detailRes.ok) return normalizeRawgGame(item);
              const detailJson = await detailRes.json();
              return normalizeRawgGame(detailJson);
            } catch {
              return normalizeRawgGame(item);
            }
          }));
          if (active) setRemoteResults(details.filter(Boolean));
        })
        .catch(err => {
          if (err.name !== "AbortError" && active) setError(err.message || "Unable to load search results");
        })
        .finally(() => { if (active) setLoading(false); });
    }, 450);

    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [search]);

  let list = games
    .filter(g=>!search||g.title.toLowerCase().includes(search.toLowerCase()))
    .filter(g=>genre==="All"||g.genre===genre)
    .filter(g=>pub==="All"||g.publisher===pub);
  if (sort==="rating") list=[...list].sort((a,b)=>b.rating-a.rating);
  if (sort==="year")   list=[...list].sort((a,b)=>b.year-a.year);

  const displayed = searchingOnline ? remoteResults : list;

  return (
    <div style={{ paddingBottom:90, color:C.text, fontFamily:"system-ui,sans-serif" }}>
      <div style={{ padding:"clamp(52px, 12vh, 72px) clamp(18px, 5vw, 48px) clamp(14px, 3vh, 20px)", position:"sticky", top:0, background:C.bg, zIndex:10, borderBottom:`1px solid ${C.border}` }}>
        <div style={{ position:"relative", marginBottom:"clamp(12px, 2vh, 18px)" }}>
          <span style={{ position:"absolute", left:13, top:"50%", transform:"translateY(-50%)", fontSize:"clamp(13px, 2vw, 16px)", color:C.muted }}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search games…"
            style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:3, padding:"clamp(10px, 2vh, 14px) 14px clamp(10px, 2vh, 14px) 38px", color:C.text, fontSize:"clamp(14px, 2vw, 16px)", outline:"none", boxSizing:"border-box", transition:"border-color 0.2s" }} />
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:"clamp(8px, 1.5vh, 12px)" }}>
          <Pills items={GENRES}     active={genre} onSelect={setGenre} />
          <Pills items={PUBLISHERS} active={pub}   onSelect={setPub} />
          {searchingOnline && (
            <div style={{ fontSize:"clamp(11px, 1.5vw, 13px)", color:C.muted, marginTop:4 }}>
              {loading ? "Searching RAWG…" : error ? `Error: ${error}` : `${remoteResults.length} RAWG result${remoteResults.length===1?"":"s"}`}
            </div>
          )}
          <div style={{ display:"flex", gap:6 }}>
            {[["recent","Recent"],["rating","Top Rated"],["year","Newest"]].map(([v,l])=>(
              <button key={v} onClick={()=>setSort(v)} style={{ padding:"6px 14px", borderRadius:2, border:"none", cursor:"pointer", fontSize:"clamp(10px, 1.2vw, 11px)", fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase", background:sort===v?C.faint:"transparent", color:sort===v?C.text:C.muted, transition:"all 0.15s" }}>{l}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ padding:"clamp(14px, 3vh, 20px) clamp(18px, 5vw, 48px) 0" }}>
        {searchingOnline ? (
          <div style={{ display:"flex", flexDirection:"column", gap:"clamp(12px, 2vw, 18px)" }}>
            {displayed.map(g => (
              <div key={g.id} onClick={()=>onGameClick(g)} style={{
                display:"flex", gap:"clamp(12px, 2vw, 16px)", padding:"clamp(12px, 2vh, 16px)", background:C.surface, borderRadius:4, border:`1px solid ${C.border}`, cursor:"pointer", transition:"all 0.2s ease", hover: { background: C.faint }
              }}>
                <div style={{ width:"clamp(60px, 12vw, 100px)", height:"clamp(80px, 16vw, 132px)", borderRadius:3, overflow:"hidden", flexShrink:0 }}>
                  <Img src={g.cover} style={{ width:"100%", height:"100%" }} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:"clamp(15px, 2.5vw, 18px)", fontWeight:800, color:C.text, marginBottom:4 }}>{g.title}</div>
                  <div style={{ fontSize:"clamp(11px, 1.5vw, 13px)", color:C.muted, marginBottom:2 }}>{g.year} · {g.developer} · {g.publisher}</div>
                  <div style={{ fontSize:"clamp(11px, 1.5vw, 13px)", color:C.muted, lineHeight:1.5, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{g.desc}</div>
                </div>
              </div>
            ))}
            {displayed.length===0 && <Empty label="No search results" />}
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(clamp(100px, 20vw, 160px), 1fr))", gap:"clamp(10px, 2vw, 16px)" }}>
            {displayed.map(g=><PosterCard key={g.id} game={g} onClick={onGameClick} />)}
            {displayed.length===0 && <div style={{ gridColumn:"1/-1" }}><Empty label="No games found" /></div>}
          </div>
        )}
      </div>
    </div>
  );
}

function LogsScreen({ logs, loading }) {
  return (
    <div style={{ paddingBottom:90, color:C.text, fontFamily:"system-ui,sans-serif" }}>
      <div style={{ padding:"clamp(52px, 12vh, 72px) clamp(18px, 5vw, 48px) clamp(14px, 3vh, 20px)", position:"sticky", top:0, background:C.bg, zIndex:10, borderBottom:`1px solid ${C.border}` }}>
        <div style={{ fontSize:"clamp(22px, 4vw, 32px)", fontWeight:900, marginBottom:"clamp(8px, 1.5vh, 12px)" }}>Saved Logs</div>
        <div style={{ fontSize:"clamp(13px, 2vw, 15px)", color:C.muted }}>Your saved game log entries from Supabase.</div>
      </div>
      <div style={{ padding:"clamp(14px, 3vh, 20px) clamp(18px, 5vw, 48px) 0" }}>
        {loading ? (
          <Empty label="Loading saved logs…" icon="⏳" />
        ) : logs.length === 0 ? (
          <Empty label="No saved logs yet" />
        ) : (
          <div style={{ display:"grid", gap:"clamp(12px, 2vw, 16px)" }}>
            {logs.map(log => (
              <div key={log.id} style={{ display:"flex", gap:"clamp(12px, 2vw, 16px)", padding:"clamp(12px, 2vh, 16px)", borderRadius:8, background:C.surface, border:`1px solid ${C.border}` }}>
                <div style={{ width:"clamp(68px, 12vw, 100px)", height:"clamp(88px, 14vw, 132px)", borderRadius:6, overflow:"hidden", flexShrink:0, background:C.bg }}>
                  <Img src={log.cover} style={{ width:"100%", height:"100%" }} />
                </div>
                <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ fontSize:"clamp(14px, 2.5vw, 16px)", fontWeight:900, color:C.text, marginBottom:4 }}>{log.title}</div>
                    <div style={{ fontSize:"clamp(10px, 1.5vw, 12px)", color:C.muted, marginBottom:8 }}>{log.year || '—'} · {log.developer || 'Unknown'}</div>
                    <div style={{ fontSize:"clamp(11px, 1.5vw, 13px)", color:C.muted, lineHeight:1.6, overflow:"hidden", textOverflow:"ellipsis", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{log.review || 'No review yet.'}</div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, marginTop:12 }}>
                    <span style={{ fontSize:"clamp(9px, 1vw, 11px)", fontWeight:800, color:SC[log.status]||C.muted, textTransform:"uppercase", letterSpacing:"0.08em" }}>{log.status || 'Unknown'}</span>
                    <Stars value={log.rating || 0} size={14} />
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

  const iSt = { width:"100%", background:C.faint, border:`1px solid ${C.border}`, borderRadius:3, padding:"clamp(10px, 2vh, 14px) 14px", color:C.text, fontSize:"clamp(14px, 2vw, 16px)", outline:"none", boxSizing:"border-box", transition:"all 0.2s" };

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
      <div style={{ minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"system-ui,sans-serif", paddingBottom:90 }}>
        <div style={{ padding:"clamp(52px, 12vh, 72px) clamp(18px, 5vw, 48px) clamp(16px, 3vh, 24px)", background:C.bg, position:"sticky", top:0, zIndex:10, borderBottom:`1px solid ${C.border}` }}>
          <button onClick={()=>{setOpen(null);setEditing(false);setAdding(false);}} style={{ background:"none", border:"none", color:C.muted, fontSize:"clamp(11px, 1.5vw, 13px)", cursor:"pointer", marginBottom:"clamp(12px, 2vh, 18px)", padding:0, fontWeight:800, letterSpacing:"0.1em", textTransform:"uppercase" }}>‹ Lists</button>
          {editing ? (
            <>
              <input value={open.name} onChange={e=>updateList({...open,name:e.target.value})} style={{...iSt,fontSize:"clamp(18px, 3vw, 24px)",fontWeight:900,marginBottom:10}} />
              <input value={open.desc||""} onChange={e=>updateList({...open,desc:e.target.value})} placeholder="Description…" style={{...iSt,marginBottom:"clamp(12px, 2vh, 16px)"}} />
              <div style={{ display:"flex", gap:8, marginTop:12 }}>
                <button onClick={()=>setEditing(false)} style={{ flex:1, padding:"clamp(10px, 2vh, 14px)", borderRadius:3, border:"none", background:C.pink, color:"#fff", fontWeight:600, cursor:"pointer", textTransform:"uppercase", letterSpacing:"0.06em", fontSize:"clamp(12px, 2vw, 14px)" }}>Done</button>
                <button onClick={()=>deleteList(open.id)} style={{ padding:"clamp(10px, 2vh, 14px) 16px", borderRadius:3, border:"none", background:"rgba(204,51,119,.12)", color:C.pink, fontWeight:600, cursor:"pointer", fontSize:"clamp(12px, 2vw, 14px)" }}>Delete</button>
              </div>
            </>
          ) : (
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:"clamp(22px, 4vw, 32px)", fontWeight:900 }}>{open.name}</div>
                {open.desc && <div style={{ fontSize:"clamp(12px, 2vw, 15px)", color:C.muted, marginTop:4 }}>{open.desc}</div>}
                <div style={{ fontSize:"clamp(10px, 1.5vw, 12px)", color:C.faint, marginTop:5 }}>{listGames.length} game{listGames.length!==1?"s":""}</div>
              </div>
              <button onClick={()=>setEditing(true)} style={{ background:C.faint, border:`1px solid ${C.border}`, color:C.muted, padding:"7px 16px", borderRadius:3, fontSize:"clamp(10px, 1.5vw, 12px)", fontWeight:800, cursor:"pointer", letterSpacing:"0.08em", textTransform:"uppercase" }}>Edit</button>
            </div>
          )}
        </div>
        <div style={{ padding:"clamp(8px, 1.5vh, 12px) clamp(18px, 5vw, 48px) 0", maxWidth:"1200px", margin:"0 auto", width:"100%" }}>
          {listGames.map((g,i)=>(
            <div key={g.id} style={{ display:"flex", alignItems:"center" }}>
              <div style={{ flex:1 }}><DiaryRow game={g} index={i} onClick={onGameClick} /></div>
              <button onClick={()=>updateList({...open,gameIds:open.gameIds.filter(id=>id!==g.id)})} style={{ background:"none", border:"none", color:C.faint, fontSize:18, cursor:"pointer", padding:"0 4px", transition:"all 0.2s" }}>✕</button>
            </div>
          ))}
          {listGames.length===0 && <Empty label="No games in this list" />}
        </div>
        <div style={{ padding:"0 clamp(18px, 5vw, 48px)", marginTop:16, maxWidth:"1200px", margin:"16px auto 0" }}>
          {!adding ? (
            <button onClick={()=>setAdding(true)} style={{ width:"100%", padding:"clamp(12px, 2vh, 16px)", borderRadius:3, border:`1px dashed ${C.border}`, background:"transparent", color:C.muted, fontSize:"clamp(12px, 2vw, 14px)", fontWeight:800, cursor:"pointer", letterSpacing:"0.08em", textTransform:"uppercase", transition:"all 0.2s" }}>+ Add a Game</button>
          ) : (
            <div>
              <div style={{ fontSize:"clamp(10px, 1.5vw, 12px)", color:C.muted, letterSpacing:"0.18em", textTransform:"uppercase", marginBottom:10 }}>Add to list</div>
              {notIn.map(g=>(
                <div key={g.id} onClick={()=>updateList({...open,gameIds:[...open.gameIds,g.id]})}
                  style={{ display:"flex", alignItems:"center", gap:"clamp(12px, 2vw, 16px)", padding:"clamp(11px, 2vh, 14px) 0", borderBottom:`1px solid ${C.border}`, cursor:"pointer", transition:"all 0.2s" }}>
                  <div style={{ width:"clamp(36px, 7vw, 50px)", height:"clamp(48px, 10vw, 66px)", borderRadius:3, overflow:"hidden", flexShrink:0 }}>
                    <Img src={g.cover} style={{ width:"100%", height:"100%" }} />
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:"clamp(13px, 2.5vw, 16px)", fontWeight:800 }}>{g.title}</div>
                    <div style={{ fontSize:"clamp(10px, 1.5vw, 12px)", color:C.muted }}>{g.year} · {g.genre}</div>
                  </div>
                  <span style={{ fontSize:"clamp(18px, 3vw, 24px)", color:C.yellow, fontWeight:900 }}>+</span>
                </div>
              ))}
              {notIn.length===0 && <div style={{ fontSize:"clamp(12px, 2vw, 14px)", color:C.muted, textAlign:"center", padding:"20px 0" }}>All games added</div>}
              <button onClick={()=>setAdding(false)} style={{ width:"100%", marginTop:14, padding:"clamp(12px, 2vh, 14px)", borderRadius:3, border:"none", background:C.faint, color:C.muted, fontWeight:800, cursor:"pointer", textTransform:"uppercase", letterSpacing:"0.08em", fontSize:"clamp(12px, 2vw, 14px)" }}>Done</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom:90, color:C.text, fontFamily:"system-ui,sans-serif" }}>
      <div style={{ padding:"clamp(52px, 12vh, 72px) clamp(18px, 5vw, 48px) clamp(20px, 4vh, 28px)" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
          <div style={{ fontSize:"clamp(22px, 4vw, 32px)", fontWeight:900 }}>Your Lists</div>
          <button onClick={()=>setAdding(true)} style={{ background:C.pink, border:"none", color:"#fff", padding:"8px 18px", borderRadius:3, fontSize:"clamp(10px, 1.5vw, 12px)", fontWeight:600, cursor:"pointer", letterSpacing:"0.1em", textTransform:"uppercase", transition:"all 0.2s" }}>+ New</button>
        </div>
        {adding && (
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:3, padding:"clamp(16px, 3vw, 24px)", marginTop:16, marginBottom:8 }}>
            <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="List name…" style={{...iSt,fontSize:"clamp(16px, 2.5vw, 18px)",fontWeight:800,marginBottom:10}} />
            <input value={newDesc} onChange={e=>setNewDesc(e.target.value)} placeholder="Description (optional)…" style={{...iSt,marginBottom:"clamp(12px, 2vh, 16px)"}} />
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={createList} style={{ flex:1, padding:"clamp(12px, 2vh, 14px)", borderRadius:3, border:"none", background:C.pink, color:"#fff", fontWeight:600, cursor:"pointer", textTransform:"uppercase", letterSpacing:"0.06em", fontSize:"clamp(12px, 2vw, 14px)" }}>Create</button>
              <button onClick={()=>{setAdding(false);setNewName("");setNewDesc("");}} style={{ padding:"clamp(12px, 2vh, 14px) 16px", borderRadius:3, border:"none", background:C.faint, color:C.muted, fontWeight:800, cursor:"pointer", fontSize:"clamp(12px, 2vw, 14px)" }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
      <div style={{ padding:"0 clamp(18px, 5vw, 48px)", maxWidth:"1200px", margin:"0 auto", width:"100%" }}>
        {lists.length===0&&!adding && <Empty label="Create your first list" icon="📋" />}
        {lists.map(list=>{
          const covers = games.filter(g=>list.gameIds.slice(0,3).includes(g.id));
          return (
            <div key={list.id} onClick={()=>{setOpen(list);setEditing(false);setAdding(false);}}
              style={{ display:"flex", alignItems:"center", gap:"clamp(12px, 2vw, 18px)", padding:"clamp(14px, 2vh, 18px) 0", borderBottom:`1px solid ${C.border}`, cursor:"pointer", transition:"all 0.2s" }}>
              <div style={{ display:"flex", gap:"clamp(3px, 0.5vw, 6px)", flexShrink:0 }}>
                {[0,1,2].map(i=>(
                  <div key={i} style={{ width:"clamp(38px, 7vw, 56px)", height:"clamp(50px, 10vw, 74px)", borderRadius:3, overflow:"hidden", background:C.surface, border:`1px solid ${C.border}` }}>
                    {covers[i] && <Img src={covers[i].cover} style={{ width:"100%", height:"100%" }} />}
                  </div>
                ))}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:"clamp(15px, 2.5vw, 18px)", fontWeight:900 }}>{list.name}</div>
                {list.desc && <div style={{ fontSize:"clamp(11px, 1.5vw, 13px)", color:C.muted, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{list.desc}</div>}
                <div style={{ fontSize:"clamp(10px, 1.5vw, 12px)", color:C.faint, marginTop:4 }}>{list.gameIds.length} game{list.gameIds.length!==1?"s":""}</div>
              </div>
              <div style={{ color:C.blue, fontSize:"clamp(16px, 2.5vw, 20px)", fontWeight:500 }}>›</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function Kortana() {
  const [games,  setGames]  = useState(INIT_GAMES);
  const [lists,  setLists]  = useState(INIT_LISTS);
  const [tab,    setTab]    = useState("home");
  const [detail, setDetail] = useState(null);
  const [user,   setUser]   = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const initAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    };
    initAuth();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setLogs([]);
      return;
    }

    const loadLogs = async () => {
      setLogsLoading(true);
      const { data, error } = await supabase
        .from('game_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Error loading saved logs:', error);
        setLogs([]);
      } else {
        setLogs(data || []);
      }
      setLogsLoading(false);
    };

    loadLogs();
  }, [user]);

  const updateGame = u => setGames(gs=>gs.map(g=>g.id===u.id?u:g));

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const TABS = [
    { key:"home",   label:"Home"   },
    { key:"diary",  label:"Diary"  },
    { key:"browse", label:"Browse" },
    { key:"logs",   label:"Saved"  },
    { key:"lists",  label:"Lists"  },
  ];

  if (authLoading) {
    return (
      <div style={{ minHeight:"100vh", background:C.bg, color:C.text, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"system-ui,sans-serif" }}>
        Loading auth…
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div style={{ minHeight:"100vh", background:C.bg, position:"relative", overflowX:"hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;1,400;1,500&display=swap');
        @keyframes fadeUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;font-family:'Poppins',sans-serif}
        ::-webkit-scrollbar{display:none}
        input,textarea,select{color-scheme:dark}
        input::placeholder,textarea::placeholder{color:#444444!important}

        @media (min-width: 768px) {
          body { padding: 0 12px; }
        }
      `}</style>

      <div style={{ maxWidth:"1200px", margin:"0 auto", width:"100%", padding:"0 12px" }}>

      {!detail && (
        <div style={{ position:"fixed", top:14, right:"clamp(18px, 5vw, 48px)", zIndex:210, display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:"clamp(10px, 1vw, 12px)", color:C.muted, maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.email}</span>
          <button onClick={handleSignOut} style={{ padding:"8px 12px", borderRadius:999, border:"none", background:C.pink, color:"#fff", fontWeight:600, cursor:"pointer", fontSize:"clamp(10px, 1vw, 11px)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Sign Out</button>
        </div>
      )}

      {detail ? (
        <GameDetail
          game={games.find(g=>g.id===detail.id)||detail}
          user={user}
          onBack={()=>setDetail(null)}
          onUpdate={g=>{updateGame(g);setDetail(g);}}
        />
      ) : (
        <>
          {tab==="home"   && <HomeScreen   games={games} logs={logs} onGameClick={setDetail} />}
          {tab==="diary"  && <DiaryScreen  logs={logs} onGameClick={setDetail} />}
          {tab==="browse" && <BrowseScreen games={games} onGameClick={setDetail} />}
          {tab==="logs"   && <LogsScreen   logs={logs} loading={logsLoading} />}
          {tab==="lists"  && <ListsScreen  lists={lists} games={games} setLists={setLists} onGameClick={setDetail} />}
        </>
      )}

      {/* bottom tab bar */}
      {!detail && (
        <div style={{ position:"fixed", bottom:0, left:0, right:0,
          background:`rgba(14,14,16,.98)`, backdropFilter:"blur(20px)", borderTop:`1px solid ${C.border}`,
          display:"grid", gridTemplateColumns:"repeat(5,1fr)", zIndex:100, paddingBottom:12, overflow:"hidden" }}>
          <StripeBar height={2} style={{ position:"absolute", top:0, left:0, right:0 }} />
          {TABS.map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)} style={{
              background:"none", border:"none", cursor:"pointer", padding:"12px 8px 4px",
              display:"flex", flexDirection:"column", alignItems:"center", gap:2, transition:"all 0.15s ease" }}>
              <span style={{ fontSize:"clamp(11px, 1vw, 12px)", fontWeight:600, letterSpacing:"0.04em", textTransform:"uppercase",
                color:tab===t.key?C.blue:C.muted, transition:"color .15s", opacity:tab===t.key?1:0.6 }}>{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* wordmark */}
      {!detail && (
        <div style={{ position:"fixed", top:0, left:0, right:0,
          padding:"clamp(14px, 3vw, 24px) clamp(18px, 5vw, 48px)", pointerEvents:"none", zIndex:200 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <svg width="28" height="28" viewBox="0 0 110 110" fill="none">
              <path d="M16 10 L16 100 L34 100 L34 62 L68 100 L92 100 L54 55 L90 10 L66 10 L34 46 L34 10 Z" fill="none" stroke="#2255CC" strokeWidth="4"/>
              <path d="M90 10 L54 55" stroke="#CC3377" strokeWidth="4" fill="none"/>
              <path d="M34 62 L68 100 L92 100" stroke="#FAC000" strokeWidth="4" fill="none"/>
              <path d="M54 55 L92 100" stroke="#00A850" strokeWidth="4" fill="none"/>
            </svg>
            <span style={{ fontSize:"clamp(18px, 3vw, 24px)", fontWeight:500, letterSpacing:"-0.5px", color:C.text }}>ortana</span>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
