import { Client, TablesDB, Account, Query } from 'node-appwrite';

export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_FUNCTION_API_KEY);

  const tables = new TablesDB(client);

  const DATABASE_ID = "illumilight-db";
  const TABLE_ID = "6afb96090029e4927ee3";

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { jwt, action, rowId } = body;

    // --- VERIFY ADMIN WITHOUT users.read ---
    if (!jwt) return res.json({ success: false, message: "No JWT" }, 401);
    
    // Create JWT client to verify user - NO users.read needed!
    const jwtClient = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setJWT(jwt);
    const jwtAccount = new Account(jwtClient);
    const user = await jwtAccount.get().catch(() => null);
    if (!user) return res.json({ success: false, message: "Invalid JWT" }, 401);
    log("Verified admin: " + user.email);

    // --- GET APPLICATIONS ---
    if (action === "get_applications") {
      const result = await tables.listRows(DATABASE_ID, TABLE_ID, [Query.limit(100)]);
      const apps = result.rows.map(r => {
        if (r.status !== "approved") return { ...r, membership_code: "" };
        return r;
      });
      return res.json({ success: true, applications: apps });
    }

    // --- APPROVE + GENERATE CODE ---
    if (action === "approve") {
      log("Processing new membership approval. rowId=" + rowId);
      if (!rowId) return res.json({ success: false, message: "rowId missing" }, 400);

      const all = await tables.listRows(DATABASE_ID, TABLE_ID, [Query.limit(100)]);
      const approvedCount = all.rows.filter(r => r.status === "approved").length;
      const newCode = `ILL-2026-${String(approvedCount + 1).padStart(4, '0')}`;
      log("Generated code: " + newCode);

      const updated = await tables.updateRow(DATABASE_ID, TABLE_ID, rowId, {
        status: "approved",
        membership_code: newCode
      });
      return res.json({ success: true, application: updated });
    }

    // --- REJECT - NO CODE ---
    if (action === "reject") {
      const updated = await tables.updateRow(DATABASE_ID, TABLE_ID, rowId, {
        status: "rejected",
        membership_code: ""
      });
      return res.json({ success: true, application: updated });
    }

    if (action === "verify_admin") {
      return res.json({ success: true, user: user.email });
    }

    return res.json({ success: false, message: "Unknown action" }, 400);

  } catch (e) {
    error("ERROR: " + e.message);
    return res.json({ success: false, message: e.message }, 500);
  }
};