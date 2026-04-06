import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const pixConfigTable = pgTable("pix_config", {
  guildId: text("guild_id").primaryKey(),
  pixKey: text("pix_key").notNull(),
  recipientName: text("recipient_name").notNull(),
  recipientCity: text("recipient_city").notNull().default("SAO PAULO"),
  configuredBy: text("configured_by").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type PixConfig = typeof pixConfigTable.$inferSelect;
export type InsertPixConfig = typeof pixConfigTable.$inferInsert;
