/**
 * Todoist answers some writes (like closing a task) with an empty body. Browser clients
 * parse JSON replies, so an empty one looks like a failure. Always return valid JSON.
 */
export function normalizeReply(text: string, ok: boolean, status: number): { text: string; status: number } {
  if (!text.trim()) return { text: JSON.stringify({ ok }), status: ok ? 200 : status }
  return { text, status }
}
