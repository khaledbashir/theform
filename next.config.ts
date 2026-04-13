import type { NextConfig } from "next";

// Allow ANC Forms to be embedded inside Twenty CRM via IFRAME widgets.
// The frame-ancestors CSP allows any twenty subdomain on izcgmb.easypanel.host.
const FRAME_ANCESTORS = [
  "'self'",
  "https://abc-twenty.izcgmb.easypanel.host",
  "https://*.izcgmb.easypanel.host",
  "https://crm.ancsports.net",
  "https://*.ancsports.net",
].join(" ");

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Explicitly allow iframe embedding — removes any default DENY.
          { key: "Content-Security-Policy", value: `frame-ancestors ${FRAME_ANCESTORS}` },
        ],
      },
    ];
  },
};

export default nextConfig;
