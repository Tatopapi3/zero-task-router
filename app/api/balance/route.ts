import { execSync } from 'child_process'
import os from 'os'
import { NextResponse } from 'next/server'

const ZERO_BIN = `${os.homedir()}/.zero/bin`

export async function GET() {
  try {
    const output = execSync('zero wallet balance', {
      env: { ...process.env, PATH: `${ZERO_BIN}:${process.env.PATH}` },
      timeout: 8000, encoding: 'utf8',
    }).trim()
    // output like "5 USDC" or "5.00 USDC"
    const match = output.match(/([0-9.]+)/)
    const balance = match ? parseFloat(match[1]) : 0
    return NextResponse.json({ ok: true, balance, raw: output })
  } catch (err: any) {
    return NextResponse.json({ ok: false, balance: 0, error: err.message })
  }
}
