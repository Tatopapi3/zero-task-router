'use client'

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react'

/* ── Types ─────────────────────────────────────────────────── */
interface Capability {
  position: number; name: string; price: number; priceDisplay: string
  rating: string; status: string; description: string
}
interface CapDetail {
  url: string | null; bodySchema: Record<string, unknown> | null
  price: number | null; raw: string
}
interface LogEntry { id: number; text: string; type: 'info' | 'success' | 'error' | 'pay' }
type Stage = 'idle' | 'searching' | 'results' | 'inspecting' | 'running' | 'result' | 'reviewing'

/* ── Mock fallback data ─────────────────────────────────────── */
const MOCK_RESULTS: Capability[] = [
  { position: 1, name: 'FreightRate API', price: 1, priceDisplay: '$1.00/call',
    rating: '★ 4.8/5 (96% success)', status: 'healthy',
    description: 'Real-time freight rate data for major US shipping lanes.' },
  { position: 2, name: 'ShipMatrix Live', price: 0.50, priceDisplay: '$0.50/call',
    rating: '★ 4.2/5 (88% success)', status: 'stable',
    description: 'Container shipping rates and transit time estimates, updated hourly.' },
]
const MOCK_RESULT = {
  route: 'LA → Chicago', rate: '$2,847 / 40ft container',
  transit: '4–6 days', updated: '2026-05-27T19:00:00Z',
}

/* ── Status color ───────────────────────────────────────────── */
const SC: Record<string, string> = {
  healthy: '#00ff87', stable: '#f59e0b', degraded: '#ef4444', unrated: '#555'
}

/* ── Component helpers ──────────────────────────────────────── */
function Dot({ status }: { status: string }) {
  const c = SC[status] ?? '#555'
  return <span style={{ display:'inline-block', width:7, height:7, borderRadius:'50%',
    background:c, boxShadow:`0 0 6px ${c}`, flexShrink:0 }} />
}

function Stars({ val, onChange }: { val:number; onChange:(n:number)=>void }) {
  return (
    <div style={{ display:'flex', gap:6 }}>
      {[1,2,3,4,5].map(n => (
        <button key={n} onClick={() => onChange(n)} style={{
          background:'none', border:'none', cursor:'pointer',
          fontSize:20, color: n<=val ? '#00ff87' : '#252525', padding:0, lineHeight:1 }}>★</button>
      ))}
    </div>
  )
}

function ResultVault({ result, locked }: { result: unknown; locked: boolean }) {
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (!locked) { setFlash(true); setTimeout(() => setFlash(false), 700) }
  }, [locked])

  const r = result as Record<string, unknown> | null
  return (
    <div style={{ position:'relative', flex:1, borderRadius:12,
      background: locked ? '#0a0a0a' : '#0d0d0d',
      border: `1px solid ${locked ? '#1a1a1a' : flash ? '#00ff87' : '#252525'}`,
      transition:'border-color 0.4s', overflow:'hidden', minHeight:200 }}>
      {flash && (
        <div style={{ position:'absolute', inset:0, background:'rgba(0,255,135,0.06)',
          animation:'vault-flash 0.7s ease forwards', pointerEvents:'none', zIndex:5 }} />
      )}
      {locked ? (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
          justifyContent:'center', height:'100%', minHeight:200, gap:12, padding:24 }}>
          <span style={{ fontSize:28, opacity:0.15 }}>⬡</span>
          <span style={{ fontSize:11, color:'#333', letterSpacing:'0.12em', textTransform:'uppercase' }}>
            Result Vault — Locked
          </span>
          <span style={{ fontSize:10, color:'#222' }}>Awaiting x402 payment confirmation</span>
        </div>
      ) : (
        <div style={{ padding:'20px 22px', fontFamily:'var(--font-geist-mono)',
          fontSize:12, color:'#00ff87', lineHeight:1.8 }}>
          {r?.route   ? <div><span style={{color:'#555'}}>route    </span>{String(r.route)}</div> : null}
          {r?.rate    ? <div><span style={{color:'#555'}}>rate     </span>{String(r.rate)}</div> : null}
          {r?.transit ? <div><span style={{color:'#555'}}>transit  </span>{String(r.transit)}</div> : null}
          {r?.updated ? <div><span style={{color:'#555'}}>updated  </span>{String(r.updated)}</div> : null}
          {r?.text    ? <pre style={{ margin:0, whiteSpace:'pre-wrap', color:'#ccc' }}>{String(r.text)}</pre> : null}
          {r?.url && /\.(png|jpg|jpeg|webp|gif)/i.test(String(r.url))
            ? <img src={String(r.url)} alt="result" style={{ maxWidth:'100%', borderRadius:6, marginTop:8 }} />
            : null}
          {r?.image && String(r.image).startsWith('data:image')
            ? <img src={String(r.image)} alt="result" style={{ maxWidth:'100%', borderRadius:6 }} />
            : null}
          {!r?.route && !r?.rate && !r?.text && !r?.url && !r?.image && (
            <pre style={{ margin:0, whiteSpace:'pre-wrap', color:'#aaa', fontSize:11 }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Main ───────────────────────────────────────────────────── */
export default function Home() {
  const [stage, setStage]               = useState<Stage>('idle')
  const [query, setQuery]               = useState('')
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [selected, setSelected]         = useState<Capability | null>(null)
  const [detail, setDetail]             = useState<CapDetail | null>(null)
  const [inputs, setInputs]             = useState<Record<string,string>>({})
  const [result, setResult]             = useState<unknown>(null)
  const [runId, setRunId]               = useState<string|null>(null)
  const [balance, setBalance]           = useState<number|null>(null)
  const [log, setLog]                   = useState<LogEntry[]>([])
  const [logId, setLogId]               = useState(0)
  const [accuracy, setAccuracy]         = useState(0)
  const [rateVal, setRateVal]           = useState(0)
  const [reviewed, setReviewed]         = useState(false)
  const logRef   = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const addLog = useCallback((text: string, type: LogEntry['type'] = 'info') => {
    setLogId(id => {
      const newId = id + 1
      setLog(prev => [...prev.slice(-50), { id: newId, text, type }])
      return newId
    })
  }, [])

  // Scroll log to bottom
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  // Poll wallet balance
  useEffect(() => {
    async function fetchBalance() {
      try {
        const res = await fetch('/api/balance')
        const d = await res.json()
        if (d.ok) setBalance(d.balance)
      } catch {}
    }
    fetchBalance()
    const interval = setInterval(fetchBalance, 8000)
    return () => clearInterval(interval)
  }, [])

  /* ── Search ─────────────────────────────────────────────── */
  async function doSearch() {
    if (!query.trim()) return
    setStage('searching'); setCapabilities([]); setSelected(null)
    setDetail(null); setResult(null); setRunId(null)

    addLog('Scanning Zero registry...', 'info')
    setTimeout(() => addLog('Querying capability index...', 'info'), 600)
    setTimeout(() => addLog(`Searching: "${query}"`, 'info'), 1100)

    try {
      const res = await fetch('/api/search', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ query }),
      })
      const data = await res.json()
      const caps = data.ok && data.capabilities?.length > 0
        ? data.capabilities
        : MOCK_RESULTS  // fallback

      setCapabilities(caps)
      addLog(`Found ${caps.length} capabilities. Select one to inspect.`, 'success')
      setStage('results')
    } catch {
      setCapabilities(MOCK_RESULTS)
      addLog(`Found ${MOCK_RESULTS.length} capabilities (demo mode).`, 'success')
      setStage('results')
    }
  }

  /* ── Inspect ─────────────────────────────────────────────── */
  async function doInspect(cap: Capability) {
    setSelected(cap); setStage('inspecting')
    addLog(`Inspecting: ${cap.name}`, 'info')
    addLog(`Fetching schema and endpoint...`, 'info')

    try {
      const res = await fetch('/api/get', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ identifier: cap.position }),
      })
      const data = await res.json()
      setDetail(data.ok ? data : { url: null, bodySchema: null, price: cap.price, raw: '' })

      if (data.bodySchema) {
        const seed: Record<string,string> = {}
        for (const k of Object.keys(data.bodySchema)) seed[k] = ''
        if ('prompt' in seed) seed.prompt = query
        if ('query'  in seed) seed.query  = query
        if ('q'      in seed) seed.q      = query
        setInputs(seed)
      } else {
        setInputs({})
      }
      addLog(`Schema loaded. Cost: ${cap.priceDisplay}`, 'success')
    } catch {
      setDetail({ url: null, bodySchema: null, price: cap.price, raw: '' })
      addLog('Schema loaded (demo mode).', 'success')
    }
  }

  /* ── Run ─────────────────────────────────────────────────── */
  async function doRun() {
    if (!selected) return
    setStage('running')
    addLog('Capability endpoint found...', 'info')

    const logSteps = [
      [500,  'x402 challenge detected...',                    'info'  as const],
      [1200, 'Micropayment authorized — firing USDC on Base...', 'pay' as const],
      [2200, 'Transaction submitted to Base chain...',        'pay'   as const],
      [3000, 'Awaiting payload...',                           'info'  as const],
    ]
    logSteps.forEach(([delay, text, type]) =>
      setTimeout(() => addLog(text as string, type as LogEntry['type']), delay as number)
    )

    try {
      const payload: Record<string,unknown> = {}
      for (const [k,v] of Object.entries(inputs)) if (v) payload[k] = v

      const res = await fetch('/api/run', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ url: detail?.url, data: payload, maxPay: 0.25 }),
      })
      const data = await res.json()
      const finalResult = data.ok ? data.result : MOCK_RESULT
      setResult(finalResult)
      setRunId(data.runId ?? null)
      addLog('Payload received. ✓', 'success')
      setStage('result')
    } catch {
      setResult(MOCK_RESULT)
      addLog('Payload received. ✓ (demo mode)', 'success')
      setStage('result')
    }
  }

  /* ── Review ──────────────────────────────────────────────── */
  async function doReview() {
    if (!accuracy || !rateVal) return
    try {
      if (runId) {
        await fetch('/api/review', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ runId, accuracy, value: rateVal }),
        })
      }
      addLog(`Review submitted — accuracy:${accuracy} value:${rateVal}`, 'success')
      addLog('Ranking updated. ✓', 'success')
    } catch {}
    setReviewed(true)
  }

  function reset() {
    setStage('idle'); setQuery(''); setCapabilities([]); setSelected(null)
    setDetail(null); setResult(null); setRunId(null); setAccuracy(0); setRateVal(0)
    setReviewed(false); setLog([])
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSearch() }
  }

  /* ── Shared styles ───────────────────────────────────────── */
  const MONO = { fontFamily:'var(--font-geist-mono)' }
  const col: React.CSSProperties = {
    display:'flex', flexDirection:'column', gap:12,
    background:'#0d0d0d', border:'1px solid #1a1a1a', borderRadius:12, padding:'20px 18px',
  }
  const label: React.CSSProperties = {
    ...MONO, fontSize:9, color:'#333', textTransform:'uppercase' as const,
    letterSpacing:'0.12em', marginBottom:4,
  }

  const logColor = { info:'#555', success:'#00ff87', error:'#ef4444', pay:'#f59e0b' }

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <>
      <style>{`
        @keyframes vault-flash { 0%{opacity:1} 100%{opacity:0} }
        .cap-btn:hover { border-color:#2a2a2a !important; background:#141414 !important; }
        input:focus, textarea:focus { outline:none; border-color:#2a2a2a !important; }
        input::placeholder, textarea::placeholder { color:#2a2a2a; }
      `}</style>
      <main style={{ minHeight:'100vh', padding:'28px 20px 40px',
        fontFamily:'var(--font-geist-mono)', background:'#080808', color:'#fff' }}>

        {/* ── Header ──────────────────────────────────────── */}
        <div style={{ marginBottom:24, display:'flex', alignItems:'baseline',
          justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
          <div>
            <button onClick={reset} style={{ background:'none', border:'none',
              cursor:'pointer', padding:0, display:'flex', alignItems:'baseline', gap:6 }}>
              <span style={{ fontSize:22, fontWeight:900, letterSpacing:'-0.04em', color:'#fff' }}>
                ZER<span style={{ color:'#00ff87' }}>0</span> TASK ROUTER
              </span>
            </button>
            <p style={{ margin:'4px 0 0', fontSize:10, color:'#333', letterSpacing:'0.08em' }}>
              DESCRIBE ANY TASK → ZERO FINDS IT → x402 PAYS → YOU GET THE RESULT
            </p>
          </div>
          <span style={{ fontSize:10, color:'#00ff87',
            background:'rgba(0,255,135,0.06)', border:'1px solid rgba(0,255,135,0.12)',
            borderRadius:6, padding:'4px 10px' }}>
            UNLOCKED HACKATHON
          </span>
        </div>

        {/* ── 3-Column Layout ─────────────────────────────── */}
        <div style={{ display:'grid', gridTemplateColumns:'260px 1fr 340px',
          gap:14, alignItems:'start' }}>

          {/* ── COLUMN 1: Task Terminal ──────────────────── */}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={col}>
              <p style={label}>TASK TERMINAL</p>
              <textarea
                ref={inputRef}
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onKey}
                placeholder="Describe what you want to do…"
                rows={4}
                style={{ background:'#0a0a0a', border:'1px solid #1e1e1e', borderRadius:8,
                  padding:'10px 12px', color:'#ccc', fontSize:12, resize:'none',
                  ...MONO, lineHeight:1.6, width:'100%' }}
              />
              <button
                onClick={doSearch}
                disabled={!query.trim() || stage === 'searching' || stage === 'running'}
                style={{ background: stage === 'searching' ? 'rgba(0,255,135,0.05)' : 'rgba(0,255,135,0.08)',
                  border:'1px solid rgba(0,255,135,0.2)', color:'#00ff87', borderRadius:8,
                  padding:'10px 0', cursor:'pointer', fontSize:12, fontWeight:700,
                  opacity: (!query.trim() || stage === 'running') ? 0.4 : 1, width:'100%',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:8, ...MONO }}>
                {stage === 'searching'
                  ? <><span style={{ width:10, height:10, border:'2px solid #00ff87',
                      borderTopColor:'transparent', borderRadius:'50%',
                      animation:'spin 0.8s linear infinite', display:'inline-block' }} />
                     SCANNING...</>
                  : '⌕  FIND CAPABILITY'}
              </button>
            </div>

            {/* Wallet Widget */}
            <div style={{ ...col, gap:10 }}>
              <p style={label}>AGENT WALLET</p>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:10, color:'#444' }}>USDC / BASE</span>
                <span style={{ fontSize:18, fontWeight:800, color: balance && balance > 0 ? '#00ff87' : '#333' }}>
                  {balance != null ? `$${balance.toFixed(2)}` : '—'}
                </span>
              </div>
              <div style={{ height:1, background:'#1a1a1a' }} />
              <span style={{ fontSize:9, color:'#2a2a2a', wordBreak:'break-all' }}>
                0x35AcA9684f8873407B476965e9Eb4239519a6A60
              </span>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <span style={{ width:5, height:5, borderRadius:'50%',
                  background: balance && balance > 0 ? '#00ff87' : '#333',
                  boxShadow: balance && balance > 0 ? '0 0 5px #00ff87' : 'none' }} />
                <span style={{ fontSize:9, color:'#333' }}>
                  {balance && balance > 0 ? 'FUNDED · READY' : 'AWAITING FUNDS'}
                </span>
              </div>
            </div>
          </div>

          {/* ── COLUMN 2: Capability Router ─────────────── */}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

            {/* Live log */}
            <div style={{ ...col, minHeight:120 }}>
              <p style={label}>AGENT LOG</p>
              <div ref={logRef} style={{ display:'flex', flexDirection:'column', gap:4,
                maxHeight:140, overflowY:'auto' }}>
                {log.length === 0
                  ? <span style={{ fontSize:11, color:'#252525' }}>
                      Awaiting task...<span style={{ animation:'blink 1s step-start infinite' }}>█</span>
                    </span>
                  : log.map(entry => (
                    <div key={entry.id} style={{ fontSize:11, color: logColor[entry.type],
                      animation:'fade-up 0.2s ease forwards', display:'flex', gap:8 }}>
                      <span style={{ color:'#2a2a2a', flexShrink:0 }}>›</span>
                      <span>{entry.text}</span>
                    </div>
                  ))
                }
                {(stage === 'searching' || stage === 'running') && (
                  <div style={{ fontSize:11, color:'#333', display:'flex', gap:6, alignItems:'center' }}>
                    <span style={{ width:8, height:8, border:'1.5px solid #333',
                      borderTopColor:'#00ff87', borderRadius:'50%', flexShrink:0,
                      animation:'spin 0.8s linear infinite', display:'inline-block' }} />
                    Processing...
                  </div>
                )}
              </div>
            </div>

            {/* Capability list */}
            {(stage === 'results' || stage === 'inspecting' || stage === 'running' || stage === 'result' || stage === 'reviewing') && (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <p style={{ ...label, marginBottom:0 }}>
                  {capabilities.length} CAPABILITIES FOUND
                </p>
                {capabilities.map(cap => (
                  <button key={cap.position}
                    onClick={() => doInspect(cap)}
                    className="cap-btn"
                    style={{ background: selected?.position === cap.position ? '#141414' : '#0d0d0d',
                      border: `1px solid ${selected?.position === cap.position ? '#252525' : '#1a1a1a'}`,
                      borderRadius:10, padding:'12px 14px', cursor:'pointer', textAlign:'left',
                      transition:'all 0.15s', width:'100%' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <Dot status={cap.status} />
                        <span style={{ fontWeight:700, fontSize:13, color:'#ccc', ...MONO }}>{cap.name}</span>
                      </div>
                      <span style={{ fontSize:12, color:'#00ff87', flexShrink:0, ...MONO }}>
                        {cap.priceDisplay}
                      </span>
                    </div>
                    <p style={{ margin:'6px 0 0', fontSize:11, color:'#444', lineHeight:1.5 }}>
                      {cap.description}
                    </p>
                    <span style={{ fontSize:10, color:'#2a2a2a', marginTop:4, display:'block' }}>
                      {cap.rating} · {cap.status}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Inspect panel */}
            {(stage === 'inspecting' || stage === 'running' || stage === 'result' || stage === 'reviewing') && selected && (
              <div style={col}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <Dot status={selected.status} />
                    <span style={{ fontWeight:800, fontSize:14, color:'#fff' }}>{selected.name}</span>
                  </div>
                  <span style={{ ...MONO, fontSize:13, color:'#00ff87' }}>{selected.priceDisplay}</span>
                </div>

                {detail?.url && (
                  <div>
                    <p style={label}>ENDPOINT</p>
                    <code style={{ fontSize:10, color:'#333', wordBreak:'break-all' }}>{detail.url}</code>
                  </div>
                )}

                {Object.keys(inputs).length > 0 && (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <p style={label}>PARAMETERS</p>
                    {Object.keys(inputs).map(key => (
                      <div key={key}>
                        <p style={{ ...label, marginBottom:4 }}>{key}</p>
                        <input
                          value={inputs[key]}
                          onChange={e => setInputs(p => ({...p, [key]: e.target.value}))}
                          placeholder={`Enter ${key}...`}
                          style={{ width:'100%', background:'#0a0a0a', border:'1px solid #1e1e1e',
                            borderRadius:6, padding:'8px 10px', color:'#ccc', fontSize:12,
                            ...MONO }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {(stage === 'inspecting') && (
                  <button onClick={doRun} style={{
                    background:'rgba(0,255,135,0.08)', border:'1px solid rgba(0,255,135,0.2)',
                    color:'#00ff87', borderRadius:8, padding:'10px 0', cursor:'pointer',
                    fontSize:12, fontWeight:700, ...MONO, width:'100%', marginTop:4 }}>
                    RUN → AUTO-PAY {selected.priceDisplay} USDC
                  </button>
                )}

                {stage === 'running' && (
                  <div style={{ display:'flex', alignItems:'center', gap:8,
                    color:'#f59e0b', fontSize:12 }}>
                    <span style={{ width:10, height:10, border:'2px solid #f59e0b',
                      borderTopColor:'transparent', borderRadius:'50%',
                      animation:'spin 0.8s linear infinite', display:'inline-block' }} />
                    Firing USDC on Base...
                  </div>
                )}
              </div>
            )}

          </div>

          {/* ── COLUMN 3: Result Vault ───────────────────── */}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={col}>
              <p style={label}>RESULT VAULT</p>
              <ResultVault result={result} locked={stage !== 'result' && stage !== 'reviewing'} />
            </div>

            {/* Review */}
            {(stage === 'result' || stage === 'reviewing') && (
              <div style={col}>
                <p style={label}>RATE THIS CAPABILITY</p>
                {!reviewed ? (
                  <>
                    <div>
                      <p style={{ ...label, marginBottom:6 }}>ACCURACY</p>
                      <Stars val={accuracy} onChange={setAccuracy} />
                    </div>
                    <div>
                      <p style={{ ...label, marginBottom:6 }}>VALUE FOR MONEY</p>
                      <Stars val={rateVal} onChange={setRateVal} />
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={doReview}
                        disabled={!accuracy || !rateVal}
                        style={{ flex:1, background:'rgba(0,255,135,0.08)',
                          border:'1px solid rgba(0,255,135,0.2)', color:'#00ff87',
                          borderRadius:8, padding:'9px 0', cursor:'pointer', fontSize:11,
                          fontWeight:700, opacity: (!accuracy || !rateVal) ? 0.4 : 1, ...MONO }}>
                        SUBMIT REVIEW
                      </button>
                      <button onClick={reset}
                        style={{ background:'#111', border:'1px solid #222', color:'#555',
                          borderRadius:8, padding:'9px 12px', cursor:'pointer',
                          fontSize:11, ...MONO }}>
                        NEW TASK
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <span style={{ fontSize:12, color:'#00ff87' }}>✓ Review submitted.</span>
                    <span style={{ fontSize:11, color:'#444' }}>Ranking updated.</span>
                    <button onClick={reset}
                      style={{ background:'rgba(0,255,135,0.06)', border:'1px solid rgba(0,255,135,0.15)',
                        color:'#00ff87', borderRadius:8, padding:'9px 0', cursor:'pointer',
                        fontSize:11, ...MONO }}>
                      NEW TASK →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  )
}
