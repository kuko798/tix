import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  experimental: {
    taint: true,
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
  poweredByHeader: false,
  async headers() {
    const isDevelopment = process.env.NODE_ENV === "development";
    const forceHttps = !isDevelopment && process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://");
    const developmentScriptPolicy = isDevelopment ? " 'unsafe-eval'" : "";
    const uploadOrigins = process.env.S3_ENDPOINT
      ? [new URL(process.env.S3_ENDPOINT).origin]
      : process.env.S3_BUCKET && process.env.S3_REGION
        ? [`https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com`, `https://${process.env.S3_BUCKET}.s3.amazonaws.com`]
        : [];
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      `script-src 'self' 'unsafe-inline'${developmentScriptPolicy} https://js.stripe.com https://*.js.stripe.com`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src 'self' https://api.stripe.com https://link.com https://*.link.com ${uploadOrigins.join(" ")}`,
      "frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://link.com https://*.link.com",
      ...(forceHttps ? ["upgrade-insecure-requests"] : []),
    ].join("; ");
    return [{ source: "/(.*)", headers: [
      { key: "Content-Security-Policy", value: csp },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    ] }];
  },
};

export default nextConfig;
