import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const guildConfigTable = pgTable("guild_config", {
  guildId: text("guild_id").primaryKey(),
  allowedRoleId: text("allowed_role_id").notNull(),
  configuredBy: text("configured_by").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type GuildConfig = typeof guildConfigTable.$inferSelect;
export type InsertGuildConfig = typeof guildConfigTable.$inferInsert;
