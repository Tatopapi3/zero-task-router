import { execSync } from 'child_process'
import os from 'os'
import { NextRequest, NextResponse } from 'next/server'

const ZERO_BIN = `${os.homedir()}/.zero/bin`

/* ── Known capabilities ──────────────────────────────────────── */
const ALL_CAPS = [
  { position:1,  name:'Image Generator',  endpoint:'https://x402-gateway-production.up.railway.app/api/image/fast',   price:0.015, priceDisplay:'0.015 USDC/call', rating:'4.9', status:'healthy' as const, description:'Generate images from text prompts using FLUX Schnell',   keywords:['image','photo','picture','generate','create','draw','art','visual','flux'] },
  { position:2,  name:'Weather API',       endpoint:'https://x402-gateway-production.up.railway.app/api/weather',       price:0.005, priceDisplay:'0.005 USDC/call', rating:'5.0', status:'healthy' as const, description:'Real-time weather data for any location worldwide',     keywords:['weather','temperature','forecast','climate','rain','location'] },
  { position:3,  name:'Translator Pro',    endpoint:'https://x402-gateway-production.up.railway.app/api/translate',     price:0.001, priceDisplay:'0.001 USDC/call', rating:'4.8', status:'healthy' as const, description:'Translate text between 100+ languages instantly',       keywords:['translate','translation','spanish','french','language','text'] },
  { position:4,  name:'News Summarizer',   endpoint:'https://x402-gateway-production.up.railway.app/api/news',          price:0.008, priceDisplay:'0.008 USDC/call', rating:'4.7', status:'healthy' as const, description:'Summarize latest news for any topic or keyword',        keywords:['news','summarize','headline','article','latest','today','report'] },
  { position:5,  name:'Code Assistant',    endpoint:'https://x402-gateway-production.up.railway.app/api/code',          price:0.020, priceDisplay:'0.020 USDC/call', rating:'4.9', status:'healthy' as const, description:'Generate, debug, or explain code in any language',      keywords:['code','programming','function','debug','python','javascript','script'] },
  { position:6,  name:'Data Analyzer',     endpoint:'https://x402-gateway-production.up.railway.app/api/analyze',       price:0.025, priceDisplay:'0.025 USDC/call', rating:'4.6', status:'stable'  as const, description:'Analyze datasets and return structured insights',       keywords:['data','analyze','statistics','insight','csv','table'] },
  { position:7,  name:'SEO Optimizer',     endpoint:'https://x402-gateway-production.up.railway.app/api/seo',           price:0.010, priceDisplay:'0.010 USDC/call', rating:'4.5', status:'healthy' as const, description:'Generate SEO-optimized content and keyword suggestions',keywords:['seo','keyword','ranking','content','optimize','google'] },
  { position:8,  name:'Freight Rate API',  endpoint:'https://x402-gateway-production.up.railway.app/api/freight',       price:1.000, priceDisplay:'1.000 USDC/call', rating:'4.8', status:'healthy' as const, description:'Real-time freight rates for major US shipping lanes',    keywords:['freight','shipping','logistics','rate','container','cargo','route'] },
]

function smartSearch(query: string) {
  const q = query.toLowerCase()
  const scored = ALL_CAPS.map(cap => {
    let score = 0
    cap.keywords.forEach(kw => { if (q.includes(kw)) score += 2 })
    if (q.includes(cap.name.toLowerCase())) score += 5
    cap.description.toLowerCase().split(' ').forEach(w => { if (q.includes(w) && w.length > 4) score += 1 })
    return { cap, score }
  })
  const matches = scored.filter(s => s.score > 0).sort((a,b) => b.score - a.score)
  if (matches.length >= 2) return matches.slice(0,3).map(m => m.cap)
  if (matches.length === 1) return [matches[0].cap, ALL_CAPS[0]]
  return [ALL_CAPS[0], ALL_CAPS[1]]
}

export async function POST(req: NextRequest) {
  const { query } = await req.json()

  // 1. Try Zero CLI (local dev with CLI installed)
  try {
    const safe = query.replace(/"/g, '\\"')
    const raw = execSync(`zero search "${safe}"`, {
      env: { ...process.env, PATH: `${ZERO_BIN}:${process.env.PATH}` },
      timeout: 15000, encoding: 'utf8',
    })
    // Parse CLI output
    const lines = raw.split('\n').filter(Boolean)
    const capabilities: typeof ALL_CAPS = []
    let pos = 1
    for (const line of lines) {
      const m = line.match(/^\s*(\d+)\.\s+(.+?)\s+[—\-–]\s+\$?([\d.]+)/)
      if (m) {
        const name  = m[2].trim()
        const price = parseFloat(m[3]) || 0
        const known = ALL_CAPS.find(c => c.name.toLowerCase() === name.toLowerCase())
        capabilities.push({
          position: pos++, name,
          endpoint: known?.endpoint ?? '',
          price,
          priceDisplay: `${price.toFixed(3)} USDC/call`,
          rating: '4.5', status: 'healthy' as const,
          description: known?.description ?? name,
          keywords: known?.keywords ?? [],
        })
      }
    }
    if (capabilities.length > 0) return NextResponse.json({ ok: true, capabilities })
  } catch {}

  // 2. Smart keyword fallback
  const capabilities = smartSearch(query || '')
  return NextResponse.json({ ok: true, capabilities })
}
