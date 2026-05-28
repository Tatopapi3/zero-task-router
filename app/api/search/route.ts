import { execSync } from 'child_process'
import os from 'os'
import { NextRequest, NextResponse } from 'next/server'

const ZERO_BIN = `${os.homedir()}/.zero/bin`

/* ── Real verified capabilities from Zero registry ───────────── */
export const ALL_CAPS = [
  {
    position:1, name:'FLUX Image Generator',
    endpoint:'https://x402-gateway-production.up.railway.app/api/image/fast',
    capabilityId:'x402-gateway-fast-image-generation-flux-schnell',
    price:0.015, priceDisplay:'0.015 USDC/call', rating:'4.9', status:'healthy' as const,
    description:'Generate images from text prompts using FLUX Schnell (~2s)',
    bodySchema:{ prompt:'string' },
    keywords:['image','photo','picture','generate','create','draw','art','visual','flux','illustration'],
  },
  {
    position:2, name:'Current Weather',
    endpoint:'https://weather.payapi.market/current',
    capabilityId:'weather-payapi-market-1d04726c',
    price:0.001, priceDisplay:'0.001 USDC/call', rating:'5.0', status:'stable' as const,
    description:'Real-time weather: temp, humidity, wind for any city worldwide',
    bodySchema:{ location:'string', latitude:'string', longitude:'string' },
    keywords:['weather','temperature','forecast','climate','rain','sunny','hot','cold','wind','location'],
  },
  {
    position:3, name:'Weather Forecast',
    endpoint:'https://weather.withzero.ai/run',
    capabilityId:'zeroclick-x402-service-registry-weather-0cd7c167',
    price:0.001, priceDisplay:'0.001 USDC/call', rating:'4.7', status:'healthy' as const,
    description:'Current weather + 7-day daily forecast for any location worldwide',
    bodySchema:{ location:'string', latitude:'string', longitude:'string', units:'string' },
    keywords:['weather','forecast','7-day','week','daily','future'],
  },
  {
    position:4, name:'Bazaar Translator',
    endpoint:'https://bazaar-gateway.vercel.app/api/translate',
    capabilityId:'bazaar-gateway-vercel-app-93ea6225',
    price:0.005, priceDisplay:'0.005 USDC/call', rating:'4.7', status:'healthy' as const,
    description:'Translate text between any languages using Claude AI — 100% success rate',
    bodySchema:{ text:'string', target_language:'string' },
    keywords:['translate','translation','spanish','french','arabic','language','convert','text','words'],
  },
  {
    position:5, name:'OpenWeather Full Forecast',
    endpoint:'https://openweather.mpp.paywithlocus.com/openweather/onecall',
    capabilityId:'openweather-onecall-ceae0bee',
    price:0.010, priceDisplay:'0.010 USDC/call', rating:'4.9', status:'healthy' as const,
    description:'Comprehensive forecast: current, hourly, daily + weather alerts by coordinates',
    bodySchema:{ lat:'string', lon:'string', units:'string', lang:'string' },
    keywords:['weather','forecast','hourly','alert','openweather','detailed','comprehensive'],
  },
  {
    position:6, name:'Grok Image (fal.ai)',
    endpoint:'https://grok.mpp.paywithlocus.com/grok/imagine',
    capabilityId:'grok-imagine-image-4ae8e6e9',
    price:0.040, priceDisplay:'0.040 USDC/call', rating:'4.3', status:'healthy' as const,
    description:'Generate high-quality images from text prompts using xAI Grok Imagine via fal.ai',
    bodySchema:{ prompt:'string' },
    keywords:['image','photo','grok','xai','art','generate','creative','high quality'],
  },
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
  return [ALL_CAPS[0], ALL_CAPS[3]] // image + translate as default
}

export async function POST(req: NextRequest) {
  const { query } = await req.json()

  // 1. Try Zero CLI (local dev)
  try {
    const safe = (query as string).replace(/"/g, '\\"')
    const raw = execSync(`zero search "${safe}"`, {
      env: { ...process.env, PATH: `${ZERO_BIN}:${process.env.PATH}` },
      timeout: 15000, encoding: 'utf8',
    })
    const lines = raw.split('\n').filter(Boolean)
    const capabilities: typeof ALL_CAPS = []
    let pos = 1
    for (const line of lines) {
      const m = line.match(/^\s*(\d+)\.\s+(.+?)\s+[—\-–]\s+\$?([\d.]+)/)
      if (m) {
        const name  = m[2].trim()
        const price = parseFloat(m[3]) || 0
        const known = ALL_CAPS.find(c => c.name.toLowerCase().includes(name.toLowerCase().slice(0,8)) || name.toLowerCase().includes(c.name.toLowerCase().slice(0,8)))
        capabilities.push({
          position: pos++, name,
          endpoint: known?.endpoint ?? '',
          capabilityId: known?.capabilityId ?? '',
          price, priceDisplay: `${price.toFixed(3)} USDC/call`,
          rating: '4.5', status: 'healthy' as const,
          description: known?.description ?? name,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          bodySchema: (known?.bodySchema ?? { prompt:'string' }) as any,
          keywords: known?.keywords ?? [],
        })
      }
    }
    if (capabilities.length > 0) return NextResponse.json({ ok: true, capabilities })
  } catch {}

  // 2. Smart keyword fallback (always works on Vercel)
  return NextResponse.json({ ok: true, capabilities: smartSearch(query || '') })
}
