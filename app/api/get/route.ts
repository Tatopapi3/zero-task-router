import { execSync } from 'child_process'
import os from 'os'
import { NextRequest, NextResponse } from 'next/server'
import { ALL_CAPS } from '../search/route'

const ZERO_BIN = `${os.homedir()}/.zero/bin`

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
  const { identifier, endpoint } = await req.json()

  // If the frontend already has the endpoint (from search result), use it directly
  if (endpoint) {
    const id = parseInt(String(identifier))
    const known = ALL_CAPS.find(c => c.position === id) ?? ALL_CAPS[0]
    return NextResponse.json({ ok: true, url: endpoint, bodySchema: known.bodySchema, price: known.price, raw: '' })
  }

  const id = parseInt(String(identifier))

  // 1. Try Zero CLI
  try {
    const output = execSync(`zero get ${identifier} --formatted`, {
      env: { ...process.env, PATH: `${ZERO_BIN}:${process.env.PATH}` },
      timeout: 15000, encoding: 'utf8',
    })
    const parsed = parseGetOutput(output)
    const known = ALL_CAPS.find(c => c.position === id)
    if (!parsed.url && known) parsed.url = known.endpoint
    if (!parsed.bodySchema && known) parsed.bodySchema = known.bodySchema
    return NextResponse.json({ ok: true, ...parsed })
  } catch {}

  // 2. Fall back to known capability
  const known = ALL_CAPS.find(c => c.position === id) ?? ALL_CAPS[0]
  return NextResponse.json({ ok: true, url: known.endpoint, bodySchema: known.bodySchema, price: known.price, raw: '' })
}
