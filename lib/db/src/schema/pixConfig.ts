import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const pixConfigTable = pgTable("pix_config", {
  userId: text("user_id").primaryKey(),
  pixKey: text("pix_key").notNull(),
  recipientName: text("recipient_name").notNull(),
  recipientCity: text("recipient_city").notNull().default("SAO PAULO"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type PixConfig = typeof pixConfigTable.$inferSelect;
export type InsertPixConfig = typeof pixConfigTable.$inferInsert;
