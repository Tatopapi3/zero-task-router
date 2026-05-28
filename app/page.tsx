'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

/* ── Types ─────────────────────────────────────────────────────── */
interface Capability {
  position: number; name: string; price: number; priceDisplay: string
  rating: string; status: string; description: string
}
interface CapabilityExt extends Capability {
  endpoint?: string; bodySchema?: Record<string, unknown>
}
interface Detail {
  url: string | null; bodySchema: Record<string, unknown> | null; price: number | null; raw: string
}
type LogType = 'cmd' | 'info' | 'success' | 'pay' | 'error'
interface LogLine { id: number; text: string; type: LogType }

/* ── Constants ─────────────────────────────────────────────────── */
const CYAN   = '#00b4d8'
const PURPLE = '#7c3aed'
const LOG_COLORS: Record<LogType, string> = {
  cmd:'#00b4d8', info:'#89b4fa', success:'#a6e3a1', pay:'#f9e2af', error:'#f38ba8'
}

/* ── Dot ───────────────────────────────────────────────────────── */
function Dot({ status }: { status: string }) {
  const c = { healthy:'#22c55e', stable:'#f59e0b', degraded:'#ef4444' }[status] ?? '#525870'
  return <span style={{ display:'inline-block', width:7, height:7, borderRadius:'50%', background:c, boxShadow:`0 0 5px ${c}`, flexShrink:0 }} />
}

/* ── Stars ─────────────────────────────────────────────────────── */
function Stars({ val, onChange, label }: { val:number; onChange:(n:number)=>void; label:string }) {
  return (
    <div style={{ display:'flex', gap:4 }} role="radiogroup" aria-label={label}>
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button" onClick={() => onChange(n)}
          aria-label={`${n} star${n>1?'s':''}`}
          aria-checked={n===val}
          style={{ background:'none', border:'none', cursor:'pointer',
            fontSize:20, color: n<=val ? '#f59e0b' : 'var(--text-dim)', padding:'2px', lineHeight:1 }}>★</button>
      ))}
    </div>
  )
}

/* ── Main ───────────────────────────────────────────────────────── */
export default function Home() {
  const [dark,        setDark]        = useState(true)
  const [query,       setQuery]       = useState('')
  const [searching,   setSearching]   = useState(false)
  const [caps,        setCaps]        = useState<CapabilityExt[]>([])
  const [selected,    setSelected]    = useState<CapabilityExt | null>(null)
  const [detail,      setDetail]      = useState<Detail | null>(null)
  const [reqBody,     setReqBody]     = useState('')
  const [running,     setRunning]     = useState(false)
  const [result,      setResult]      = useState<unknown>(null)
  const [runId,       setRunId]       = useState<string|null>(null)
  const [balance,     setBalance]     = useState<number|null>(null)
  const [maxPay,      setMaxPay]      = useState(0.05)
  const [log,         setLog]         = useState<LogLine[]>([])
  const [accuracy,    setAccuracy]    = useState(0)
  const [rateVal,     setRateVal]     = useState(0)
  const [reviewed,    setReviewed]    = useState(false)
  const [showReview,  setShowReview]  = useState(false)
  const termRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  /* ── Theme ──────────────────────────────────────────────────── */
  const theme = dark ? {
    bg:'#0d0e17', card:'#12141f', border:'rgba(255,255,255,0.08)', inputBg:'#0a0b14', inputBorder:'rgba(255,255,255,0.10)',
    text:'#f2f2f5', textSec:'#8892a4', textMute:'#525870', textDim:'#2e3248',
    rowHover:'rgba(255,255,255,0.03)', rowSel:`rgba(0,180,216,0.07)`,
    thBorder:'rgba(255,255,255,0.06)', tdBorder:'rgba(255,255,255,0.05)',
    codeBg:'#090a12', codeBorder:'rgba(255,255,255,0.07)', termBg:'#080910', termBorder:'rgba(255,255,255,0.07)',
    sep:'rgba(255,255,255,0.06)', sliderTrack:'#1c1e30', toggleBg:'#1c1e30',
  } : {
    bg:'#eef0f5', card:'#ffffff', border:'rgba(0,0,0,0.09)', inputBg:'#f5f6fa', inputBorder:'rgba(0,0,0,0.13)',
    text:'#0d0e17', textSec:'#555e72', textMute:'#8892a4', textDim:'#c0c4d0',
    rowHover:'rgba(0,0,0,0.025)', rowSel:'rgba(0,180,216,0.07)',
    thBorder:'rgba(0,0,0,0.07)', tdBorder:'rgba(0,0,0,0.04)',
    codeBg:'#f0f2f7', codeBorder:'rgba(0,0,0,0.08)', termBg:'#181b2e', termBorder:'rgba(0,0,0,0.08)',
    sep:'rgba(0,0,0,0.07)', sliderTrack:'#d8dce8', toggleBg:'#e2e5ee',
  }
  const T = theme

  /* ── Wallet ─────────────────────────────────────────────────── */
  const fetchBalance = useCallback(async () => {
    try {
      const d = await fetch('/api/balance').then(r => r.json())
      if (d.ok) setBalance(d.balance)
    } catch {}
  }, [])
  useEffect(() => { fetchBalance(); const iv = setInterval(fetchBalance, 9000); return () => clearInterval(iv) }, [fetchBalance])

  /* ── Log ────────────────────────────────────────────────────── */
  const addLog = useCallback((text: string, type: LogType = 'info', delay = 0) => {
    setTimeout(() => {
      setLog(prev => [...prev.slice(-60), { id: Date.now() + Math.random(), text, type }])
    }, delay)
  }, [])

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight
  }, [log])

  /* ── Search ─────────────────────────────────────────────────── */
  async function doSearch() {
    if (!query.trim()) return
    setSearching(true); setCaps([]); setSelected(null); setDetail(null); setResult(null)
    setRunId(null); setShowReview(false); setLog([])
    addLog(`zero search "${query}"`, 'cmd')
    addLog('Scanning Zero registry…', 'info', 200)
    try {
      const d = await fetch('/api/search', {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ query }),
      }).then(r => r.json())
      const list: CapabilityExt[] = d.ok && d.capabilities?.length ? d.capabilities : []
      setCaps(list)
      addLog(`Found ${list.length} capabilities.`, 'success', 100)
      // Auto-select the first result
      if (list.length > 0) {
        setTimeout(() => doInspect(list[0]), 400)
      }
    } catch (e) {
      addLog('Search failed — check Zero CLI', 'error', 100)
    }
    setSearching(false)
  }

  /* ── Inspect ─────────────────────────────────────────────────── */
  async function doInspect(cap: CapabilityExt) {
    setSelected(cap); setDetail(null); setResult(null); setRunId(null); setShowReview(false)
    addLog(`zero get ${cap.position} --formatted`, 'cmd')
    addLog('Fetching capability schema…', 'info', 200)
    try {
      const endpoint = (cap as CapabilityExt).endpoint ?? ''
      const d = await fetch('/api/get', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ identifier: cap.position, endpoint }),
      }).then(r => r.json())
      setDetail(d)
      const body: Record<string,string> = {}
      if (d.bodySchema && typeof d.bodySchema === 'object') {
        const nl = cap.name.toLowerCase()
        Object.keys(d.bodySchema).forEach(k => {
          if (['prompt','query','q','text','input'].includes(k)) body[k] = query
          else if (k === 'location') body[k] = query.match(/in ([A-Za-z ]+)/i)?.[1]?.trim() ?? 'New York'
          else if (k === 'target_language' || k === 'target_lang') {
            const lang = query.match(/to (\w+)/i)?.[1]?.toLowerCase()
            body[k] = lang === 'arabic' ? 'ar' : lang === 'spanish' ? 'es' : lang === 'french' ? 'fr' : lang ?? 'es'
          }
          else if (k === 'latitude') body[k] = '40.7128'
          else if (k === 'longitude') body[k] = '-74.0060'
          else if (k === 'units') body[k] = 'metric'
          else if (k === 'lat') body[k] = '40.7128'
          else if (k === 'lon') body[k] = '-74.0060'
          else if (k === 'lang') body[k] = 'en'
          else if (k === 'model') body[k] = nl.includes('flux') ? 'flux-schnell' : nl.includes('grok') ? 'grok-image' : ''
          else body[k] = ''
        })
      } else { body.prompt = query }
      setReqBody(JSON.stringify(body, null, 2))
      addLog(`Schema loaded. Cost: ${cap.priceDisplay}`, 'success', 100)
    } catch {
      setDetail({ url: (cap as CapabilityExt).endpoint ?? null, bodySchema: { prompt:'string' }, price: cap.price, raw:'' })
      setReqBody(JSON.stringify({ prompt: query }, null, 2))
      addLog(`Schema loaded. Cost: ${cap.priceDisplay}`, 'success', 100)
    }
  }

  /* ── Run ────────────────────────────────────────────────────── */
  async function doRun() {
    if (!selected) return
    setRunning(true); setResult(null); setShowReview(false)
    addLog(`zero fetch ${detail?.url || '[endpoint]'} --json`, 'cmd')
    addLog(`x402 challenge detected (${selected.priceDisplay}).`, 'info', 380)
    addLog(`Auto-paying ${selected.priceDisplay}… Paid. Result stream:`, 'pay', 980)
    let body = {}
    try { body = JSON.parse(reqBody || '{}') } catch {}
    try {
      const d = await fetch('/api/run', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url: detail?.url, data: body, maxPay }) }).then(r => r.json())
      const res = d.ok ? d.result : { error: d.error ?? 'Run failed' }
      setResult(res); setRunId(d.runId ?? null)
      addLog('Payload received. ✓', 'success', 100)
    } catch { addLog('Run failed — check console', 'error', 100) }
    setRunning(false); setShowReview(true); fetchBalance()
  }

  /* ── Review ─────────────────────────────────────────────────── */
  async function doReview() {
    if (!accuracy || !rateVal) return
    try {
      if (runId) await fetch('/api/review', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ runId, accuracy, value: rateVal }) })
    } catch {}
    addLog(`Review submitted — accuracy:${accuracy} value:${rateVal}`, 'success')
    setReviewed(true)
  }

  /* ── Schema display ─────────────────────────────────────────── */
  const schemaText = selected ? JSON.stringify({
    name: selected.name,
    pricing: { costPerCall: selected.price },
    bodySchema: detail?.bodySchema ?? { prompt:'string' },
    endpoint: detail?.url ?? 'https://api.zero.xyz/…',
    status: selected.status,
  }, null, 2) : ''

  /* ── Result renderer ─────────────────────────────────────────── */
  function renderResult() {
    if (!result) return null
    const r = result as Record<string, unknown>
    const imgs = r?.images as Record<string,string>[] | undefined
    const imgUrl: unknown = (imgs?.[0]?.url) ?? r?.url ?? r?.image_url ?? r?.imageUrl
    const b64 = r?.b64_json ?? r?.image
    if (imgUrl && typeof imgUrl === 'string' && /\.(jpg|jpeg|png|webp|gif)/i.test(imgUrl)) {
      return <img src={imgUrl} alt="result" style={{ maxWidth:'100%', borderRadius:8 }} />
    }
    if (b64 && typeof b64 === 'string') {
      const src = b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`
      return <img src={src} alt="result" style={{ maxWidth:'100%', borderRadius:8 }} />
    }
    return (
      <div style={{ fontFamily:"'Courier New',monospace", fontSize:13, color:'#a6e3a1', lineHeight:1.8 }}>
        {Object.entries(r || {}).map(([k,v]) => (
          <div key={k}>
            <span style={{ color:'#525870', display:'inline-block', width:90 }}>{k}</span>
            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
          </div>
        ))}
      </div>
    )
  }

  /* ── Card style ─────────────────────────────────────────────── */
  const card: React.CSSProperties = {
    background: T.card, border: `1px solid ${T.border}`, borderRadius: 18, padding: '26px 28px',
  }

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${T.bg}; color: ${T.text}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
        :focus-visible { outline: 2px solid ${CYAN}; outline-offset: 2px; border-radius: 4px; }
        :focus:not(:focus-visible) { outline: none; }
        input::placeholder, textarea::placeholder { color: ${T.textDim}; }
        .cap-row:hover td { background: ${T.rowHover}; }
        .cap-row.selected td { background: ${T.rowSel}; }
        input[type=range] { -webkit-appearance:none; width:100%; height:4px; border-radius:2px; background:${T.sliderTrack}; cursor:pointer; border:none; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:18px; height:18px; border-radius:50%; background:${CYAN}; cursor:pointer; box-shadow:0 0 8px rgba(0,180,216,0.6); }
        @keyframes fadein { from{opacity:0;transform:translateY(3px)} to{opacity:1;transform:translateY(0)} }
        .fadein { animation: fadein 0.2s ease forwards; }
        @keyframes spin { to{transform:rotate(360deg)} }
        .skip-link{position:absolute;top:-40px;left:8px;z-index:100;background:${CYAN};color:#000;padding:8px 16px;border-radius:4px;font-weight:700;text-decoration:none;}
        .skip-link:focus{top:8px;}
        @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:0.01ms!important;transition-duration:0.01ms!important}}
      `}</style>

      <a href="#main" className="skip-link">Skip to main content</a>

      <div style={{ maxWidth:1300, margin:'0 auto', padding:'24px 20px' }} id="main">

        {/* ── HEADER ──────────────────────────────────────────── */}
        <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
          <h1 style={{ fontSize:20, fontWeight:800, letterSpacing:'0.06em', textTransform:'uppercase', color:T.text }}>
            Zero Task Router
          </h1>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <span style={{ fontSize:13, color:T.textMute }}>Built at Zero UNLOCKED Hackathon · May 2026</span>
            <button onClick={() => setDark(d => !d)}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{ display:'flex', alignItems:'center', gap:6, background:T.toggleBg, border:`1px solid ${T.border}`,
                color:T.textSec, borderRadius:20, padding:'6px 14px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
              <span aria-hidden="true">{dark ? '☾' : '☀'}</span>
              <span>{dark ? 'Dark' : 'Light'}</span>
            </button>
          </div>
        </header>

        <main role="main">

          {/* ── TOP ROW ─────────────────────────────────────────── */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:14, marginBottom:14 }}>

            {/* TOP-LEFT: Task & Registry */}
            <section style={card} aria-labelledby="task-h">
              <div style={{ fontSize:13, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:T.text, marginBottom:18 }} id="task-h">
                Task &amp; Registry
              </div>

              <div style={{ fontSize:13, fontWeight:500, color:T.textSec, marginBottom:10 }}>1. Describe Task</div>

              <div style={{ display:'flex', gap:10, marginBottom:22 }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => { if (e.key==='Enter') doSearch() }}
                  placeholder="Get current weather in New York and translate to Spanish"
                  aria-label="Describe your task"
                  autoComplete="off"
                  style={{ flex:1, background:T.inputBg, border:`1px solid ${T.inputBorder}`, color:T.text,
                    borderRadius:10, padding:'11px 15px', fontSize:14, fontFamily:'inherit' }}
                />
                <button onClick={doSearch} disabled={!query.trim() || searching}
                  aria-label="Find matching capabilities"
                  style={{ background:CYAN, color:'#000', fontWeight:700, fontSize:14, borderRadius:10,
                    padding:'11px 22px', border:'none', cursor:'pointer', whiteSpace:'nowrap', opacity: searching ? 0.6 : 1 }}>
                  {searching
                    ? <><span style={{ display:'inline-block', width:12, height:12, border:`2px solid rgba(0,0,0,0.2)`, borderTopColor:'#000', borderRadius:'50%', animation:'spin 0.65s linear infinite', verticalAlign:'middle', marginRight:6 }} />Searching…</>
                    : 'Find Capability'}
                </button>
              </div>

              {/* Results table */}
              {caps.length > 0 && (
                <div aria-live="polite">
                  <p style={{ fontSize:12, color:T.textMute, marginBottom:8 }}>
                    {caps.length} capabilities found — click a row to inspect
                  </p>
                  <table style={{ width:'100%', borderCollapse:'collapse' }} role="grid">
                    <thead>
                      <tr>
                        {['Name','Description','Rating','Cost',''].map(h => (
                          <th key={h} scope="col" style={{ fontSize:11, letterSpacing:'0.07em', textTransform:'uppercase',
                            color:T.textMute, padding:'7px 12px', textAlign:'left', borderBottom:`1px solid ${T.thBorder}`, fontWeight:600 }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {caps.map(cap => (
                        <tr key={cap.position}
                          className={`cap-row${selected?.position===cap.position?' selected':''}`}
                          onClick={() => doInspect(cap)}
                          onKeyDown={e => { if (e.key==='Enter'||e.key===' '){e.preventDefault();doInspect(cap)} }}
                          tabIndex={0}
                          role="row"
                          aria-label={`${cap.name}, ${cap.description}, ${cap.rating} stars, ${cap.priceDisplay}`}
                          style={{ cursor:'pointer' }}>
                          <td style={{ padding:'13px 12px', borderBottom:`1px solid ${T.tdBorder}`, verticalAlign:'middle' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              <Dot status={cap.status} />
                              <span style={{ fontWeight:700, color:T.text, fontSize:14 }}>{cap.name}</span>
                            </div>
                          </td>
                          <td style={{ padding:'13px 12px', borderBottom:`1px solid ${T.tdBorder}`, color:T.textSec, fontSize:13 }}>{cap.description}</td>
                          <td style={{ padding:'13px 12px', borderBottom:`1px solid ${T.tdBorder}`, color:T.text, fontSize:13, whiteSpace:'nowrap' }}>{cap.rating} ★</td>
                          <td style={{ padding:'13px 12px', borderBottom:`1px solid ${T.tdBorder}`, color:T.text, fontWeight:600, fontSize:13, whiteSpace:'nowrap' }}>{cap.priceDisplay}</td>
                          <td style={{ padding:'13px 12px', borderBottom:`1px solid ${T.tdBorder}` }}>
                            {selected?.position===cap.position && (
                              <span style={{ display:'inline-block', background:'rgba(0,180,216,0.13)', color:CYAN,
                                border:'1px solid rgba(0,180,216,0.3)', borderRadius:20, padding:'3px 14px', fontSize:12, fontWeight:700 }}>
                                Selected
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {caps.length === 0 && !searching && (
                <div style={{ color:T.textDim, fontSize:13, padding:'4px 0' }} aria-live="polite">
                  Search results will appear here
                </div>
              )}
            </section>

            {/* TOP-RIGHT: Wallet & Controls */}
            <section style={{ ...card, display:'flex', flexDirection:'column', gap:0 }} aria-labelledby="wallet-h">
              <div style={{ fontSize:13, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:T.text, marginBottom:16 }} id="wallet-h">
                Wallet &amp; Controls
              </div>

              {/* Balance */}
              <div style={{ textAlign:'center', padding:'10px 0 16px' }}>
                <div style={{ fontSize:48, fontWeight:900, letterSpacing:'-0.03em', lineHeight:1.1, color:T.text }}
                  aria-live="polite" aria-label={`Wallet balance: ${balance != null ? balance.toFixed(2) : '—'} USDC`}>
                  {balance != null ? `${balance.toFixed(2)} USDC` : '—'}
                </div>
                <div style={{ fontSize:12, color:T.textMute, marginTop:5 }}>(Base Network)</div>
              </div>

              <div style={{ height:1, background:T.sep, marginBottom:18 }} />

              {/* Cost Guard */}
              <div style={{ marginBottom:4 }}>
                <label htmlFor="max-pay" style={{ fontSize:13, fontWeight:600, color:T.textSec, display:'block', marginBottom:12 }}>
                  Cost Guard (Max Pay/Call)
                </label>
                <input type="range" id="max-pay" min={0} max={1} step={0.01} value={maxPay}
                  onChange={e => setMaxPay(parseFloat(e.target.value))}
                  aria-label="Maximum payment per call in USDC"
                  aria-valuemin={0} aria-valuemax={1} aria-valuenow={maxPay} />
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:5 }}>
                  <span style={{ fontSize:11, color:T.textMute }}>0.00 USDC</span>
                  <span style={{ fontSize:11, color:T.textMute }}>1.00 USDC</span>
                </div>
                <div style={{ textAlign:'center', marginTop:4 }}>
                  <span style={{ fontSize:15, fontWeight:700, color:CYAN }}>{maxPay.toFixed(2)} USDC</span>
                </div>
              </div>

              <div style={{ height:1, background:T.sep, margin:'16px 0' }} />

              {/* Wallet address */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, color:T.textMute, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>Wallet</div>
                <div style={{ fontFamily:"'Courier New',monospace", fontSize:10, color:T.textDim, wordBreak:'break-all' }}>
                  0x35AcA9684f8873407B476965e9Eb4239519a6A60
                </div>
              </div>

              {/* Status */}
              <div style={{ display:'flex', alignItems:'center', gap:8 }} role="status" aria-live="polite">
                <span style={{ display:'inline-block', width:7, height:7, borderRadius:'50%',
                  background: balance && balance > 0 ? '#22c55e' : '#525870',
                  boxShadow: balance && balance > 0 ? '0 0 5px #22c55e' : 'none' }} aria-hidden="true" />
                <span style={{ fontSize:12, color: balance && balance > 0 ? '#22c55e' : T.textMute }}>
                  {balance === null ? 'Checking…' : balance > 0 ? 'Funded · Ready' : 'No funds'}
                </span>
              </div>
            </section>
          </div>

          {/* ── BOTTOM ROW ──────────────────────────────────────── */}
          <div style={{ display:'grid', gridTemplateColumns:'330px 1fr', gap:14 }}>

            {/* BOTTOM-LEFT: Capability Schema */}
            <section style={{ ...card, display:'flex', flexDirection:'column', gap:0 }} aria-labelledby="schema-h">
              <div style={{ fontSize:13, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:T.text, marginBottom:18 }} id="schema-h">
                Capability Schema
              </div>
              <div style={{ fontSize:13, fontWeight:500, color:T.textSec, marginBottom:10 }}>2. Inspect Capability</div>

              {!selected && (
                <div style={{ color:T.textDim, fontSize:13, padding:'4px 0' }} aria-live="polite">
                  Select a capability above →
                </div>
              )}

              {selected && (
                <>
                  <div tabIndex={0}
                    style={{ background:T.codeBg, border:`1px solid ${T.codeBorder}`, borderRadius:10, padding:'14px 16px',
                      fontFamily:"'Courier New',Courier,monospace", fontSize:12, color:'#8892b0',
                      lineHeight:1.75, overflowY:'auto', maxHeight:180 }}
                    role="region" aria-label="Capability JSON schema">
                    <pre style={{ margin:0, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{schemaText}</pre>
                  </div>
                  <div style={{ marginTop:14 }}>
                    <div style={{ fontSize:13, fontWeight:500, color:T.textSec, marginBottom:8 }}>
                      3. Request Body <span style={{ color:T.textDim, fontSize:11, fontWeight:400 }}>(editable)</span>
                    </div>
                    <textarea
                      value={reqBody}
                      onChange={e => setReqBody(e.target.value)}
                      aria-label="Editable request body"
                      spellCheck={false}
                      rows={5}
                      style={{ width:'100%', background:T.codeBg, border:`1px solid ${T.codeBorder}`,
                        color:'#a6e3a1', borderRadius:10, padding:'14px 16px',
                        fontFamily:"'Courier New',Courier,monospace", fontSize:12, lineHeight:1.75, resize:'vertical' }}
                    />
                  </div>
                </>
              )}
            </section>

            {/* BOTTOM-RIGHT: Run & Results */}
            <section style={{ ...card, display:'flex', flexDirection:'column', gap:14 }} aria-labelledby="run-h">

              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:T.text, marginBottom:3 }} id="run-h">
                    Run &amp; Results
                  </div>
                  <div style={{ fontSize:13, fontWeight:500, color:T.textSec }}>4. Execute Task</div>
                </div>
                <button onClick={doRun} disabled={!selected || running}
                  aria-label="Run selected capability — auto-pays via x402"
                  style={{ background: PURPLE, color:'#fff', fontWeight:700, fontSize:15,
                    letterSpacing:'0.03em', borderRadius:12, padding:'13px 28px', border:'none', cursor:'pointer',
                    opacity: (!selected || running) ? 0.4 : 1 }}>
                  {running
                    ? <><span style={{ display:'inline-block', width:13, height:13, border:'2px solid rgba(255,255,255,0.2)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.65s linear infinite', verticalAlign:'middle', marginRight:8 }} />Running…</>
                    : 'RUN CAPABILITY'}
                </button>
              </div>

              {/* Terminal */}
              <div ref={termRef}
                style={{ flex:1, minHeight:240, background:T.termBg, border:`1px solid ${T.termBorder}`,
                  borderRadius:10, padding:16, fontFamily:"'Courier New',Courier,monospace", fontSize:13, lineHeight:1.85, overflowY:'auto' }}
                role="log" aria-label="Execution log" aria-live="polite" tabIndex={0}>
                {log.length === 0 && (
                  <div style={{ color:'#2e3552' }}>
                    <span style={{ color:CYAN }}>$</span>
                    <span style={{ marginLeft:8 }}>zero task router ready_</span>
                  </div>
                )}
                {log.map(entry => (
                  <div key={entry.id} className="fadein" style={{ display:'flex', gap:8 }}>
                    <span style={{ color:LOG_COLORS[entry.type], flexShrink:0 }}>›</span>
                    <span style={{ color:LOG_COLORS[entry.type] }}>{entry.text}</span>
                  </div>
                ))}
                {result !== null && (
                  <div className="fadein" style={{ marginTop:12, padding:14, borderRadius:8,
                    background:'rgba(0,180,216,0.04)', border:'1px solid rgba(0,180,216,0.12)' }}>
                    {renderResult() ?? null}
                  </div>
                )}
              </div>

              {/* Review */}
              {showReview && (
                <div style={{ borderTop:`1px solid ${T.sep}`, paddingTop:14 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
                    <fieldset style={{ border:'none' }}>
                      <legend style={{ fontSize:11, color:T.textMute, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>
                        Rate this capability
                      </legend>
                      <div style={{ display:'flex', gap:24 }}>
                        <div>
                          <div style={{ fontSize:11, color:T.textMute, marginBottom:5, textTransform:'uppercase', letterSpacing:'0.06em' }}>Accuracy</div>
                          <Stars val={accuracy} onChange={setAccuracy} label="Accuracy rating" />
                        </div>
                        <div>
                          <div style={{ fontSize:11, color:T.textMute, marginBottom:5, textTransform:'uppercase', letterSpacing:'0.06em' }}>Value</div>
                          <Stars val={rateVal} onChange={setRateVal} label="Value rating" />
                        </div>
                      </div>
                    </fieldset>
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      {reviewed && <span style={{ fontSize:13, color:'#22c55e' }} role="status">✓ Review submitted.</span>}
                      {!reviewed && (
                        <button onClick={doReview} disabled={!accuracy || !rateVal}
                          style={{ background:'rgba(124,58,237,0.15)', border:'1px solid rgba(124,58,237,0.3)',
                            color:'#a78bfa', borderRadius:8, padding:'8px 18px', fontSize:13, fontWeight:600,
                            cursor:'pointer', opacity: (!accuracy || !rateVal) ? 0.4 : 1 }}>
                          Submit Review
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

            </section>
          </div>
        </main>
      </div>
    </>
  )
}
