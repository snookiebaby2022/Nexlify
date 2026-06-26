import { buildSecurityTxt } from "@/lib/security-txt";

/** Alias for scanners that check /security.txt instead of /.well-known/security.txt */
export async function GET() {
  return new Response(buildSecurityTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
