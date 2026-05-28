import { execSync } from 'child_process'
import os from 'os'
import { NextRequest, NextResponse } from 'next/server'

const ZERO_BIN = `${os.homedir()}/.zero/bin`

export async function POST(req: NextRequest) {
  const { url, data, maxPay = 0.10 } = await req.json()
  try {
    let cmd = `zero fetch "${url}" --max-pay ${maxPay}`
    if (data && Object.keys(data).length > 0) {
      cmd += ` -d '${JSON.stringify(data).replace(/'/g, "'\\''")}'`
    }

    const raw = execSync(cmd, {
      env: { ...process.env, PATH: `${ZERO_BIN}:${process.env.PATH}` },
      timeout: 60000,
      encoding: 'utf8',
    })

    // zero CLI output includes log lines + JSON — extract just the JSON
    const jsonMatch = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
    let result: unknown
    try { result = jsonMatch ? JSON.parse(jsonMatch[0]) : { text: raw } }
    catch { result = { text: raw } }

    // Extract run ID from the CLI log lines
    const runIdMatch = raw.match(/Run ID:\s*(run_[a-zA-Z0-9_]+)/)
    const runId = runIdMatch?.[1]
      ?? (result as any)?.runId
      ?? (result as any)?.run_id
      ?? null

    return NextResponse.json({ ok: true, result, runId })
  } catch (err: any) {
    const stderr = err.stderr?.toString() || ''
    const stdout = err.stdout?.toString() || ''
    return NextResponse.json(
      { ok: false, error: err.message, detail: stderr || stdout },
      { status: 500 }
    )
  }
}
