import { execSync } from 'child_process'
import os from 'os'
import { NextRequest, NextResponse } from 'next/server'

const ZERO_BIN = `${os.homedir()}/.zero/bin`

export async function POST(req: NextRequest) {
  const { runId, accuracy, value } = await req.json()
  try {
    const output = execSync(
      `zero review ${runId} --success --accuracy ${accuracy} --value ${value} --reliability ${accuracy}`,
      {
        env: { ...process.env, PATH: `${ZERO_BIN}:${process.env.PATH}` },
        timeout: 15000,
        encoding: 'utf8',
      }
    )
    return NextResponse.json({ ok: true, output })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
