import { execSync } from 'child_process'
import os from 'os'
import { NextRequest, NextResponse } from 'next/server'

const ZERO_BIN = `${os.homedir()}/.zero/bin`

export interface Capability {
  position: number
  name: string
  price: number
  priceDisplay: string
  rating: string
  status: 'healthy' | 'degraded' | 'stable' | 'unrated'
  description: string
}

function parseSearchOutput(output: string): Capability[] {
  const capabilities: Capability[] = []
  const lines = output.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(/^\s+(\d+)\.\s+(.+?)\s+[—–]\s+\$([0-9.]+)\/call\s+[—–]\s+(.*?)\s+[—–]\s+(healthy|degraded|stable|unrated)/)
    if (match) {
      const [, pos, name, price, rating, status] = match
      let description = ''
      if (i + 1 < lines.length) {
        const next = lines[i + 1].trim()
        if (next.startsWith('"')) {
          description = next.replace(/^"|"$/g, '')
          i++
        }
      }
      capabilities.push({
        position: parseInt(pos),
        name: name.trim(),
        price: parseFloat(price),
        priceDisplay: `$${price}/call`,
        rating: rating.trim(),
        status: status as Capability['status'],
        description,
      })
    }
  }
  return capabilities
}

export async function POST(req: NextRequest) {
  const { query } = await req.json()
  try {
    const safe = query.replace(/"/g, '\\"')
    const output = execSync(`zero search "${safe}"`, {
      env: { ...process.env, PATH: `${ZERO_BIN}:${process.env.PATH}` },
      timeout: 15000,
      encoding: 'utf8',
    })
    return NextResponse.json({ ok: true, capabilities: parseSearchOutput(output) })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
