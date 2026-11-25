// Stable key ordering makes pagination deterministic for a quiescent database.
// A live REST export is still not a transactionally consistent database snapshot.
export const backupTables = {
  focus_quest_cloud_states: ["user_id"],
  study_subjects: ["id"],
  study_quests: ["id"],
  study_quest_focus_sessions: ["session_id"],
  study_materials: ["id"],
  study_quest_progress: ["quest_id"],
  study_quiz_attempts: ["id"],
  focus_quest_product_events: ["id"],
  focus_quest_plus_interest: ["user_id"],
  focus_quest_camps: ["id"],
  focus_quest_camp_members: ["camp_id", "user_id"],
  focus_quest_camp_blocks: ["camp_id", "user_id"],
  focus_quest_camp_history: ["camp_id", "user_id"],
  focus_quest_camp_contacts: ["user_id", "contact_user_id"],
  focus_quest_camp_invitations: ["camp_id", "invitee_user_id"],
  focus_quest_camp_reports: ["id"],
  focus_quest_push_subscriptions: ["id"],
};

export async function readAllRows(createQuery, { pageSize = 500, maxRows = 1_000_000 } = {}) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const result = await createQuery().range(offset, offset + pageSize - 1);
    if (result.error) throw new Error(`Database read failed (${result.error.code ?? "unknown"}).`);
    if (!Array.isArray(result.data)) throw new Error("Database returned an invalid page.");
    if (rows.length + result.data.length > maxRows) {
      throw new Error("Export safety limit exceeded; no partial result was accepted.");
    }
    rows.push(...result.data);
    if (result.data.length < pageSize) return rows;
  }
}
