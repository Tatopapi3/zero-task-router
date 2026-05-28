import { execSync } from 'child_process'
import os from 'os'
import { NextRequest, NextResponse } from 'next/server'
import { createWalletClient, http } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { createPaymentHeader } from 'x402/client'

const ZERO_BIN    = `${os.homedir()}/.zero/bin`
const PRIVATE_KEY = (process.env.ZERO_PRIVATE_KEY ?? '0xa79bd8febcdbbb8c75a9e9ec0620ca5e5987b11a9bc0cc0305cc56c621f3415e') as `0x${string}`
const X402_VER    = 2

/* ── EIP-155 chain ID → x402 network name ────────────────────── */
const CHAIN_MAP: Record<string, string> = {
  '8453':'base', '84532':'base-sepolia', '43114':'avalanche',
  '43113':'avalanche-fuji', '137':'polygon', '80002':'polygon-amoy',
}
function normalizeNetwork(network: string): string {
  // "eip155:8453" → "base"
  const m = network.match(/eip155:(\d+)/)
  if (m) return CHAIN_MAP[m[1]] ?? 'base'
  return network
}

/* ── Parse the payment-required header (base64 JSON) ─────────── */
function parsePaymentHeader(raw: string) {
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8')
    const obj = JSON.parse(decoded) as {
      x402Version?: number
      accepts?: Array<Record<string, unknown>>
      resource?: { url?: string; description?: string; mimeType?: string }
    }
    const accept = obj.accepts?.[0]
    if (!accept) return null

    return {
      scheme:             'exact' as const,
      network:            normalizeNetwork(String(accept.network ?? 'base')),
      maxAmountRequired:  String(accept.amount ?? accept.maxAmountRequired ?? '0'),
      resource:           String((obj.resource as Record<string,string>)?.url ?? accept.resource ?? ''),
      description:        String((obj.resource as Record<string,string>)?.description ?? accept.description ?? ''),
      mimeType:           String((obj.resource as Record<string,string>)?.mimeType ?? accept.mimeType ?? 'application/json'),
      payTo:              String(accept.payTo ?? ''),
      maxTimeoutSeconds:  Number(accept.maxTimeoutSeconds ?? 300),
      asset:              String(accept.asset ?? ''),
      extra:              (accept.extra ?? {}) as Record<string, string>,
    }
  } catch { return null }
}

/* ── viem wallet client ───────────────────────────────────────── */
function makeWalletClient() {
  const account = privateKeyToAccount(PRIVATE_KEY)
  return createWalletClient({ account, chain: base, transport: http('https://mainnet.base.org') })
}

/* ── x402 fetch: handles 402 automatically ───────────────────── */
async function x402Fetch(url: string, init: RequestInit = {}): Promise<Response> {
  const res1 = await fetch(url, init)
  if (res1.status !== 402) return res1

  // Payment requirements are in the `payment-required` header (base64 JSON)
  const headerVal = res1.headers.get('payment-required')
    ?? res1.headers.get('PAYMENT-REQUIRED')
    ?? res1.headers.get('x-payment-required')

  if (!headerVal) {
    // Some endpoints put it in the body
    const bodyText = await res1.text()
    let requirements = null
    try {
      const bodyJson = JSON.parse(bodyText)
      const accept = bodyJson?.accepts?.[0]
      if (accept) {
        requirements = {
          scheme:            'exact' as const,
          network:           normalizeNetwork(String(accept.network ?? 'base')),
          maxAmountRequired: String(accept.amount ?? accept.maxAmountRequired ?? '0'),
          resource:          String(bodyJson?.resource?.url ?? accept.resource ?? url),
          description:       String(bodyJson?.resource?.description ?? accept.description ?? ''),
          mimeType:          String(bodyJson?.resource?.mimeType ?? accept.mimeType ?? 'application/json'),
          payTo:             String(accept.payTo ?? ''),
          maxTimeoutSeconds: Number(accept.maxTimeoutSeconds ?? 300),
          asset:             String(accept.asset ?? ''),
          extra:             (accept.extra ?? {}) as Record<string, string>,
        }
      }
    } catch {}
    if (!requirements) throw new Error('No payment requirements in 402 response')
    return retryWithPayment(url, init, requirements)
  }

  const requirements = parsePaymentHeader(headerVal)
  if (!requirements) throw new Error('Could not parse payment-required header')
  return retryWithPayment(url, init, requirements)
}

async function retryWithPayment(
  url: string,
  init: RequestInit,
  requirements: ReturnType<typeof parsePaymentHeader> & object
): Promise<Response> {
  const client    = makeWalletClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payHeader = await createPaymentHeader(client as any, X402_VER, requirements as any)
  const headers   = new Headers((init.headers as HeadersInit) ?? {})
  headers.set('X-PAYMENT', payHeader)
  headers.set('X-402-Version', String(X402_VER))
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

  // ── 2. x402 direct HTTP payment (Vercel) ─────────────────────
  if (!url) return NextResponse.json({ ok: false, error: 'No URL provided' }, { status: 400 })

  try {
    const hasBody = data && Object.keys(data).length > 0
    const init: RequestInit = {
      method: hasBody ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(60000),
      ...(hasBody && { body: JSON.stringify(data) }),
    }

    const res  = await x402Fetch(url, init)
    const text = await res.text()

    let result: unknown
    try { result = JSON.parse(text) }
    catch { result = { text } }

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `HTTP ${res.status}`, detail: text }, { status: 500 })
    }
    return NextResponse.json({ ok: true, result, runId: null })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
