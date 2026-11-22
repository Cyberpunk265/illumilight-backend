import { Client, TablesDB, Account, Query } from 'node-appwrite';

export default async ({ req, res, log, error }) => {
  const API_KEY = process.env.APPWRITE_FUNCTION_API_KEY || process.env.APPWRITE_API_KEY;
  const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || "illumilight-db";
  const TABLE_ID = process.env.APPWRITE_TABLE_ID || "membership_applications";

  log("DB: " + DATABASE_ID + " Table: " + TABLE_ID);

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID)
    .setKey(API_KEY);

  const tables = new TablesDB(client);

  // ✅ RANDOM GENERATOR - SAME AS REGISTER PAGE, UNIQUE CHECK
  async function generateUniqueCode() {
    let code;
    let exists = true;
    let tries = 0;
    while (exists && tries < 30) {
      // Random 1000-9999 like register page: ILL-2026-5713
      code = `ILL-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const check = await tables.listRows(DATABASE_ID, TABLE_ID, [
        Query.equal("membership_code", code),
        Query.limit(1)
      ]);
      exists = check.total > 0;
      tries++;
      log(`Trying code ${code} exists=${exists}`);
    }
    return code;
  }

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
      // ✅ NEW: Generate RANDOM code after approval - not sequential!
      const newCode = await generateUniqueCode();
      log("Generated random code: " + newCode);
      
      const updated = await tables.updateRow(DATABASE_ID, TABLE_ID, rowId, {
        status: "approved",
        membership_code: newCode
      });

      // === BREVO EMAIL - SATANIC THEME ⛧ ===
      try {
        const memberEmail = updated.email;
        const memberName = updated.full_name || updated.name || "Member";
        log("Sending email to: " + memberEmail + " code: " + newCode);

        if (memberEmail && process.env.BREVO_API_KEY) {
          const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
              "accept": "application/json",
              "api-key": process.env.BREVO_API_KEY,
              "content-type": "application/json"
            },
            body: JSON.stringify({
              sender: { name: "IllumiLight ⛧", email: process.env.BREVO_SENDER_EMAIL },
              to: [{ email: memberEmail, name: memberName }],
              subject: "Welcome to IllumiLight ⛧ Your Code is Here",
              htmlContent: `<html><body style="margin:0;padding:0;background:#050000;font-family:Arial,sans-serif;">
                <div style="max-width:600px;margin:0 auto;background:#050000;color:#fff;">
                  <div style="background:#0d0000;border-bottom:2px solid #ff1a1a;padding:30px;text-align:center;">
                    <div style="font-size:32px;color:#ff1a1a;">⛧</div>
                    <div style="font-size:24px;letter-spacing:4px;font-weight:bold;">ILLUMI<span style="color:#ff1a1a;">LIGHT</span></div>
                    <div style="font-size:10px;letter-spacing:4px;color:#8a5555;">DODIS • DEPARTMENT OF DISTRIBUTION</div>
                  </div>
                  <div style="padding:32px 24px;text-align:center;">
                    <div style="font-size:12px;letter-spacing:3px;color:#ff1a1a;">WELCOME TO THE CIRCLE ⛧</div>
                    <h1 style="font-size:26px;color:#fff;">Welcome, ${memberName}</h1>
                    <p style="color:#aaa;font-size:14px;">Your membership has been sealed.<br>From the depths, relics arise.</p>
                    <div style="background:#140000;border:1px solid #ff1a1a;border-radius:16px;padding:22px;margin:20px 0;">
                      <div style="font-size:10px;letter-spacing:3px;color:#9a6a6a;">YOUR MEMBERSHIP CODE</div>
                      <div style="font-size:28px;font-weight:900;letter-spacing:2px;font-family:monospace;color:#fff;margin:8px 0;">${newCode}</div>
                      <div style="font-size:12px;color:#7ddb8a;">● ACTIVE • R650 TESTAMENT UNLOCKED</div>
                    </div>
                    <p style="color:#888;font-size:13px;">Use this code for DODIS R650 + Community Chatroom</p>
                    <a href="https://illumilight.co.za/dodis/dodis.html" style="display:inline-block;background:#ff1a1a;color:#fff;padding:14px 30px;border-radius:99px;text-decoration:none;font-weight:bold;">SHOP DODIS ⛧</a>
                    <p style="color:#555;font-size:11px;margin-top:24px;">AVE SATANAS • 666 • Keep this code secret</p>
                  </div>
                </div>
              </body></html>`
            })
          });
          log("Brevo status: " + brevoRes.status);
        } else {
          log("Skipped email - no email or no BREVO_API_KEY");
        }
      } catch (emailErr) {
        error("Email failed but approval succeeded: " + emailErr.message);
      }
      // === END BREVO ===

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