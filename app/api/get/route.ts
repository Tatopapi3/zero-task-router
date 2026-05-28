import { execSync } from 'child_process'
import os from 'os'
import { NextRequest, NextResponse } from 'next/server'

const ZERO_BIN = `${os.homedir()}/.zero/bin`

/* ── Known capability details (matches search route) ─────────── */
const KNOWN: Record<number, { url: string; bodySchema: Record<string, unknown>; price: number }> = {
  1: { url:'https://x402-gateway-production.up.railway.app/api/image/fast',   price:0.015, bodySchema:{ prompt:'string' } },
  2: { url:'https://x402-gateway-production.up.railway.app/api/weather',      price:0.005, bodySchema:{ location:'string', units:'string' } },
  3: { url:'https://x402-gateway-production.up.railway.app/api/translate',    price:0.001, bodySchema:{ text:'string', target_lang:'string' } },
  4: { url:'https://x402-gateway-production.up.railway.app/api/news',         price:0.008, bodySchema:{ topic:'string' } },
  5: { url:'https://x402-gateway-production.up.railway.app/api/code',         price:0.020, bodySchema:{ prompt:'string', language:'string' } },
  6: { url:'https://x402-gateway-production.up.railway.app/api/analyze',      price:0.025, bodySchema:{ data:'string', question:'string' } },
  7: { url:'https://x402-gateway-production.up.railway.app/api/seo',          price:0.010, bodySchema:{ topic:'string', keywords:'string' } },
  8: { url:'https://x402-gateway-production.up.railway.app/api/freight',      price:1.000, bodySchema:{ origin:'string', destination:'string', container:'string' } },
}

function parseGetOutput(raw: string) {
  const urlMatch = raw.match(/(https?:\/\/[^\s\n"]+)/)
  const url = urlMatch ? urlMatch[1] : null
  let bodySchema: Record<string, unknown> | null = null
  const jsonBlock = raw.match(/\{[\s\S]*\}/)
  if (jsonBlock) { try { bodySchema = JSON.parse(jsonBlock[0]) } catch {} }
  const priceMatch = raw.match(/\$?([0-9.]+)\s*\/\s*call/i)
  const price = priceMatch ? parseFloat(priceMatch[1]) : null
  return { url, bodySchema, price, raw }
}

export async function POST(req: NextRequest) {
  const { identifier } = await req.json()
  const id = parseInt(String(identifier))

  // 1. Try Zero CLI
  try {
    const output = execSync(`zero get ${identifier} --formatted`, {
      env: { ...process.env, PATH: `${ZERO_BIN}:${process.env.PATH}` },
      timeout: 15000, encoding: 'utf8',
    })
    const parsed = parseGetOutput(output)
    // Enrich with known endpoint if CLI didn't return a URL
    if (!parsed.url && KNOWN[id]) parsed.url = KNOWN[id].url
    if (!parsed.bodySchema && KNOWN[id]) parsed.bodySchema = KNOWN[id].bodySchema
    return NextResponse.json({ ok: true, ...parsed })
  } catch {}

  // 2. Fall back to known capability data
  const known = KNOWN[id] ?? KNOWN[1]
  return NextResponse.json({ ok: true, ...known, raw: '' })
}
