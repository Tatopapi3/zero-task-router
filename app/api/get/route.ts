import { execSync } from 'child_process'
import os from 'os'
import { NextRequest, NextResponse } from 'next/server'

const ZERO_BIN = `${os.homedir()}/.zero/bin`

function parseGetOutput(raw: string) {
  // Extract the capability URL
  const urlMatch = raw.match(/(https?:\/\/[^\s\n"]+)/)
  const url = urlMatch ? urlMatch[1] : null

  // Try to extract body schema
  let bodySchema: Record<string, unknown> | null = null
  const jsonBlock = raw.match(/\{[\s\S]*\}/)
  if (jsonBlock) {
    try { bodySchema = JSON.parse(jsonBlock[0]) } catch {}
  }
  if (/bodySchema[:\s]+null/i.test(raw)) bodySchema = null

  // Extract price
  const priceMatch = raw.match(/\$([0-9.]+)\s*\/\s*call/i)
  const price = priceMatch ? parseFloat(priceMatch[1]) : null

  return { url, bodySchema, price, raw }
}

export async function POST(req: NextRequest) {
  const { identifier } = await req.json()
  try {
    const output = execSync(`zero get ${identifier} --formatted`, {
      env: { ...process.env, PATH: `${ZERO_BIN}:${process.env.PATH}` },
      timeout: 15000,
      encoding: 'utf8',
    })
    return NextResponse.json({ ok: true, ...parseGetOutput(output) })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
