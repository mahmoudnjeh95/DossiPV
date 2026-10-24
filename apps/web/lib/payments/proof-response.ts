/**
 * The response serving a payment screenshot: private, never cached, never sniffed. A screenshot
 * already erased (or never sent) is a 404, like an intent that is not the caller's.
 */
export function proofResponse(proof: { proofImage: Uint8Array | null; proofMime: string | null } | null): Response {
  if (!proof || !proof.proofImage || proof.proofImage.length === 0) {
    return new Response('Capture introuvable ou supprimée.', { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  }
  return new Response(new Uint8Array(proof.proofImage), {
    headers: {
      'Content-Type': proof.proofMime ?? 'image/jpeg',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
