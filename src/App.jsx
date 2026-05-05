import { useState, useEffect } from "react";

const C = {
  bg:      "#0e0e10",
  surface: "#16161a",
  border:  "rgba(255,255,255,0.07)",
  text:    "#f0ede8",
  muted:   "rgba(240,237,232,0.38)",
  faint:   "rgba(240,237,232,0.09)",
  yellow:  "#f5c518",
  green:   "#2ecc71",
  cyan:    "#00d4e8",
  red:     "#e8341c",
  orange:  "#f07020",
  blue:    "#2060f0",
};

const STRIPES = ["#e8341c","#f07020","#f5c518","#2ecc71","#00d4e8","#2060f0"];
const SC = { "played":C.green, "playing":C.cyan, "want to play":C.yellow, "dropped":C.red };
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

const INIT_GAMES = [
  { id:1, title:"Elden Ring",    year:2022, genre:"RPG",         publisher:"Bandai Namco", developer:"FromSoftware",    rating:5, status:"played",       goty:true,  liked:true,  review:"Every corner hides something incredible.", playtime:120, date:"2024-03-10",
    cover:"https://media.rawg.io/media/games/b29/b294fad93cd20b4f4c33b9a35d89c84e.jpg",
    hero:"https://media.rawg.io/media/screenshots/1ac/1ac19f31974314855ad7be4bea5e503e.jpg",
    tagline:"THE LANDS BETWEEN AWAIT",
    desc:"A vast open-world action RPG co-written with George R.R. Martin. Forge your legend through a shattered realm ruled by demigods, where every encounter holds mystery and death." },
  { id:2, title:"Hades",         year:2020, genre:"Roguelike",   publisher:"Supergiant",   developer:"Supergiant Games", rating:5, status:"played",       goty:false, liked:true,  review:"One more run. Always one more run.", playtime:80, date:"2024-02-20",
    cover:"https://media.rawg.io/media/games/1f4/1f47a270b8f241f1b9716a9f5cdc4869.jpg",
    hero:"https://media.rawg.io/media/screenshots/f36/f36f1773a2e73e4f37e93b11cb4e0a3d.jpg",
    tagline:"DEATH IS ONLY THE BEGINNING",
    desc:"Battle out of the Underworld in this rogue-like dungeon crawler. Each escape attempt tells a deeper story about gods, family, and fate." },
  { id:3, title:"Hollow Knight",  year:2017, genre:"Metroidvania",publisher:"Team Cherry",  developer:"Team Cherry",     rating:4, status:"playing",      goty:false, liked:false, review:"Lost in Hallownest, loving every second.", playtime:45, date:"2024-04-01",
    cover:"https://media.rawg.io/media/games/4cf/4cfc6b7f1850590a4634b08bfab308ab.jpg",
    hero:"https://media.rawg.io/media/screenshots/6a0/6a08afca72024e3f8a042fc5c0a71596.jpg",
    tagline:"FORGE YOUR OWN PATH",
    desc:"Explore a vast underground kingdom of insects and heroes. Beautiful, haunting, and deeply atmospheric." },
  { id:4, title:"Disco Elysium",  year:2019, genre:"RPG",         publisher:"ZA/UM",        developer:"ZA/UM",           rating:5, status:"played",       goty:true,  liked:true,  review:"Changed how I think about games.", playtime:60, date:"2024-01-15",
    cover:"https://media.rawg.io/media/games/f46/f466571d536f2753c02c7200d03a1826.jpg",
    hero:"https://media.rawg.io/media/screenshots/1a6/1a6a956f1c9bfb7d96a35cd1c609a73e.jpg",
    tagline:"WHO ARE YOU AGAIN?",
    desc:"A groundbreaking RPG with no combat — only dialogue. Play as a disgraced detective piecing together your identity in a city full of ideology and regret." },
  { id:5, title:"Celeste",        year:2018, genre:"Platformer",  publisher:"Extremely OK", developer:"Maddy Thorson",   rating:4, status:"played",       goty:false, liked:true,  review:"Story hit different. Hard but fair.", playtime:12, date:"2023-12-05",
    cover:"https://media.rawg.io/media/games/594/59487800889ebac294c7c2c070d02356.jpg",
    hero:"https://media.rawg.io/media/screenshots/73e/73e18e94cc51b41a58dd06d8bbc58124.jpg",
    tagline:"CLIMB THE MOUNTAIN",
    desc:"Help Madeline survive her inner demons on her journey to the top of Celeste Mountain. Mental health wrapped in precision platforming." },
  { id:6, title:"Sekiro",         year:2019, genre:"Action",      publisher:"Activision",   developer:"FromSoftware",    rating:5, status:"played",       goty:false, liked:false, review:"Perfected the art of the parry.", playtime:55, date:"2023-10-18",
    cover:"https://media.rawg.io/media/games/67f/67f62d1f062a6164f57575e0604ee9f6.jpg",
    hero:"https://media.rawg.io/media/screenshots/166/166a7e5e79e73f4416f486e45e2b82b3.jpg",
    tagline:"DEFY DEATH",
    desc:"Carve your own path to vengeance as the one-armed wolf in Sengoku-era Japan. Posture, patience, and perfect timing." },
  { id:7, title:"Dead Cells",     year:2018, genre:"Roguelike",   publisher:"Motion Twin",  developer:"Motion Twin",     rating:0, status:"want to play", goty:false, liked:false, review:"", playtime:0, date:"2024-04-10",
    cover:"https://media.rawg.io/media/games/8d6/8d69eb6c32ed6acfd75f82d532144993.jpg",
    hero:"https://media.rawg.io/media/screenshots/b26/b265cd0c6c07eb8e4040be17b1ab5eca.jpg",
    tagline:"DEATH IS NOT THE END",
    desc:"A rogue-lite metroidvania where no two runs are the same. Fast, fluid combat with hundreds of weapons." },
  { id:8, title:"Outer Wilds",    year:2019, genre:"Adventure",   publisher:"Annapurna",    developer:"Mobius Digital",  rating:5, status:"played",       goty:true,  liked:true,  review:"The best mystery I've ever experienced.", playtime:22, date:"2023-09-14",
    cover:"https://media.rawg.io/media/games/b7d/b7d3e6a92d8db04c0a96a9cf6c8ab879.jpg",
    hero:"https://media.rawg.io/media/screenshots/eac/eacf1d2049f87ee8f3d98eacdad9cdca.jpg",
    tagline:"SOME THINGS AREN'T MEANT TO BE UNDERSTOOD",
    desc:"A solar system stuck in a 22-minute time loop. Every answer leads to a deeper question. One of the most profound experiences in games." },
];

const INIT_LISTS = [
  { id:1, name:"All-Time Favorites", desc:"Games I'll never forget",    gameIds:[1,2,4,8] },
  { id:2, name:"Indie Gems",          desc:"Small teams, massive impact", gameIds:[3,5,7] },
];

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
    <div style={{ display:"flex", gap:7, overflowX:"auto", paddingBottom:2 }}>
      {items.map(item=>(
        <button key={item} onClick={()=>onSelect(item)} style={{
          flexShrink:0, padding:"7px 15px", borderRadius:2, border:"none", cursor:"pointer",
          fontSize:11, fontWeight:700, letterSpacing:"0.07em", textTransform:"uppercase",
          background: item===active ? C.yellow : C.faint,
          color: item===active ? "#000" : C.muted,
          transition:"all .15s",
        }}>{item}</button>
      ))}
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ padding:"22px 18px 0" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
        <span style={{ fontSize:10, fontWeight:800, letterSpacing:"0.2em", color:C.muted, textTransform:"uppercase" }}>{label}</span>
        <div style={{ flex:1, height:1, background:C.border }} />
      </div>
      {children}
    </div>
  );
}

function PosterCard({ game, onClick }) {
  return (
    <div onClick={()=>onClick?.(game)} style={{
      position:"relative", aspectRatio:"2/3", borderRadius:4, overflow:"hidden", cursor:"pointer",
      boxShadow:"0 4px 20px rgba(0,0,0,.6)",
    }}>
      <Img src={game.cover} style={{ width:"100%", height:"100%" }} />
      <div style={{ position:"absolute", inset:0, background:"linear-gradient(to top, rgba(14,14,16,.92) 0%, transparent 50%)" }} />
      <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"8px 8px 10px" }}>
        <div style={{ fontSize:11, fontWeight:800, color:C.text, lineHeight:1.2, marginBottom:3 }}>{game.title}</div>
        <Stars value={game.rating} size={10} />
      </div>
      {game.goty && (
        <div style={{ position:"absolute", top:7, right:7, background:C.yellow, borderRadius:2, padding:"2px 6px", fontSize:8, fontWeight:900, color:"#000", letterSpacing:"0.08em" }}>GOTY</div>
      )}
      <div style={{ position:"absolute", top:9, left:9, width:6, height:6, borderRadius:"50%", background:SC[game.status]||C.muted, opacity:0.8 }} />
    </div>
  );
}

function DiaryRow({ game, onClick, index=0 }) {
  return (
    <div onClick={()=>onClick?.(game)}
      style={{ display:"flex", gap:13, padding:"13px 0", borderBottom:`1px solid ${C.border}`, cursor:"pointer",
        animation:`fadeUp .3s ${Math.min(index,8)*.04}s both` }}>
      <div style={{ width:48, height:65, borderRadius:4, overflow:"hidden", flexShrink:0, boxShadow:"0 4px 14px rgba(0,0,0,.5)" }}>
        <Img src={game.cover} style={{ width:"100%", height:"100%" }} />
      </div>
      <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", justifyContent:"center", gap:3 }}>
        <div style={{ display:"flex", alignItems:"center", gap:7 }}>
          <span style={{ fontSize:15, fontWeight:800, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{game.title}</span>
          {game.goty && <span style={{ background:"rgba(245,197,24,.09)", border:`1px solid rgba(245,197,24,.25)`, borderRadius:2, padding:"0 5px", fontSize:8, fontWeight:900, color:C.yellow, flexShrink:0, letterSpacing:"0.08em" }}>GOTY</span>}
        </div>
        <Stars value={game.rating} size={13} />
        {game.review ? <div style={{ fontSize:11, fontStyle:"italic", color:C.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{game.review}</div> : null}
      </div>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", justifyContent:"space-between", flexShrink:0 }}>
        <span style={{ fontSize:9, color:C.faint }}>{game.year}</span>
        <span style={{ fontSize:9, fontWeight:800, color:SC[game.status]||C.muted, letterSpacing:"0.08em", textTransform:"uppercase" }}>{game.status}</span>
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
function LogSheet({ game, onClose, onSave }) {
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
          {[["👁","Played","played",C.green],["♥","Liked","liked",C.red],["🕒","Backlog","want to play",C.yellow]].map(([icon,label,val,col])=>{
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
            background:C.yellow, color:"#000", fontSize:16, fontWeight:900, cursor:"pointer", letterSpacing:"0.06em", textTransform:"uppercase"
          }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── GAME DETAIL ───────────────────────────────────────────────────────────────
function GameDetail({ game, onBack, onUpdate }) {
  const [sheet, setSheet] = useState(false);

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"system-ui,sans-serif" }}>
      {/* hero — stripe only at very top, once */}
      <div style={{ position:"relative", height:265, overflow:"hidden" }}>
        <Img src={game.hero} style={{ width:"100%", height:"100%", filter:"brightness(.36) saturate(.7)" }} />
        <div style={{ position:"absolute", inset:0, background:`linear-gradient(to bottom, rgba(14,14,16,.05) 0%, ${C.bg} 100%)` }} />
        <StripeBar height={4} style={{ position:"absolute", top:0, left:0, right:0 }} />
        <button onClick={onBack} style={{ position:"absolute", top:54, left:16, background:"rgba(14,14,16,.75)", border:`1px solid ${C.border}`, color:C.text, width:36, height:36, borderRadius:2, fontSize:20, cursor:"pointer", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
      </div>

      {/* poster + title */}
      <div style={{ display:"flex", gap:16, padding:"0 18px", marginTop:-78, position:"relative", zIndex:2 }}>
        <div style={{ width:98, height:130, borderRadius:4, overflow:"hidden", flexShrink:0, boxShadow:"0 14px 44px rgba(0,0,0,.9)" }}>
          <Img src={game.cover} style={{ width:"100%", height:"100%" }} />
        </div>
        <div style={{ paddingTop:86 }}>
          <div style={{ fontSize:23, fontWeight:900, lineHeight:1.1, letterSpacing:"-.3px" }}>{game.title}</div>
          <div style={{ fontSize:13, color:C.muted, marginTop:5 }}>{game.year}</div>
          {game.rating>0 && <div style={{ marginTop:7 }}><Stars value={game.rating} size={18} /></div>}
        </div>
      </div>

      <div style={{ padding:"26px 18px 0" }}>
        {game.tagline && (
          <div style={{ fontSize:10, fontWeight:800, color:C.muted, letterSpacing:"0.22em", textTransform:"uppercase", marginBottom:22 }}>{game.tagline}</div>
        )}

        {/* big developer */}
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.2em", textTransform:"uppercase", marginBottom:5 }}>Developed by</div>
          <div style={{ fontSize:30, fontWeight:900, color:C.text, letterSpacing:"-.4px", lineHeight:1 }}>{game.developer}</div>
        </div>

        {/* meta grid */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px 20px", marginBottom:22, padding:"16px", background:C.surface, borderRadius:4, border:`1px solid ${C.border}` }}>
          {[["PUBLISHED BY",game.publisher],["GENRE",game.genre],["RELEASE YEAR",String(game.year)],["YOUR PLAYTIME",game.playtime>0?`${game.playtime} hrs`:"—"]].map(([l,v])=>(
            <div key={l}>
              <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.18em", textTransform:"uppercase", marginBottom:3 }}>{l}</div>
              <div style={{ fontSize:15, fontWeight:800, color:C.text }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ height:1, background:C.border, marginBottom:18 }} />
        <div style={{ fontSize:14, color:"rgba(240,237,232,.58)", lineHeight:1.8, marginBottom:24 }}>{game.desc}</div>

        {/* histogram */}
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.2em", textTransform:"uppercase", marginBottom:10 }}>Community Rating</div>
          <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:38 }}>
            {[2,4,8,13,20,30,25,17,10,5].map((h,i)=>(
              <div key={i} style={{ flex:1, borderRadius:"2px 2px 0 0", background:"rgba(240,237,232,.13)", height:`${(h/30)*100}%` }} />
            ))}
          </div>
        </div>

        {/* your log */}
        {game.status!=="want to play"&&(game.rating>0||game.review) && (
          <div style={{ background:C.surface, borderRadius:4, padding:"14px 16px", marginBottom:22, border:`1px solid ${C.border}` }}>
            <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.2em", textTransform:"uppercase", marginBottom:10 }}>Your Log</div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:game.review?10:0 }}>
              <Stars value={game.rating} size={22} />
              <span style={{ fontSize:9, fontWeight:800, color:SC[game.status], letterSpacing:"0.1em", textTransform:"uppercase" }}>{game.status}</span>
            </div>
            {game.review && <div style={{ fontStyle:"italic", fontSize:14, color:C.muted, lineHeight:1.7, borderLeft:`2px solid ${C.border}`, paddingLeft:12 }}>"{game.review}"</div>}
          </div>
        )}

        {game.goty && (
          <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(245,197,24,.07)", border:`1px solid rgba(245,197,24,.18)`, borderRadius:3, padding:"8px 14px", marginBottom:24 }}>
            <span>🏆</span>
            <span style={{ fontSize:11, fontWeight:900, color:C.yellow, letterSpacing:"0.1em", textTransform:"uppercase" }}>Game of the Year</span>
          </div>
        )}

        <div style={{ height:100 }} />
      </div>

      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, padding:"12px 18px 32px", background:`linear-gradient(to top, ${C.bg} 65%, transparent)`, zIndex:50 }}>
        <button onClick={()=>setSheet(true)} style={{
          width:"100%", padding:16, borderRadius:3, border: game.status==="want to play"?`1px solid ${C.border}`:"none", cursor:"pointer",
          background: game.status==="want to play" ? C.surface : C.yellow,
          color: game.status==="want to play" ? C.text : "#000",
          fontSize:15, fontWeight:900, letterSpacing:"0.08em", textTransform:"uppercase",
        }}>{game.status==="want to play" ? "Log this Game" : "Edit Log"}</button>
      </div>

      {sheet && (
        <LogSheet game={game} onClose={()=>setSheet(false)} onSave={g=>{onUpdate(g);setSheet(false);}} />
      )}
    </div>
  );
}

// ── HOME ──────────────────────────────────────────────────────────────────────
function HomeScreen({ games, onGameClick }) {
  const played  = games.filter(g=>g.status==="played");
  const playing = games.filter(g=>g.status==="playing");
  const goty    = games.filter(g=>g.goty);
  const avgR    = played.filter(g=>g.rating>0).length
    ? (played.filter(g=>g.rating>0).reduce((a,g)=>a+g.rating,0)/played.filter(g=>g.rating>0).length).toFixed(1) : "—";

  return (
    <div style={{ paddingBottom:90, color:C.text, fontFamily:"system-ui,sans-serif" }}>
      {/* featured hero */}
      {games[0] && (
        <div onClick={()=>onGameClick(games[0])} style={{ position:"relative", height:280, overflow:"hidden", cursor:"pointer" }}>
          <Img src={games[0].hero} style={{ width:"100%", height:"100%", filter:"brightness(.36) saturate(.7)" }} />
          <div style={{ position:"absolute", inset:0, background:`linear-gradient(to bottom, transparent 20%, ${C.bg} 100%)` }} />
          <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"0 18px 22px" }}>
            <div style={{ fontSize:10, letterSpacing:"0.22em", color:C.muted, marginBottom:8, textTransform:"uppercase", fontWeight:800 }}>Featured</div>
            <div style={{ fontSize:30, fontWeight:900, lineHeight:1.05, letterSpacing:"-.4px" }}>{games[0].title}</div>
            <div style={{ fontSize:12, color:C.muted, marginTop:5 }}>{games[0].year} · {games[0].developer}</div>
          </div>
        </div>
      )}

      {/* stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", margin:"16px 18px 0", gap:8 }}>
        {[["Played",played.length,C.green],["Playing",playing.length,C.cyan],["Avg",avgR==="—"?avgR:avgR+"★",C.text],["GOTY",goty.length,C.yellow]].map(([l,v,col])=>(
          <div key={l} style={{ background:C.surface, borderRadius:3, padding:"13px 6px", textAlign:"center", border:`1px solid ${C.border}` }}>
            <div style={{ fontSize:20, fontWeight:900, color:col, letterSpacing:"-.2px" }}>{v}</div>
            <div style={{ fontSize:9, color:C.muted, marginTop:3, letterSpacing:"0.12em", textTransform:"uppercase" }}>{l}</div>
          </div>
        ))}
      </div>

      <Section label="Recently Logged">
        <div style={{ display:"flex", gap:10, overflowX:"auto", paddingBottom:4, scrollSnapType:"x mandatory" }}>
          {[...games].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,8).map(g=>(
            <div key={g.id} style={{ width:112, flexShrink:0, scrollSnapAlign:"start" }}>
              <PosterCard game={g} onClick={onGameClick} />
            </div>
          ))}
        </div>
      </Section>

      {playing.length>0 && (
        <Section label="Currently Playing">
          {playing.map((g,i)=><DiaryRow key={g.id} game={g} index={i} onClick={onGameClick} />)}
        </Section>
      )}

      {goty.length>0 && (
        <Section label="🏆  Games of the Year">
          <div style={{ display:"flex", gap:10, overflowX:"auto", paddingBottom:4, scrollSnapType:"x mandatory" }}>
            {goty.map(g=>(
              <div key={g.id} style={{ width:112, flexShrink:0, scrollSnapAlign:"start" }}>
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
function DiaryScreen({ games, onGameClick }) {
  const [filter, setFilter] = useState("all");
  const list = games.filter(g=>filter==="all"||g.status===filter).sort((a,b)=>new Date(b.date)-new Date(a.date));
  return (
    <div style={{ paddingBottom:90, color:C.text, fontFamily:"system-ui,sans-serif" }}>
      <div style={{ padding:"52px 18px 14px", position:"sticky", top:0, background:C.bg, zIndex:10, borderBottom:`1px solid ${C.border}` }}>
        <div style={{ fontSize:22, fontWeight:900, marginBottom:14, letterSpacing:"-.3px" }}>Diary</div>
        <Pills items={["all","played","playing","want to play","dropped"]} active={filter} onSelect={setFilter} />
      </div>
      <div style={{ padding:"6px 18px 0" }}>
        {list.map((g,i)=><DiaryRow key={g.id} game={g} index={i} onClick={onGameClick} />)}
        {list.length===0 && <Empty label="Nothing here yet" />}
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
      <div style={{ padding:"52px 18px 14px", position:"sticky", top:0, background:C.bg, zIndex:10, borderBottom:`1px solid ${C.border}` }}>
        <div style={{ position:"relative", marginBottom:12 }}>
          <span style={{ position:"absolute", left:13, top:"50%", transform:"translateY(-50%)", fontSize:14, color:C.muted }}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search games…"
            style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:3, padding:"12px 14px 12px 38px", color:C.text, fontSize:15, outline:"none", boxSizing:"border-box" }} />
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
          <Pills items={GENRES}     active={genre} onSelect={setGenre} />
          <Pills items={PUBLISHERS} active={pub}   onSelect={setPub} />
          {searchingOnline && (
            <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>
              {loading ? "Searching RAWG…" : error ? `Error: ${error}` : `${remoteResults.length} RAWG result${remoteResults.length===1?"":"s"}`}
            </div>
          )}
          <div style={{ display:"flex", gap:6 }}>
            {[["recent","Recent"],["rating","Top Rated"],["year","Newest"]].map(([v,l])=>(
              <button key={v} onClick={()=>setSort(v)} style={{ padding:"6px 14px", borderRadius:2, border:"none", cursor:"pointer", fontSize:11, fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase", background:sort===v?C.faint:"transparent", color:sort===v?C.text:C.muted }}>{l}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ padding:"14px 18px 0" }}>
        {searchingOnline ? (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {displayed.map(g => (
              <div key={g.id} onClick={()=>onGameClick(g)} style={{
                display:"flex", gap:12, padding:"12px", background:C.surface, borderRadius:4, border:`1px solid ${C.border}`, cursor:"pointer"
              }}>
                <div style={{ width:60, height:80, borderRadius:3, overflow:"hidden", flexShrink:0 }}>
                  <Img src={g.cover} style={{ width:"100%", height:"100%" }} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:4 }}>{g.title}</div>
                  <div style={{ fontSize:12, color:C.muted, marginBottom:2 }}>{g.year} · {g.developer} · {g.publisher}</div>
                  <div style={{ fontSize:12, color:C.muted, lineHeight:1.4, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{g.desc}</div>
                </div>
              </div>
            ))}
            {displayed.length===0 && <Empty label="No search results" />}
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
            {displayed.map(g=><PosterCard key={g.id} game={g} onClick={onGameClick} />)}
            {displayed.length===0 && <div style={{ gridColumn:"1/-1" }}><Empty label="No games found" /></div>}
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

  const iSt = { width:"100%", background:C.faint, border:`1px solid ${C.border}`, borderRadius:3, padding:"11px 14px", color:C.text, fontSize:15, outline:"none", boxSizing:"border-box" };

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
        <div style={{ padding:"52px 18px 16px", background:C.bg, position:"sticky", top:0, zIndex:10, borderBottom:`1px solid ${C.border}` }}>
          <button onClick={()=>{setOpen(null);setEditing(false);setAdding(false);}} style={{ background:"none", border:"none", color:C.muted, fontSize:12, cursor:"pointer", marginBottom:12, padding:0, fontWeight:800, letterSpacing:"0.1em", textTransform:"uppercase" }}>‹ Lists</button>
          {editing ? (
            <>
              <input value={open.name} onChange={e=>updateList({...open,name:e.target.value})} style={{...iSt,fontSize:20,fontWeight:900,marginBottom:8}} />
              <input value={open.desc||""} onChange={e=>updateList({...open,desc:e.target.value})} placeholder="Description…" style={{...iSt,fontSize:13}} />
              <div style={{ display:"flex", gap:8, marginTop:10 }}>
                <button onClick={()=>setEditing(false)} style={{ flex:1, padding:"11px", borderRadius:3, border:"none", background:C.yellow, color:"#000", fontWeight:900, cursor:"pointer", textTransform:"uppercase", letterSpacing:"0.06em" }}>Done</button>
                <button onClick={()=>deleteList(open.id)} style={{ padding:"11px 16px", borderRadius:3, border:"none", background:"rgba(232,52,28,.1)", color:C.red, fontWeight:800, cursor:"pointer" }}>Delete</button>
              </div>
            </>
          ) : (
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:24, fontWeight:900 }}>{open.name}</div>
                {open.desc && <div style={{ fontSize:13, color:C.muted, marginTop:4 }}>{open.desc}</div>}
                <div style={{ fontSize:11, color:C.faint, marginTop:5 }}>{listGames.length} game{listGames.length!==1?"s":""}</div>
              </div>
              <button onClick={()=>setEditing(true)} style={{ background:C.faint, border:`1px solid ${C.border}`, color:C.muted, padding:"7px 16px", borderRadius:3, fontSize:11, fontWeight:800, cursor:"pointer", letterSpacing:"0.08em", textTransform:"uppercase" }}>Edit</button>
            </div>
          )}
        </div>
        <div style={{ padding:"8px 18px 0" }}>
          {listGames.map((g,i)=>(
            <div key={g.id} style={{ display:"flex", alignItems:"center" }}>
              <div style={{ flex:1 }}><DiaryRow game={g} index={i} onClick={onGameClick} /></div>
              <button onClick={()=>updateList({...open,gameIds:open.gameIds.filter(id=>id!==g.id)})} style={{ background:"none", border:"none", color:C.faint, fontSize:18, cursor:"pointer", padding:"0 4px" }}>✕</button>
            </div>
          ))}
          {listGames.length===0 && <Empty label="No games in this list" />}
        </div>
        <div style={{ padding:"0 18px", marginTop:16 }}>
          {!adding ? (
            <button onClick={()=>setAdding(true)} style={{ width:"100%", padding:14, borderRadius:3, border:`1px dashed ${C.border}`, background:"transparent", color:C.muted, fontSize:13, fontWeight:800, cursor:"pointer", letterSpacing:"0.08em", textTransform:"uppercase" }}>+ Add a Game</button>
          ) : (
            <div>
              <div style={{ fontSize:10, color:C.muted, letterSpacing:"0.18em", textTransform:"uppercase", marginBottom:10 }}>Add to list</div>
              {notIn.map(g=>(
                <div key={g.id} onClick={()=>updateList({...open,gameIds:[...open.gameIds,g.id]})}
                  style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 0", borderBottom:`1px solid ${C.border}`, cursor:"pointer" }}>
                  <div style={{ width:38, height:52, borderRadius:3, overflow:"hidden", flexShrink:0 }}>
                    <Img src={g.cover} style={{ width:"100%", height:"100%" }} />
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:800 }}>{g.title}</div>
                    <div style={{ fontSize:11, color:C.muted }}>{g.year} · {g.genre}</div>
                  </div>
                  <span style={{ fontSize:20, color:C.yellow, fontWeight:900 }}>+</span>
                </div>
              ))}
              {notIn.length===0 && <div style={{ fontSize:13, color:C.muted, textAlign:"center", padding:"20px 0" }}>All games added</div>}
              <button onClick={()=>setAdding(false)} style={{ width:"100%", marginTop:14, padding:12, borderRadius:3, border:"none", background:C.faint, color:C.muted, fontWeight:800, cursor:"pointer", textTransform:"uppercase", letterSpacing:"0.08em" }}>Done</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom:90, color:C.text, fontFamily:"system-ui,sans-serif" }}>
      <div style={{ padding:"52px 18px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
          <div style={{ fontSize:22, fontWeight:900 }}>Your Lists</div>
          <button onClick={()=>setAdding(true)} style={{ background:C.yellow, border:"none", color:"#000", padding:"8px 18px", borderRadius:3, fontSize:11, fontWeight:900, cursor:"pointer", letterSpacing:"0.1em", textTransform:"uppercase" }}>+ New</button>
        </div>
        {adding && (
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:3, padding:"16px", marginTop:16, marginBottom:6 }}>
            <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="List name…" style={{...iSt,fontSize:16,fontWeight:800,marginBottom:9}} />
            <input value={newDesc} onChange={e=>setNewDesc(e.target.value)} placeholder="Description (optional)…" style={{...iSt,fontSize:13,marginBottom:12}} />
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={createList} style={{ flex:1, padding:"12px", borderRadius:3, border:"none", background:C.yellow, color:"#000", fontWeight:900, cursor:"pointer", textTransform:"uppercase", letterSpacing:"0.06em" }}>Create</button>
              <button onClick={()=>{setAdding(false);setNewName("");setNewDesc("");}} style={{ padding:"12px 16px", borderRadius:3, border:"none", background:C.faint, color:C.muted, fontWeight:800, cursor:"pointer" }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
      <div style={{ padding:"0 18px" }}>
        {lists.length===0&&!adding && <Empty label="Create your first list" icon="📋" />}
        {lists.map(list=>{
          const covers = games.filter(g=>list.gameIds.slice(0,3).includes(g.id));
          return (
            <div key={list.id} onClick={()=>{setOpen(list);setEditing(false);setAdding(false);}}
              style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 0", borderBottom:`1px solid ${C.border}`, cursor:"pointer" }}>
              <div style={{ display:"flex", gap:3, flexShrink:0 }}>
                {[0,1,2].map(i=>(
                  <div key={i} style={{ width:42, height:57, borderRadius:3, overflow:"hidden", background:C.surface, border:`1px solid ${C.border}` }}>
                    {covers[i] && <Img src={covers[i].cover} style={{ width:"100%", height:"100%" }} />}
                  </div>
                ))}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:16, fontWeight:900 }}>{list.name}</div>
                {list.desc && <div style={{ fontSize:12, color:C.muted, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{list.desc}</div>}
                <div style={{ fontSize:11, color:C.faint, marginTop:4 }}>{list.gameIds.length} game{list.gameIds.length!==1?"s":""}</div>
              </div>
              <div style={{ color:C.yellow, fontSize:18, fontWeight:900 }}>›</div>
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

  const updateGame = u => setGames(gs=>gs.map(g=>g.id===u.id?u:g));

  const TABS = [
    { key:"home",   icon:"⌂",  label:"Home"   },
    { key:"diary",  icon:"📖", label:"Diary"  },
    { key:"browse", icon:"🔍", label:"Browse" },
    { key:"lists",  icon:"📋", label:"Lists"  },
  ];

  return (
    <div style={{ minHeight:"100vh", background:C.bg, maxWidth:430, margin:"0 auto", position:"relative", overflowX:"hidden" }}>
      <style>{`
        @keyframes fadeUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
        ::-webkit-scrollbar{display:none}
        input,textarea,select{color-scheme:dark}
        input::placeholder,textarea::placeholder{color:rgba(240,237,232,0.22)!important}
      `}</style>

      {detail ? (
        <GameDetail
          game={games.find(g=>g.id===detail.id)||detail}
          onBack={()=>setDetail(null)}
          onUpdate={g=>{updateGame(g);setDetail(g);}}
        />
      ) : (
        <>
          {tab==="home"   && <HomeScreen   games={games} onGameClick={setDetail} />}
          {tab==="diary"  && <DiaryScreen  games={games} onGameClick={setDetail} />}
          {tab==="browse" && <BrowseScreen games={games} onGameClick={setDetail} />}
          {tab==="lists"  && <ListsScreen  lists={lists} games={games} setLists={setLists} onGameClick={setDetail} />}
        </>
      )}

      {/* bottom tab bar — stripe only here as the signature accent */}
      {!detail && (
        <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430,
          background:`rgba(14,14,16,.97)`, backdropFilter:"blur(20px)", borderTop:`1px solid ${C.border}`,
          display:"grid", gridTemplateColumns:"repeat(4,1fr)", zIndex:100, paddingBottom:16, overflow:"hidden" }}>
          <StripeBar height={2} style={{ position:"absolute", top:0, left:0, right:0 }} />
          {TABS.map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)} style={{
              background:"none", border:"none", cursor:"pointer", padding:"12px 0 4px",
              display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              <span style={{ fontSize:20, filter:tab===t.key?"none":"grayscale(1) opacity(.28)", transition:"filter .15s" }}>{t.icon}</span>
              <span style={{ fontSize:10, fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase",
                color:tab===t.key?C.yellow:C.muted, transition:"color .15s" }}>{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* wordmark */}
      {!detail && (
        <div style={{ position:"fixed", top:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430,
          padding:"14px 18px 0", pointerEvents:"none", zIndex:200 }}>
          <div style={{ fontSize:19, fontWeight:900, letterSpacing:"0.02em", color:C.text }}>
            kortana
          </div>
        </div>
      )}
    </div>
  );
}
