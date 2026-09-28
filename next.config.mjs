/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    const security = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
    ];
    const hsts =
      process.env.NODE_ENV === "production"
        ? [
            {
              key: "Strict-Transport-Security",
              value: "max-age=31536000; includeSubDomains",
            },
          ]
        : [];
    // Page CSP (with a per-request script nonce) is set in proxy.ts.
    // API responses never render HTML, so they get a lock-down policy.
    return [
      { source: "/:path*", headers: [...security, ...hsts] },
      { source: "/api/:path((?!v1/email/unsubscribe).*)", headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }] },
      // The unsubscribe page is the one API route that renders HTML: inline styles and a same-origin form only.
      { source: "/api/v1/email/unsubscribe", headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" }] },
    ];
  },
};

export default nextConfig;
