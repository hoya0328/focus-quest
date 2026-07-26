import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const userCloudStates = sqliteTable("user_cloud_states", {
  userId: text("user_id").primaryKey(),
  version: integer("version").notNull().default(1),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
});
