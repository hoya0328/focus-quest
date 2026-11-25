import type { SupabaseClient } from "@supabase/supabase-js";

// Delete bytes through Storage's API, never by deleting storage.objects rows.
// Paths come from owner/record UUIDs, not user-editable file metadata.
export async function cleanupDeletedPdfs(admin: SupabaseClient) {
  for (let batch = 0; batch < 10; batch++) {
    const pending = await admin.rpc("focus_quest_pending_pdf_cleanup");
    if (pending.error || !Array.isArray(pending.data)) throw new Error("PDF cleanup queue unavailable.");
    if (!pending.data.length) return;
    const paths = pending.data.map((item: { storage_path: string }) => item.storage_path);
    if (paths.some((name: string) => !/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/source\.pdf$/.test(name))) throw new Error("Invalid PDF cleanup target.");
    const removed = await admin.storage.from("study-materials").remove(paths);
    if (removed.error) throw new Error("Deleted PDF bytes could not be removed.");
    const result = await admin.rpc("acknowledge_focus_quest_pdf_cleanup", { request_ids: pending.data.map((item: { id: string }) => item.id) });
    if (result.error) throw new Error("PDF cleanup acknowledgement failed.");
  }
  throw new Error("PDF cleanup batch limit reached; run again before backing up.");
}
