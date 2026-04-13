# Condo Coverage Calculator

Standalone Cloudflare Pages app for estimating condo interior coverage.

## What it does

- Calculates a recommended condo walls-in coverage amount from square footage and finish selections
- Lets users upload room photos or take photos on their phone
- Converts iPhone HEIC and HEIF photos to JPEG in the browser before analysis
- Sends room images to a Cloudflare Pages Function that uses OpenAI vision to estimate cabinets, flooring, fixtures, built-ins, and owner-installed appliances

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.dev.vars.example` to `.dev.vars` and add your OpenAI API key.

3. Start local development:

```bash
npm run dev
```

## Deploy

Create a Cloudflare Pages project named `condo-coverage-calculator` and set:

- Build command: none
- Build output directory: `public`
- Production branch: `main`
- Environment variable: `OPENAI_API_KEY`
- Optional environment variable: `OPENAI_MODEL`

If you deploy with Wrangler instead of the dashboard:

```bash
npm run deploy
```
