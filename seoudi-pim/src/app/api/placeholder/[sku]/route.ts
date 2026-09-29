/** Deterministic SVG placeholder used as demo image URL (no external dependency). */
export async function GET(_req: Request, { params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const safe = sku.replace(/[^A-Za-z0-9-]/g, "").slice(0, 20);
  let h = 0;
  for (const c of safe) h = (h * 31 + c.charCodeAt(0)) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
<rect width="400" height="400" fill="hsl(${h},35%,94%)"/>
<rect x="120" y="90" width="160" height="200" rx="14" fill="hsl(${h},40%,78%)"/>
<rect x="140" y="130" width="120" height="60" rx="6" fill="#fff" opacity=".8"/>
<text x="200" y="340" text-anchor="middle" font-family="monospace" font-size="20" fill="hsl(${h},30%,35%)">${safe}</text></svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
}
