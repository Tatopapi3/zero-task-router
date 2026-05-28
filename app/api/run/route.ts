import { execSync } from 'child_process'
import os from 'os'
import { NextRequest, NextResponse } from 'next/server'
import { createWalletClient, http } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { createPaymentHeader } from 'x402/client'

const ZERO_BIN    = `${os.homedir()}/.zero/bin`
const PRIVATE_KEY = (process.env.ZERO_PRIVATE_KEY ?? '0xa79bd8febcdbbb8c75a9e9ec0620ca5e5987b11a9bc0cc0305cc56c621f3415e') as `0x${string}`
const X402_VER    = 1

/* ── Build a viem wallet client from the private key ─────────── */
function makeWalletClient() {
  const account = privateKeyToAccount(PRIVATE_KEY)
  return createWalletClient({ account, chain: base, transport: http('https://mainnet.base.org') })
}

/* ── x402 fetch — handles 402 payment automatically ─────────── */
async function x402Fetch(url: string, init: RequestInit = {}): Promise<Response> {
  // First attempt
  const res1 = await fetch(url, init)
  if (res1.status !== 402) return res1

  // Parse payment requirements
  const payReqs = await res1.json() as { accepts: unknown[] }
  const requirements = payReqs?.accepts?.[0] as Record<string, unknown>
  if (!requirements) throw new Error('No payment requirements in 402 response')

  // Sign and create payment header
  const client     = makeWalletClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payHeader  = await createPaymentHeader(client as any, X402_VER, requirements as any)

  // Retry with payment
  const headers = new Headers(init.headers as HeadersInit ?? {})
  headers.set('X-PAYMENT', payHeader)
  headers.set('X-402-VERSION', String(X402_VER))
  return fetch(url, { ...init, headers })
}

export async function POST(req: NextRequest) {
  const { url, data, maxPay = 0.10 } = await req.json()

  // ── 1. Try Zero CLI (works locally) ──────────────────────────
  try {
    let cmd = `zero fetch "${url}" --max-pay ${maxPay}`
    if (data && Object.keys(data).length > 0) {
      cmd += ` -d '${JSON.stringify(data).replace(/'/g, "'\\''")}'`
    }
    const raw = execSync(cmd, {
      env: { ...process.env, PATH: `${ZERO_BIN}:${process.env.PATH}` },
      timeout: 60000, encoding: 'utf8',
    })
    const jsonMatch = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
    let result: unknown
    try { result = jsonMatch ? JSON.parse(jsonMatch[0]) : { text: raw } }
    catch { result = { text: raw } }

    const runIdMatch = raw.match(/Run ID:\s*(run_[a-zA-Z0-9_]+)/)
    const runId = runIdMatch?.[1] ?? (result as Record<string,string>)?.runId ?? null
    return NextResponse.json({ ok: true, result, runId })
  } catch {}

  // ── 2. x402 direct HTTP payment (works on Vercel) ────────────
  if (!url) return NextResponse.json({ ok: false, error: 'No URL provided' }, { status: 400 })

  try {
    const init: RequestInit = {
      method: data && Object.keys(data).length > 0 ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(60000),
    }
    if (data && Object.keys(data).length > 0) {
      init.body = JSON.stringify(data)
    }

    const res  = await x402Fetch(url, init)
    const text = await res.text()

    let result: unknown
    try { result = JSON.parse(text) }
    catch { result = { text } }

    if (!res.ok && res.status !== 200) {
      return NextResponse.json({ ok: false, error: `HTTP ${res.status}`, detail: text }, { status: 500 })
    }

    return NextResponse.json({ ok: true, result, runId: null })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
