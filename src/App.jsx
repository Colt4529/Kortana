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

const STRIPES = ["#2255CC","#CC3377","#FAC000","#00A850"];
const SC = { "played":C.green, "playing":C.blue, "want to play":C.yellow, "dropped":C.muted };
const GENRES     = ["All","RPG","Action","Roguelike","Platformer","Metroidvania","Strategy","Horror","Sports","Adventure"];
const PUBLISHERS = ["All","Bandai Namco","Supergiant","Team Cherry","ZA/UM","Extremely OK","Activision","Motion Twin","Nintendo"];
const RAWG_API_KEY = "372eea2d4d9d4de7a1ee03d66d6842eb";
const RAWG_API_URL = "https://api.rawg.io/api";

function normalizeRawgGame(raw) {
  const cover = raw.background_image || raw.background_image_additional || raw.background || "";
  const hero  = raw.background_image_additional || raw.background_image || raw.background || "";
  return {
    id: raw.id,
    title: raw.name,
    cover, hero,
    year: raw.released ? Number(raw.released.slice(0,4)) : null,
    developer: raw.developers?.[0]?.name || raw.developer || "Unknown",
    publisher: raw.publishers?.[0]?.name || raw.publisher || "Unknown",
    desc: raw.description_raw || raw.short_description || raw.description || "No description available.",
    rating: raw.rating ? Math.round(raw.rating) : 0,
    metacritic: raw.metacritic || 0,
    genre: raw.genres?.[0]?.name || "Unknown",
    status: "", goty: false, tagline: raw.tagline || "", playtime: 0, review: "",
  };
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
  const [mode, setMode]         = useState("sign-in");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [message, setMessage]   = useState("");

  const submit = async () => {
    setLoading(true); setMessage("");
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) { setMessage("Enter both email and password."); setLoading(false); return; }
    if (mode === "sign-in") {
      const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
      if (error) setMessage(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email: trimmedEmail, password });
      if (error) setMessage(error.message);
      else setMessage("Check your email to confirm your account.");
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
            <button key={m} onClick={()=>{setMode(m);setMessage("");}} style={{
              flex:1, padding:"10px 0", borderRadius:8, border:"none", cursor:"pointer",
              background: mode===m ? C.surface : "transparent",
              color: mode===m ? C.text : C.muted,
              fontWeight:500, fontSize:14, transition:"all .2s",
              boxShadow: mode===m ? "0 1px 4px rgba(0,0,0,.4)" : "none",
            }}>{l}</button>
          ))}
        </div>

        {/* Inputs */}
        <div style={{ display:"grid", gap:0, marginBottom:28 }}>
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
        </div>

        {/* Error / success */}
        {message && (
          <div style={{ fontSize:13, color: message.startsWith("Check") ? C.green : C.pink, marginBottom:20, lineHeight:1.5 }}>{message}</div>
        )}

        {/* CTA */}
        <button onClick={submit} disabled={loading} style={{
          width:"100%", padding:"15px 0", borderRadius:10, border:"none",
          background: loading ? C.faint : C.pink,
          color: loading ? C.muted : "#fff",
          fontWeight:500, fontSize:15, cursor: loading ? "default" : "pointer",
          letterSpacing:"0.04em", transition:"background .2s",
        }}>
          {loading ? "Working…" : mode==="sign-in" ? "Sign In" : "Create Account"}
        </button>

        {/* Swap mode */}
        <div style={{ textAlign:"center", marginTop:28 }}>
          <span style={{ fontSize:13, color:"#444" }}>{mode==="sign-in" ? "Don't have an account? " : "Already have an account? "}</span>
          <button onClick={()=>{setMode(mode==="sign-in"?"sign-up":"sign-in");setMessage("");}} style={{ background:"none", border:"none", color:C.blue, fontSize:13, cursor:"pointer", fontWeight:500, padding:0 }}>
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
      position:"relative", aspectRatio:"2/3", borderRadius:8, overflow:"hidden", cursor:"pointer",
      boxShadow:"0 4px 20px rgba(0,0,0,.6)", transition:"transform 0.2s ease",
    }}>
      <Img src={game.cover} style={{ width:"100%", height:"100%" }} />
      <div style={{ position:"absolute", inset:0, background:"linear-gradient(to top, rgba(10,10,10,.95) 0%, transparent 55%)" }} />
      <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"clamp(8px,2vw,12px)" }}>
        <div style={{ fontSize:"clamp(10px,1.5vw,12px)", fontWeight:500, color:C.text, lineHeight:1.3, marginBottom:4 }}>{game.title}</div>
        <Stars value={game.rating} size={10} />
      </div>
      {game.goty && (
        <div style={{ position:"absolute", top:8, right:8, background:C.yellow, borderRadius:4, padding:"2px 6px", fontSize:8, fontWeight:500, color:"#000", letterSpacing:"1px", textTransform:"uppercase" }}>GOTY</div>
      )}
      <div style={{ position:"absolute", top:10, left:10, width:6, height:6, borderRadius:"50%", background:SC[game.status]||C.muted }} />
    </div>
  );
}

function DiaryRow({ game, onClick, index=0 }) {
  return (
    <div onClick={()=>onClick?.(game)}
      style={{ display:"flex", gap:"clamp(12px,2vw,16px)", padding:"clamp(14px,2vh,18px) 0", borderBottom:`0.5px solid ${C.border}`, cursor:"pointer", animation:`fadeUp .3s ${Math.min(index,8)*.04}s both` }}>
      <div style={{ width:"clamp(42px,8vw,52px)", height:"clamp(56px,11vw,70px)", borderRadius:6, overflow:"hidden", flexShrink:0, boxShadow:"0 4px 14px rgba(0,0,0,.5)" }}>
        <Img src={game.cover} style={{ width:"100%", height:"100%" }} />
      </div>
      <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", justifyContent:"center", gap:4 }}>
        <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}>
          <span style={{ fontSize:"clamp(13px,2.5vw,15px)", fontWeight:500, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{game.title}</span>
          {game.goty && <span style={{ background:"rgba(250,192,0,.09)", border:`0.5px solid rgba(250,192,0,.25)`, borderRadius:4, padding:"1px 6px", fontSize:8, fontWeight:500, color:C.yellow, flexShrink:0, letterSpacing:"1px", textTransform:"uppercase" }}>GOTY</span>}
        </div>
        <Stars value={game.rating} size={12} />
        {game.review ? <div style={{ fontSize:12, fontStyle:"italic", color:C.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{game.review}</div> : null}
      </div>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", justifyContent:"space-between", flexShrink:0 }}>
        <span style={{ fontSize:10, color:"#444" }}>{game.year}</span>
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
function GameDetail({ game, onBack, onUpdate, user }) {
  const [sheet, setSheet] = useState(false);

  const saveAndSyncLog = async (g) => {
    onUpdate(g);
    if (!user) return;
    try {
      await insertGameLog({
        user_id: user.id, game_id: g.id, title: g.title, cover: g.cover,
        developer: g.developer, publisher: g.publisher, year: g.year,
        status: g.status, rating: g.rating, review: g.review,
      });
    } catch (err) { console.error("Failed to save game log to Supabase:", err); }
  };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text }}>
      <div style={{ position:"relative", height:"clamp(265px,50vh,520px)", overflow:"hidden" }}>
        <Img src={game.hero} style={{ width:"100%", height:"100%", filter:"brightness(.3) saturate(.6)" }} />
        <div style={{ position:"absolute", inset:0, background:`linear-gradient(to bottom, rgba(10,10,10,.05) 0%, ${C.bg} 100%)` }} />
        <StripeBar height={3} style={{ position:"absolute", top:0, left:0, right:0 }} />
        <button onClick={onBack} style={{ position:"absolute", top:"clamp(54px,10vh,84px)", left:"clamp(16px,3vw,32px)", background:"rgba(10,10,10,.75)", border:`0.5px solid ${C.border}`, color:C.text, width:34, height:34, borderRadius:8, fontSize:18, cursor:"pointer", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
      </div>

      <div style={{ display:"flex", gap:"clamp(16px,3vw,24px)", padding:"0 clamp(18px,5vw,48px)", marginTop:"-clamp(60px,12vh,100px)", position:"relative", zIndex:2, maxWidth:"1200px", margin:"0 auto" }}>
        <div style={{ width:"clamp(80px,15vw,130px)", height:"clamp(105px,22vw,175px)", borderRadius:8, overflow:"hidden", flexShrink:0, boxShadow:"0 14px 44px rgba(0,0,0,.9)" }}>
          <Img src={game.cover} style={{ width:"100%", height:"100%" }} />
        </div>
        <div style={{ paddingTop:"clamp(60px,15vh,100px)" }}>
          <div style={{ fontSize:"clamp(22px,5vw,36px)", fontWeight:500, lineHeight:1.1, letterSpacing:"-0.5px" }}>{game.title}</div>
          <div style={{ fontSize:13, color:C.muted, marginTop:6 }}>{game.year}</div>
          {game.rating>0 && <div style={{ marginTop:10 }}><Stars value={game.rating} size={18} /></div>}
        </div>
      </div>

      <div style={{ padding:"clamp(26px,5vh,40px) clamp(18px,5vw,48px) 0", maxWidth:"1200px", margin:"0 auto", width:"100%" }}>
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

      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:"calc(1200px + 24px)", padding:"12px clamp(18px,5vw,48px) clamp(24px,4vh,40px)", background:`linear-gradient(to top, ${C.bg} 65%, transparent)`, zIndex:50 }}>
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

// ── GOTY RACE SIDEBAR ─────────────────────────────────────────────────────────
const GOTY_2026 = [
  { id:"pragmata",  title:"Pragmata",               developer:"Capcom",                mc:0 },
  { id:"fable",     title:"Fable",                  developer:"Playground Games",      mc:0 },
  { id:"judas",     title:"Judas",                  developer:"Ghost Story Games",     mc:0 },
  { id:"wolverine", title:"Marvel's Wolverine",     developer:"Insomniac Games",       mc:0 },
  { id:"ow2",       title:"The Outer Worlds 2",     developer:"Obsidian Entertainment",mc:0 },
  { id:"silksong",  title:"Hollow Knight: Silksong",developer:"Team Cherry",           mc:0 },
  { id:"mgsd",      title:"Metal Gear Solid Delta", developer:"Konami",                mc:0 },
  { id:"mafia",     title:"Mafia: The Old Country", developer:"Hangar 13",             mc:0 },
  { id:"bl4",       title:"Borderlands 4",          developer:"Gearbox Software",      mc:0 },
  { id:"yotei",     title:"Ghost of Yotei",         developer:"Sucker Punch",          mc:0 },
];

function GotyRace({ onGameClick }) {
  const [list, setList]       = useState(GOTY_2026.map(g=>({ ...g, cover:"" })));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    let mounted = true;
    (async () => {
      try {
        const fetched = await Promise.all(
          GOTY_2026.map(async game => {
            try {
              const r = await fetch(
                `${RAWG_API_URL}/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(game.title)}&page_size=1`,
                { signal: ctrl.signal }
              );
              if (!r.ok) return { ...game, cover:"" };
              const d = await r.json();
              const hit = d.results?.[0];
              return { ...game, cover: hit?.background_image||"", mc: hit?.metacritic||game.mc };
            } catch { return { ...game, cover:"" }; }
          })
        );
        if (mounted) { setList(fetched); setLoading(false); }
      } catch { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; ctrl.abort(); };
  }, []);

  const rankColor = i => i === 0 ? C.yellow : i <= 2 ? C.muted : "#444";
  const mcColor   = mc => mc >= 90 ? C.yellow : mc >= 80 ? C.green : C.blue;

  const handleClick = game => {
    onGameClick({
      id: game.id, title: game.title, developer: game.developer,
      cover: game.cover, hero: game.cover,
      year: 2025, rating: 0, status:"", goty:false, desc:"", review:"",
      publisher:"", genre:"", playtime:0,
    });
  };

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:8 }}>
        <span style={{ fontSize:10, fontWeight:500, letterSpacing:"2px", color:"#444", textTransform:"uppercase", flexShrink:0 }}>GOTY Race 2026</span>
        <div style={{ flex:1, height:"0.5px", background:C.border }} />
      </div>
      <div style={{ fontSize:10, color:"#333", letterSpacing:"0.5px", marginBottom:16 }}>Updated as scores drop throughout the year</div>
      {loading && <div style={{ fontSize:11, color:"#444", letterSpacing:"1px", marginBottom:12 }}>Fetching covers…</div>}
      {list.map((game, i) => (
        <div key={game.id} onClick={()=>handleClick(game)}
          style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:`0.5px solid ${C.border}`, cursor:"pointer" }}>
          <div style={{ width:18, fontSize:11, fontWeight:500, color:rankColor(i), textAlign:"right", flexShrink:0 }}>{i+1}</div>
          <div style={{ width:32, height:44, borderRadius:4, overflow:"hidden", flexShrink:0, background:C.faint }}>
            <Img src={game.cover} style={{ width:"100%", height:"100%" }} />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:500, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", lineHeight:1.3 }}>{game.title}</div>
            <div style={{ fontSize:10, color:"#444", marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{game.developer}</div>
          </div>
          <div style={{ flexShrink:0, textAlign:"center", minWidth:28 }}>
            {game.mc > 0 ? (
              <>
                <div style={{ fontSize:13, fontWeight:500, color:mcColor(game.mc), lineHeight:1 }}>{game.mc}</div>
                <div style={{ fontSize:8, color:"#333", letterSpacing:"0.5px", textTransform:"uppercase", marginTop:2 }}>MC</div>
              </>
            ) : (
              <div style={{ fontSize:11, color:"#333", letterSpacing:"0.5px" }}>—</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── HOME ──────────────────────────────────────────────────────────────────────
function HomeScreen({ games, logs, onGameClick }) {
  const wide    = useWindowWidth() >= 860;
  const hasLogs = logs.length > 0;
  const played  = hasLogs ? logs.filter(g=>g.status==="played") : [];
  const playing = hasLogs ? logs.filter(g=>g.status==="playing") : [];
  const avgR    = played.filter(g=>g.rating>0).length
    ? (played.filter(g=>g.rating>0).reduce((a,g)=>a+g.rating,0)/played.filter(g=>g.rating>0).length).toFixed(1) : "—";
  const heroGame = hasLogs ? logs[0] : null;

  const SectionHead = ({ label }) => (
    <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
      <span style={{ fontSize:10, fontWeight:500, letterSpacing:"2px", color:"#444", textTransform:"uppercase", flexShrink:0 }}>{label}</span>
      <div style={{ flex:1, height:"0.5px", background:C.border }} />
    </div>
  );

  return (
    <div style={{ paddingBottom:90, color:C.text }}>

      {/* Hero */}
      {hasLogs && heroGame ? (
        <div onClick={()=>onGameClick(heroGame)} style={{ position:"relative", height:"clamp(280px,45vh,480px)", overflow:"hidden", cursor:"pointer", marginBottom:32 }}>
          <Img src={heroGame.hero||heroGame.cover} style={{ width:"100%", height:"100%", filter:"brightness(.3) saturate(.6)" }} />
          <div style={{ position:"absolute", inset:0, background:`linear-gradient(to bottom, transparent 20%, ${C.bg} 100%)` }} />
          <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"0 clamp(18px,5vw,48px) clamp(22px,6vh,42px)" }}>
            <div style={{ fontSize:10, letterSpacing:"2px", color:"#444", marginBottom:"clamp(8px,2vh,14px)", textTransform:"uppercase", fontWeight:500 }}>Featured</div>
            <div style={{ fontSize:"clamp(28px,6vw,48px)", fontWeight:500, lineHeight:1.05, letterSpacing:"-0.5px" }}>{heroGame.title}</div>
            <div style={{ fontSize:13, color:C.muted, marginTop:"clamp(5px,1vh,10px)" }}>{heroGame.year} · {heroGame.developer}</div>
          </div>
        </div>
      ) : !hasLogs && (
        <div style={{ padding:"32px clamp(18px,5vw,48px)", marginBottom:32, borderRadius:12, background:C.surface, border:`0.5px solid ${C.border}` }}>
          <div style={{ fontSize:"clamp(20px,4vw,28px)", fontWeight:500, marginBottom:12, letterSpacing:"-0.3px" }}>Welcome to Kortana</div>
          <div style={{ fontSize:15, color:C.muted, lineHeight:1.7 }}>Start browsing games and save your first log to build your library.</div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", margin:"0 clamp(18px,5vw,48px) 32px", gap:"clamp(8px,2vw,12px)" }}>
        {[["Played",played.length,C.green],["Playing",playing.length,C.blue],["Avg Rating",avgR==="—"?avgR:avgR+" / 5",C.text]].map(([l,v,col])=>(
          <div key={l} style={{ background:C.surface, borderRadius:12, padding:"clamp(14px,3vw,20px)", textAlign:"center", border:`0.5px solid ${C.border}` }}>
            <div style={{ fontSize:"clamp(18px,4vw,28px)", fontWeight:500, color:col, letterSpacing:"-0.3px" }}>{v}</div>
            <div style={{ fontSize:10, color:"#444", marginTop:6, letterSpacing:"2px", textTransform:"uppercase", fontWeight:500 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Body — 2-col on wide screens */}
      <div style={{
        display: wide ? "grid" : "block",
        gridTemplateColumns: wide ? "1fr 256px" : "1fr",
        gap: wide ? 40 : 0,
        padding: "0 clamp(18px,5vw,48px)",
        alignItems: "start",
      }}>

        {/* Main column */}
        <div>
          <div style={{ paddingTop:32 }}>
            <SectionHead label="Recently Logged" />
            {hasLogs ? (
              <div style={{ display:"flex", gap:"clamp(10px,2vw,14px)", overflowX:"auto", paddingBottom:4, scrollSnapType:"x mandatory", marginLeft:"-clamp(18px,5vw,48px)", marginRight:"-clamp(18px,5vw,48px)", paddingLeft:"clamp(18px,5vw,48px)", paddingRight:"clamp(18px,5vw,48px)" }}>
                {[...logs].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,8).map(g=>(
                  <div key={g.id} style={{ width:"clamp(100px,20vw,150px)", flexShrink:0, scrollSnapAlign:"start" }}>
                    <PosterCard game={g} onClick={onGameClick} />
                  </div>
                ))}
              </div>
            ) : <Empty label="No games logged yet" />}
          </div>

          {playing.length > 0 && (
            <div style={{ paddingTop:32 }}>
              <SectionHead label="Currently Playing" />
              {playing.map((g,i)=><DiaryRow key={g.id} game={g} index={i} onClick={onGameClick} />)}
            </div>
          )}
        </div>

        {/* GOTY Race sidebar */}
        <div style={{ paddingTop:32, position: wide ? "sticky" : "static", top:80 }}>
          <GotyRace onGameClick={onGameClick} />
        </div>

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
function BrowseScreen({ games, onGameClick }) {
  const [search,  setSearch]  = useState("");
  const [genre,   setGenre]   = useState("All");
  const [pub,     setPub]     = useState("All");
  const [sort,    setSort]    = useState("recent");
  const [minYear, setMinYear] = useState(null);
  const [remoteResults, setRemoteResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const searchingOnline = search.trim().length > 0;

  useEffect(() => {
    const query = search.trim();
    if (!query) { setRemoteResults([]); setError(null); setLoading(false); return; }
    setLoading(true); setError(null);
    let active = true;
    const ctrl = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const yearParam = minYear
          ? `&dates=${minYear}-01-01,${new Date().getFullYear()}-12-31`
          : "";
        const r = await fetch(
          `${RAWG_API_URL}/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(query)}&page_size=20&exclude_additions=true&ordering=-added${yearParam}`,
          { signal: ctrl.signal }
        );
        if (!r.ok) throw new Error("Search failed");
        const data = await r.json();
        if (!active) return;

        // quality gate: must have a cover, a release date, and some traction
        const qualified = (data.results || [])
          .filter(g =>
            g.background_image &&
            g.released &&
            (g.added >= 15 || g.metacritic > 0 || g.ratings_count >= 3)
          )
          .slice(0, 8);

        const details = await Promise.all(
          qualified.map(async item => {
            try {
              const dr = await fetch(`${RAWG_API_URL}/games/${item.id}?key=${RAWG_API_KEY}`, { signal: ctrl.signal });
              return normalizeRawgGame(dr.ok ? await dr.json() : item);
            } catch { return normalizeRawgGame(item); }
          })
        );
        if (active) setRemoteResults(details.filter(Boolean));
      } catch (err) {
        if (active && err.name !== "AbortError") setError(err.message || "Unable to load results");
      } finally {
        if (active) setLoading(false);
      }
    }, 480);

    return () => { active = false; clearTimeout(timer); ctrl.abort(); };
  }, [search, minYear]);

  let list = games
    .filter(g=>!search||g.title.toLowerCase().includes(search.toLowerCase()))
    .filter(g=>genre==="All"||g.genre===genre)
    .filter(g=>pub==="All"||g.publisher===pub);
  if (sort==="rating") list=[...list].sort((a,b)=>b.rating-a.rating);
  if (sort==="year")   list=[...list].sort((a,b)=>b.year-a.year);
  const displayed = searchingOnline ? remoteResults : list;

  const mcColor = mc => mc >= 90 ? C.yellow : mc >= 75 ? C.green : C.blue;

  return (
    <div style={{ paddingBottom:90, color:C.text }}>
      <div style={{ padding:"clamp(52px,12vh,72px) clamp(18px,5vw,48px) clamp(14px,3vh,20px)", position:"sticky", top:0, background:C.bg, zIndex:10, borderBottom:`0.5px solid ${C.border}` }}>
        <div style={{ position:"relative", marginBottom:"clamp(12px,2vh,18px)" }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search games…"
            style={{ width:"100%", background:C.surface, border:`0.5px solid ${C.border}`, borderRadius:8, padding:"clamp(10px,2vh,13px) 14px", color:C.text, fontSize:14, outline:"none", boxSizing:"border-box" }} />
        </div>

        {searchingOnline ? (
          <div style={{ display:"flex", flexDirection:"column", gap:"clamp(8px,1.5vh,10px)" }}>
            {/* Year filter for online search */}
            <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:2 }}>
              {YEAR_OPTS.map(opt => {
                const active = minYear === opt.value;
                return (
                  <button key={opt.label} onClick={()=>setMinYear(opt.value)} style={{
                    flexShrink:0, padding:"6px 14px", borderRadius:20,
                    border:`0.5px solid ${active ? C.pink : C.border}`,
                    cursor:"pointer", fontSize:11, fontWeight:500, letterSpacing:"1px", textTransform:"uppercase",
                    background: active ? C.pink : "transparent",
                    color: active ? "#fff" : C.muted, transition:"all .15s",
                  }}>{opt.label}</button>
                );
              })}
            </div>
            <div style={{ fontSize:11, color:"#444", letterSpacing:"1px" }}>
              {loading ? "Searching…" : error ? `Error: ${error}` : !remoteResults.length ? "" : `${remoteResults.length} result${remoteResults.length===1?"":"s"} · sorted by popularity`}
            </div>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:"clamp(8px,1.5vh,12px)" }}>
            <Pills items={GENRES}     active={genre} onSelect={setGenre} />
            <Pills items={PUBLISHERS} active={pub}   onSelect={setPub} />
            <div style={{ display:"flex", gap:6 }}>
              {[["recent","Recent"],["rating","Top Rated"],["year","Newest"]].map(([v,l])=>(
                <button key={v} onClick={()=>setSort(v)} style={{ padding:"5px 14px", borderRadius:20, border:`0.5px solid ${sort===v?C.border:"transparent"}`, cursor:"pointer", fontSize:11, fontWeight:500, letterSpacing:"1px", textTransform:"uppercase", background:sort===v?C.faint:"transparent", color:sort===v?C.text:C.muted, transition:"all 0.15s" }}>{l}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding:"clamp(14px,3vh,20px) clamp(18px,5vw,48px) 0" }}>
        {searchingOnline ? (
          <div style={{ display:"flex", flexDirection:"column", gap:"clamp(10px,2vw,12px)" }}>
            {loading && remoteResults.length === 0 && (
              <div style={{ padding:"40px 0", textAlign:"center" }}>
                <div style={{ fontSize:11, color:"#444", letterSpacing:"2px", textTransform:"uppercase" }}>Searching…</div>
              </div>
            )}
            {displayed.map(g=>(
              <div key={g.id} onClick={()=>onGameClick(g)} style={{ display:"flex", gap:"clamp(12px,2vw,16px)", padding:"clamp(12px,2vh,16px)", background:C.surface, borderRadius:12, border:`0.5px solid ${C.border}`, cursor:"pointer" }}>
                <div style={{ width:"clamp(56px,12vw,84px)", height:"clamp(74px,16vw,112px)", borderRadius:6, overflow:"hidden", flexShrink:0, background:C.faint }}>
                  <Img src={g.cover} style={{ width:"100%", height:"100%" }} />
                </div>
                <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ fontSize:"clamp(14px,2.5vw,16px)", fontWeight:500, marginBottom:4, lineHeight:1.3 }}>{g.title}</div>
                    <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>
                      {g.year || "—"}{g.developer !== "Unknown" ? ` · ${g.developer}` : ""}
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
                      <div style={{ fontSize:10, color:"#444", background:C.faint, borderRadius:4, padding:"3px 8px", letterSpacing:"0.5px" }}>{g.genre}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {!loading && displayed.length === 0 && !error && <Empty label="No results — try a different search or year filter" />}
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(clamp(100px,20vw,150px),1fr))", gap:"clamp(10px,2vw,14px)" }}>
            {displayed.map(g=><PosterCard key={g.id} game={g} onClick={onGameClick} />)}
            {displayed.length===0 && <div style={{ gridColumn:"1/-1" }}><Empty label="No games found" /></div>}
          </div>
        )}
      </div>
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
        <div style={{ padding:"clamp(8px,1.5vh,12px) clamp(18px,5vw,48px) 0", maxWidth:"1200px", margin:"0 auto", width:"100%" }}>
          {listGames.map((g,i)=>(
            <div key={g.id} style={{ display:"flex", alignItems:"center" }}>
              <div style={{ flex:1 }}><DiaryRow game={g} index={i} onClick={onGameClick} /></div>
              <button onClick={()=>updateList({...open,gameIds:open.gameIds.filter(id=>id!==g.id)})} style={{ background:"none", border:"none", color:"#444", fontSize:16, cursor:"pointer", padding:"0 4px" }}>✕</button>
            </div>
          ))}
          {listGames.length===0 && <Empty label="No games in this list" />}
        </div>
        <div style={{ padding:"0 clamp(18px,5vw,48px)", maxWidth:"1200px", margin:"16px auto 0" }}>
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
      <div style={{ padding:"0 clamp(18px,5vw,48px)", maxWidth:"1200px", margin:"0 auto", width:"100%" }}>
        {lists.length===0&&!adding && <Empty label="Create your first list" />}
        {lists.map(list=>{
          const covers = games.filter(g=>list.gameIds.slice(0,3).includes(g.id));
          return (
            <div key={list.id} onClick={()=>{setOpen(list);setEditing(false);setAdding(false);}}
              style={{ display:"flex", alignItems:"center", gap:"clamp(12px,2vw,18px)", padding:"clamp(14px,2vh,18px) 0", borderBottom:`0.5px solid ${C.border}`, cursor:"pointer" }}>
              <div style={{ display:"flex", gap:"clamp(3px,0.5vw,5px)", flexShrink:0 }}>
                {[0,1,2].map(i=>(
                  <div key={i} style={{ width:"clamp(36px,7vw,52px)", height:"clamp(48px,10vw,70px)", borderRadius:6, overflow:"hidden", background:C.surface, border:`0.5px solid ${C.border}` }}>
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

function AccountModal({ user, displayName, photoUrl, setDisplayName, setPhotoUrl, onClose }) {
  const [name, setName]     = useState(displayName);
  const [url,  setUrl]      = useState(photoUrl);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState("");
  const initial = (name || user.email)[0].toUpperCase();

  const save = async () => {
    setSaving(true); setMsg("");
    const { error } = await supabase.auth.updateUser({ data: { display_name: name.trim(), avatar_url: url.trim() } });
    if (error) setMsg(error.message);
    else { setDisplayName(name.trim()); setPhotoUrl(url.trim()); setMsg("Saved."); }
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

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function Kortana() {
  const [games,  setGames]  = useState(INIT_GAMES);
  const [lists,  setLists]  = useState(INIT_LISTS);
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

  useEffect(() => {
    let mounted = true;
    const initAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) { setDisplayName(u.user_metadata?.display_name || ""); setPhotoUrl(u.user_metadata?.avatar_url || ""); }
      setAuthLoading(false);
    };
    initAuth();
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const u = session?.user ?? null;
      setUser(u);
      if (u) { setDisplayName(u.user_metadata?.display_name || ""); setPhotoUrl(u.user_metadata?.avatar_url || ""); }
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

  const updateGame = u => setGames(gs=>gs.map(g=>g.id===u.id?u:g));
  const handleSignOut = async () => { await supabase.auth.signOut(); setUser(null); setDisplayName(""); setPhotoUrl(""); };

  const TABS = [
    { key:"home",   label:"Home"   },
    { key:"diary",  label:"Diary"  },
    { key:"browse", label:"Browse" },
    { key:"logs",   label:"Saved"  },
    { key:"lists",  label:"Lists"  },
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
        @keyframes fadeUp  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;font-family:'Poppins',sans-serif}
        ::-webkit-scrollbar{display:none}
        input,textarea,select{color-scheme:dark}
        input::placeholder,textarea::placeholder{color:#444444!important}
        @media(min-width:768px){body{padding:0 12px}}
      `}</style>

      <div style={{ maxWidth:"1200px", margin:"0 auto", width:"100%", padding:"0 12px" }}>

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

              {/* Right: avatar / settings trigger */}
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
          </>
        )}

        {/* ── Screens ── */}
        {detail ? (
          <GameDetail game={games.find(g=>g.id===detail.id)||detail} user={user} onBack={()=>setDetail(null)} onUpdate={g=>{updateGame(g);setDetail(g);}} />
        ) : (
          <>
            {tab==="home"   && <HomeScreen   games={games} logs={logs} onGameClick={setDetail} />}
            {tab==="diary"  && <DiaryScreen  logs={logs} onGameClick={setDetail} />}
            {tab==="browse" && <BrowseScreen games={games} onGameClick={setDetail} />}
            {tab==="logs"   && <LogsScreen   logs={logs} loading={logsLoading} />}
            {tab==="lists"  && <ListsScreen  lists={lists} games={[...new Map(logs.map(l=>[l.game_id||l.id,{...l,id:l.game_id||l.id,hero:l.cover}])).values()]} setLists={setLists} onGameClick={setDetail} />}
          </>
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

        {/* ── Modals ── */}
        {settingsModal === "account" && (
          <AccountModal user={user} displayName={displayName} photoUrl={photoUrl} setDisplayName={setDisplayName} setPhotoUrl={setPhotoUrl} onClose={()=>setSettingsModal(null)} />
        )}
        {settingsModal === "friends" && (
          <FriendsModal onClose={()=>setSettingsModal(null)} />
        )}

      </div>
    </div>
  );
}
