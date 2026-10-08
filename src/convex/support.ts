import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const priority = v.union(v.literal("low"), v.literal("normal"), v.literal("high"), v.literal("urgent"));
const categories = ["General", "Payments", "Orders", "VTU", "Marketplace", "Shipments", "Documents", "Account"] as const;

async function requireUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("UNAUTHORIZED");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("USER_NOT_FOUND");
  return { userId, user };
}

function clean(value: string, max: number) {
  return value.trim().slice(0, max);
}

export const listMine = query({
  args: { limit: v.optional(v.number()), status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const rows = await ctx.db.query("supportTickets").withIndex("by_user", q => q.eq("userId", userId)).order("desc").take(Math.min(args.limit ?? 50, 100));
    return args.status ? rows.filter(t => t.status === args.status) : rows;
  },
});

export const get = query({
  args: { ticketId: v.id("supportTickets") },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket || ticket.userId !== userId) return null;
    const messages = await ctx.db.query("supportMessages").withIndex("by_ticket", q => q.eq("ticketId", args.ticketId)).order("asc").collect();
    return { ticket, messages };
  },
});

export const create = mutation({
  args: { subject: v.string(), category: v.string(), priority, message: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const subject = clean(args.subject, 120);
    const body = clean(args.message, 3000);
    if (!subject) throw new Error("SUBJECT_REQUIRED");
    if (!body) throw new Error("MESSAGE_REQUIRED");
    if (!categories.includes(args.category as typeof categories[number])) throw new Error("INVALID_CATEGORY");
    const now = Date.now();
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    const ticketNumber = `CLD-${new Date(now).toISOString().slice(0,10).replaceAll("-","")}-${suffix}`;
    const ticketId = await ctx.db.insert("supportTickets", {
      userId, ticketNumber, subject, category: args.category, priority: args.priority,
      status: "open", lastMessageAt: now, lastMessageBy: "customer", unreadForCustomer: 0,
      createdAt: now, updatedAt: now,
    });
    await ctx.db.insert("supportMessages", {
      ticketId, senderId: userId, senderRole: "customer", body, createdAt: now, readByCustomer: true,
    });
    await ctx.db.insert("notifications", {
      userId, title: "Support ticket created", message: `${ticketNumber} is now open`, type: "support_ticket_created",
      isRead: false, link: "/support", metadata: { ticketId }, createdAt: now,
    });
    return ticketId;
  },
});

export const reply = mutation({
  args: { ticketId: v.id("supportTickets"), message: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket || ticket.userId !== userId) throw new Error("TICKET_NOT_FOUND");
    if (ticket.status === "closed") throw new Error("TICKET_CLOSED");
    const body = clean(args.message, 3000);
    if (!body) throw new Error("MESSAGE_REQUIRED");
    const now = Date.now();
    await ctx.db.insert("supportMessages", { ticketId: args.ticketId, senderId: userId, senderRole: "customer", body, createdAt: now, readByCustomer: true });
    await ctx.db.patch(args.ticketId, { status: "open", lastMessageAt: now, lastMessageBy: "customer", updatedAt: now });
  },
});

export const close = mutation({
  args: { ticketId: v.id("supportTickets") },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket || ticket.userId !== userId) throw new Error("TICKET_NOT_FOUND");
    const now = Date.now();
    await ctx.db.patch(args.ticketId, { status: "closed", updatedAt: now, resolvedAt: now });
  },
});

export const markRead = mutation({
  args: { ticketId: v.id("supportTickets") },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket || ticket.userId !== userId) throw new Error("TICKET_NOT_FOUND");
    const messages = await ctx.db.query("supportMessages").withIndex("by_ticket", q => q.eq("ticketId", args.ticketId)).collect();
    for (const message of messages) {
      if (!message.readByCustomer && message.senderRole !== "customer") await ctx.db.patch(message._id, { readByCustomer: true });
    }
    await ctx.db.patch(args.ticketId, { unreadForCustomer: 0 });
  },
});
