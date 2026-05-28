# Zero Task Router

A natural-language interface for discovering and paying for AI capabilities on the [Zero](https://withzero.ai) registry using the [x402](https://x402.org) micropayment protocol.

Type what you want in plain English — the app finds the right capability, shows you the cost, and pays for it automatically using USDC on Base.

---

## What it does

1. **Search** — Describe a task in natural language (e.g. *"generate an image of a sunset"*, *"translate this to Arabic"*, *"weather in New York"*). The app queries the Zero capability registry and returns the best matching APIs.

2. **Inspect** — Select a capability to see its endpoint, pricing, and request schema. Edit the request body directly before running.

3. **Pay & Run** — Hit **Run Capability**. The app handles the full [x402](https://x402.org) payment flow automatically: detects the 402 challenge, signs an EIP-3009 USDC authorization, and retries with the payment header — no manual wallet interaction needed.

4. **Results** — Output streams back into the terminal panel. Images render inline, JSON is formatted, text is displayed as-is.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Payments | x402 protocol · USDC on Base |
| Wallet | viem · EIP-3009 `transferWithAuthorization` |
| Capability registry | [Zero CLI](https://withzero.ai) + HTTP fallback |
| Deployment | Vercel |

---

## Getting started

### 1. Clone and install

```bash
git clone https://github.com/Tatopapi3/zero-task-router.git
cd zero-task-router
npm install
```

### 2. Set your wallet private key

The app needs a private key to sign x402 payments. Set it as an environment variable:

```bash
export ZERO_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
```

Or add it to `.env.local`:

```
ZERO_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
```

> **Fund your wallet** — Send USDC to the derived address on **Base mainnet** before running capabilities. Each call costs between $0.001 and $0.15 USDC depending on the capability.

### 3. (Optional) Install the Zero CLI

The Zero CLI enables live registry search on your machine. Without it, the app falls back to a curated set of known capabilities.

```bash
curl -fsSL https://install.withzero.ai | sh
```

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploying to Vercel

```bash
npx vercel --prod
```

Set `ZERO_PRIVATE_KEY` in your Vercel project's environment variables. The Zero CLI is not available in serverless environments — the app uses its built-in capability list and x402 HTTP client as a full fallback.

---

## Supported capabilities

| Capability | Cost | Notes |
|---|---|---|
| FLUX Schnell Fast Text-to-Image | $0.003/call | 99% success, fastest |
| FLUX Image Generator (x402 Gateway) | $0.015/call | 98% success |
| Grok Imagine Image | $0.040/call | xAI via fal.ai |
| Weather Forecast (Open-Meteo) | $0.001/call | 7-day forecast |
| Current Weather | $0.001/call | Real-time, any city |
| Bazaar Translator | $0.005/call | 100+ languages via Claude |
| OpenWeather Full Forecast | $0.010/call | Hourly + alerts |

---

## How x402 payments work

```
Client → GET/POST capability endpoint
         ← 402 Payment Required  (payment-required: base64 JSON header)
Client signs EIP-3009 USDC transferWithAuthorization
Client → retry with X-PAYMENT header
         ← 200 OK + result
```

The entire flow is automatic. The private key never leaves your environment — only the signed authorization is transmitted.

---

## Project structure

```
app/
├── page.tsx              # Main UI — 4-panel bento layout
└── api/
    ├── search/route.ts   # Capability discovery (CLI + smart fallback)
    ├── get/route.ts      # Capability detail lookup
    ├── run/route.ts      # x402 payment + execution
    ├── balance/route.ts  # USDC wallet balance (Base RPC)
    └── review/route.ts   # Capability rating submission
```
