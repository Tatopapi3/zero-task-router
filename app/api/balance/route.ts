import { execSync } from 'child_process'
import os from 'os'
import { NextResponse } from 'next/server'

const ZERO_BIN = `${os.homedir()}/.zero/bin`

/* ── USDC on Base ─────────────────────────────────────────────── */
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const WALLET       = '0x35AcA9684f8873407B476965e9Eb4239519a6A60'
const BASE_RPC     = 'https://mainnet.base.org'

async function getBalanceOnChain(): Promise<number> {
  // balanceOf(address) selector = 0x70a08231
  const data = '0x70a08231' + WALLET.slice(2).toLowerCase().padStart(64, '0')
  const res = await fetch(BASE_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'eth_call', params:[{ to: USDC_ADDRESS, data }, 'latest'] }),
    signal: AbortSignal.timeout(8000),
  })
  const { result } = await res.json() as { result: string }
  return parseInt(result, 16) / 1_000_000  // USDC has 6 decimals
}

export async function GET() {
  // 1. Try CLI (local dev)
  try {
    const output = execSync('zero wallet balance', {
      env: { ...process.env, PATH: `${ZERO_BIN}:${process.env.PATH}` },
      timeout: 8000, encoding: 'utf8',
    }).trim()
    const match = output.match(/([0-9.]+)/)
    if (match) return NextResponse.json({ ok: true, balance: parseFloat(match[1]), raw: output })
  } catch {}

  // 2. Fall back to Base RPC
  try {
    const balance = await getBalanceOnChain()
    return NextResponse.json({ ok: true, balance, raw: `${balance} USDC` })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, balance: 0, error: msg })
  }
}
