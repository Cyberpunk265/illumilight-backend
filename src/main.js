import { Client, TablesDB, Account } from 'node-appwrite';

export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_FUNCTION_API_KEY);

  const tables = new TablesDB(client);
  const account = new Account(client);

  const DATABASE_ID = "illumilight-db";
  const TABLE_ID = "6afb96090029e4927ee3"; // your membership_applications table

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { jwt, action, rowId } = body;

    // --- VERIFY ADMIN (keep your existing logic) ---
    if (!jwt) return res.json({ success: false, message: "No JWT" }, 401);
    const user = await account.get({ 'x-appwrite-jwt': jwt }).catch(() => null);
    // If you check labels/role, keep it here:
    // if (!user || !user.labels?.includes('admin')) return res.json({success:false, message:"Not admin"}, 403);

    // --- GET APPLICATIONS ---
    if (action === "get_applications") {
      const result = await tables.listRows(DATABASE_ID, TABLE_ID, []);
      // Hide code if not approved
      const apps = result.rows.map(r => {
        if (r.status !== "approved") return { ...r, membership_code: "" };
        return r;
      });
      return res.json({ success: true, applications: apps });
    }

    // --- APPROVE + GENERATE CODE ---
    if (action === "approve") {
      const all = await tables.listRows(DATABASE_ID, TABLE_ID, []);
      const approvedCount = all.rows.filter(r => r.status === "approved").length;
      const nextNum = approvedCount + 1;
      const newCode = `ILL-2026-${String(nextNum).padStart(4, '0')}`;

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
      return res.json({ success: true });
    }

    return res.json({ success: false, message: "Unknown action" }, 400);

  } catch (e) {
    error("ERROR: " + e.message);
    return res.json({ success: false, message: e.message }, 500);
  }
};