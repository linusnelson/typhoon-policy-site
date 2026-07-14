import type { NextConfig } from "next";

// Content-Security-Policy. Supabase hosts come from runtime env (dev + prod
// projects), so we match them with a wildcard rather than hardcoding a project.
//   connect-src: REST/auth (https) + Realtime notifications (wss)
//   img-src:     employee photos & bill scans (Supabase storage) + drawn
//                signature data: URLs + object blobs
//   script/style 'unsafe-inline': Next injects inline bootstrap scripts and
//                Tailwind inline styles without nonces. Tightening this to a
//                nonce-based policy is the remaining CSP hardening step.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
].join("; ");

const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // This portal never uses the camera/mic/geolocation (attendance capture lives
  // in the Flutter app); deny them outright.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Report-Only for the initial rollout: the browser evaluates the policy and
  // logs violations to the console but blocks nothing, so it cannot break the
  // live app. Verify zero violations in DevTools on the dashboard, payslips,
  // expenses (bill images), and any realtime page, then promote by renaming
  // this key to "Content-Security-Policy".
  { key: "Content-Security-Policy-Report-Only", value: CSP },
];

// Segments that render salary, bank, or personal data. no-store keeps them out
// of the browser/proxy cache and disables bfcache, so the back button can't
// reveal them after sign-out on a shared device.
const SENSITIVE_ROOTS = [
  "/payslips",
  "/advances",
  "/profile",
  "/expenses",
  "/admin/employees",
  "/admin/advances",
  "/admin/payslips",
];
const NO_STORE = { key: "Cache-Control", value: "private, no-store" };

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // This project lives alongside other workspaces; pin the trace root to itself.
  outputFileTracingRoot: __dirname,
  experimental: {
    // Client-side Router Cache reuse window for dynamically-rendered pages.
    // Default for dynamic routes is 0, so every back/forward or repeat nav
    // refetches from the server. 30s lets quick repeat navigations reuse the
    // in-memory RSC payload — no extra Vercel invocation — while keeping data
    // fresh enough for an attendance/HR portal. In-memory + per-tab; a full
    // reload or the sign-out redirect drops it (sensitive routes additionally
    // get no-store below).
    staleTimes: { dynamic: 30 },
  },
  async headers() {
    return [
      // Security headers on every response (additive — no Cache-Control here, so
      // immutable caching of /_next/static assets is untouched).
      { source: "/:path*", headers: SECURITY_HEADERS },
      // no-store on sensitive roots and everything beneath them.
      ...SENSITIVE_ROOTS.flatMap((root) => [
        { source: root, headers: [NO_STORE] },
        { source: `${root}/:path*`, headers: [NO_STORE] },
      ]),
    ];
  },
};

export default nextConfig;
