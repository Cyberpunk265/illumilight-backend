import { Client, TablesDB, Account, Query } from 'node-appwrite';

export default async ({ req, res, log, error }) => {
  // Use AUTOMATIC function key, not manual APPWRITE_API_KEY
  const API_KEY = process.env.APPWRITE_FUNCTION_API_KEY || process.env.APPWRITE_API_KEY;
  const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || "illumilight-db";
  const TABLE_ID = process.env.APPWRITE_TABLE_ID || "membership_applications";

  log("DB: " + DATABASE_ID + " Table: " + TABLE_ID);

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID)
    .setKey(API_KEY);

  const tables = new TablesDB(client);

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { jwt, action, rowId } = body;

    if (!jwt) return res.json({ success: false, message: "No JWT" }, 401);
    
    const jwtClient = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID)
      .setJWT(jwt);
    const user = await new Account(jwtClient).get().catch(() => null);
    if (!user) return res.json({ success: false, message: "Invalid JWT" }, 401);

    if (action === "get_applications") {
      const result = await tables.listRows(DATABASE_ID, TABLE_ID, [Query.limit(100)]);
      const apps = result.rows.map(r => {
        if (r.status !== "approved") return { ...r, membership_code: "" };
        return r;
      });
      return res.json({ success: true, applications: apps });
    }

    if (action === "approve") {
      const all = await tables.listRows(DATABASE_ID, TABLE_ID, [Query.limit(100)]);
      const approvedCount = all.rows.filter(r => r.status === "approved").length;
      const newCode = `ILL-2026-${String(approvedCount + 1).padStart(4, '0')}`;
      const updated = await tables.updateRow(DATABASE_ID, TABLE_ID, rowId, {
        status: "approved",
        membership_code: newCode
      });
      return res.json({ success: true, application: updated });
    }

    if (action === "reject") {
      const updated = await tables.updateRow(DATABASE_ID, TABLE_ID, rowId, {
        status: "rejected",
        membership_code: ""
      });
      return res.json({ success: true, application: updated });
    }

    if (action === "verify_admin") return res.json({ success: true });
    return res.json({ success: false, message: "Unknown action" }, 400);

  } catch (e) {
    error("FULL ERROR: " + e.message);
    return res.json({ success: false, message: e.message }, 500);
  }
};