import { createHash } from 'node:crypto'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Injects the Content-Security-Policy as a <meta> tag at build time.
//
// Why a meta tag and not host headers: the policy then travels inside dist/, so it applies on any
// static host — including GitHub Pages, which cannot set headers at all. The directives a meta tag
// silently ignores (frame-ancestors, report-uri, sandbox) live in public/_headers and vercel.json
// instead. Multiple policies intersect rather than override, so the two can't weaken each other.
//
// Why build-only: Vite's dev server needs inline scripts and a WebSocket for HMR, which a
// production-grade policy blocks. `npm run dev` deliberately runs without a CSP.
//
// The point of all this is egress control. This app parses a Zerodha tradebook entirely in the
// browser; connect-src is what stops an injected or compromised script from posting it anywhere.
function contentSecurityPolicy(): Plugin {
  const policy = (inlineScriptHashes: string[]) =>
    [
      `default-src 'self'`,
      // gc.zgo.at serves the analytics script; the hashes cover the theme-init script in index.html.
      `script-src 'self' https://gc.zgo.at ${inlineScriptHashes.join(' ')}`,
      // mfapi.in is the only origin app code contacts. The goatcounter host is the beacon target:
      // count.js calls navigator.sendBeacon first, which connect-src governs...
      `connect-src 'self' https://api.mfapi.in https://asset-analyser.goatcounter.com`,
      // ...and falls back to an <img> when sendBeacon is unavailable or blocked, which img-src
      // governs. Both are needed, or analytics breaks on exactly the browsers needing the fallback.
      `img-src 'self' https://asset-analyser.goatcounter.com`,
      // Unavoidable: Recharts and the chart/table components set inline `style` attributes for
      // per-series colors. Safe here only because the app has no HTML-injection sink — no
      // dangerouslySetInnerHTML, no innerHTML, no eval anywhere in src/.
      `style-src 'self' 'unsafe-inline'`,
      // Fonts are bundled by @fontsource into dist/assets; no font CDN, and no data: URIs are
      // emitted anywhere in the build, so neither needs a scheme exception.
      `font-src 'self'`,
      `object-src 'none'`,
      `base-uri 'none'`,
      `form-action 'none'`,
    ].join('; ')

  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml: {
      // 'post' so this runs after Vite has injected its own tags and the HTML is final — the
      // hashes below have to match the bytes actually shipped.
      order: 'post',
      handler(html) {
        // Hashing the inline scripts found in the *final* HTML, rather than hardcoding a literal,
        // means editing the theme-init script can never silently invalidate the policy. That
        // failure would surface only as a theme flash plus a console error nobody reads.
        const hashes = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
          (match) => `'sha256-${createHash('sha256').update(match[1], 'utf8').digest('base64')}'`,
        )

        return {
          html,
          tags: [
            {
              tag: 'meta',
              attrs: {
                'http-equiv': 'Content-Security-Policy',
                content: policy(hashes),
              },
              // Load-bearing: a meta CSP governs only what follows it, and the theme-init script
              // is the first thing in <head>.
              injectTo: 'head-prepend',
            },
          ],
        }
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
})
