  args: { action: v.string() },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    await ctx.db.insert("adminSessions", {
      adminId,
      action: args.action,
      createdAt: Date.now(),
    });
    if (args.action === "ADMIN_LOGOUT") {
      await auditLog(ctx, adminId, { action: "ADMIN_LOGOUT", resource: "session" });
    }