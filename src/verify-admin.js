
import {
  Client,
  Account,
  TablesDB,
  Users,
  Query,
  ID
} from "node-appwrite";

import { randomBytes } from "node:crypto";

const jsonError = (res, message, status = 400) =>
  res.json({ success: false, message }, status);

const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);

async function sendMembershipEmail({
  email,
  name,
  membershipCode,
  password
}) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;

  if (!apiKey || !senderEmail) {
    throw new Error("Brevo configuration is incomplete.");
  }

  const response = await fetch(
    "https://api.brevo.com/v3/smtp/email",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sender: {
          name: "Illumilight",
          email: senderEmail
        },
        to: [{ email, name }],
        subject: "Your Illumilight Membership Is Approved",
        htmlContent: `
          <div style="font-family:Arial,sans-serif;color:#222;max-width:600px;margin:auto">
            <h2 style="color:#b38a3c">Welcome to Illumilight!</h2>

            <p>Hello ${escapeHtml(name)},</p>

            <p>Your membership application has been approved.</p>

            <p>
              <strong>Membership ID:</strong>
              ${escapeHtml(membershipCode)}
            </p>

            <p>
              <strong>Login email:</strong>
              ${escapeHtml(email)}
            </p>

            <p><strong>Your generated password:</strong></p>

            <div style="padding:15px;background:#f3f0e8;font-size:20px;word-break:break-all">
              ${escapeHtml(password)}
            </div>

            <p>
              Use your email and password to access your Illumilight member account.
            </p>

            <p>Please change your password after your first login.</p>

            <p>
              Welcome aboard!<br>
              Illumilight Team
            </p>
          </div>
        `
      })
    }
  );

  if (!response.ok) {
    const details = await response.text();

    throw new Error(
      `Brevo email failed (${response.status}): ${details}`
    );
  }

  return true;
}

// Find an existing Appwrite account by email.
// This prevents duplicate accounts during approval.
async function findUserByEmail(users, email) {
  const result = await users.list({
    queries: [
      Query.equal("email", [email]),
      Query.limit(5)
    ]
  });

  return result.users.find(
    user => String(user.email || "").toLowerCase() === email
  ) || null;
}

// Safely retrieve an existing Appwrite account.
async function findUserById(users, userId) {
  if (!userId) return null;

  try {
    return await users.get({ userId });
  } catch {
    return null;
  }
}

// Generate a membership code, preserving existing codes.
async function generateMembershipCode(
  tablesDB,
  databaseId,
  tableId
) {
  const year = new Date().getFullYear();

  const existing = await tablesDB.listRows({
    databaseId,
    tableId,
    queries: [Query.limit(500)]
  });

  let highestNumber = 0;

  const pattern = new RegExp(`^ILL-${year}-(\\d{4})$`);

  for (const row of existing.rows) {
    const match = String(row.membership_code || "")
      .match(pattern);

    if (match) {
      highestNumber = Math.max(
        highestNumber,
        Number(match[1])
      );
    }
  }

  return `ILL-${year}-${String(highestNumber + 1).padStart(4, "0")}`;
}

export default async ({ req, res, log, error }) => {
  let newlyCreatedUserId = null;

  try {
    const payload =
      req.bodyJson ??
      JSON.parse(req.bodyText || "{}");

    const action = String(payload.action || "verify_admin")
      .trim()
      .toLowerCase();

    const jwt = payload.jwt;

    if (!jwt) {
      return jsonError(
        res,
        "Authentication required.",
        401
      );
    }

    // --------------------------------------------------
    // VERIFY ADMINISTRATOR
    // --------------------------------------------------

    const authClient = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setJWT(jwt);

    const account = new Account(authClient);
    const admin = await account.get();

    if (
      !process.env.ADMIN_USER_ID ||
      admin.$id !== process.env.ADMIN_USER_ID
    ) {
      return jsonError(
        res,
        "Administrator access denied.",
        403
      );
    }

    if (action === "verify_admin") {
      return res.json({
        success: true,
        message: "Administrator verified."
      });
    }

    // --------------------------------------------------
    // SERVER CONFIGURATION
    // --------------------------------------------------

    const endpoint = process.env.APPWRITE_ENDPOINT;
    const projectId = process.env.APPWRITE_PROJECT_ID;
    const databaseId = process.env.APPWRITE_DATABASE_ID;
    const tableId = process.env.APPWRITE_TABLE_ID;
    const serverKey = process.env.APPWRITE_API_KEY;

    if (
      !endpoint ||
      !projectId ||
      !databaseId ||
      !tableId ||
      !serverKey
    ) {
      error("Appwrite configuration is incomplete.");

      return jsonError(
        res,
        "Server configuration is incomplete.",
        500
      );
    }

    const serverClient = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setKey(serverKey);

    const tablesDB = new TablesDB(serverClient);
    const users = new Users(serverClient);

    // --------------------------------------------------
    // GET APPLICATIONS
    // --------------------------------------------------

    if (action === "get_applications") {
      const result = await tablesDB.listRows({
        databaseId,
        tableId,
        queries: [
          Query.orderDesc("$createdAt"),
          Query.limit(100)
        ]
      });

      return res.json({
        success: true,
        applications: result.rows
      });
    }

    // --------------------------------------------------
    // APPROVE, REJECT OR RESEND CREDENTIALS
    // --------------------------------------------------

    if (
      !["approve", "reject", "resend_credentials"].includes(action)
    ) {
      return jsonError(
        res,
        `Unknown administrator action: ${action}`
      );
    }

    const rowId = payload.rowId;

    if (!rowId || typeof rowId !== "string") {
      return jsonError(
        res,
        "A valid application ID is required."
      );
    }

    const application = await tablesDB.getRow({
      databaseId,
      tableId,
      rowId
    });

    const status = String(application.status || "")
      .trim()
      .toLowerCase();

    const email = String(application.email || "")
      .trim()
      .toLowerCase();

    const name = String(application.full_name || "").trim();

    if (!email || !name) {
      return jsonError(
        res,
        "The application is missing an email or name."
      );
    }

    // --------------------------------------------------
    // REJECT APPLICATION
    // --------------------------------------------------

    if (action === "reject") {
      if (status !== "pending") {
        return jsonError(
          res,
          "Only pending applications can be rejected.",
          409
        );
      }

      const updated = await tablesDB.updateRow({
        databaseId,
        tableId,
        rowId,
        data: {
          status: "rejected"
        }
      });

      return res.json({
        success: true,
        message: "Application rejected.",
        application: updated
      });
    }

    // --------------------------------------------------
    // CHECK EMAIL CONFIGURATION
    // --------------------------------------------------

    if (
      !process.env.BREVO_API_KEY ||
      !process.env.BREVO_SENDER_EMAIL
    ) {
      return jsonError(
        res,
        "Brevo configuration is incomplete.",
        500
      );
    }

    // --------------------------------------------------
    // RESEND CREDENTIALS
    // --------------------------------------------------

    if (action === "resend_credentials") {
      if (status !== "approved") {
        return jsonError(
          res,
          "Only approved members can receive credentials.",
          409
        );
      }

      // First try the saved Appwrite user ID.
      let member = await findUserById(
        users,
        String(application.user_id || "").trim()
      );

      // Recover accounts that were created previously
      // but were never linked to the application.
      if (
        !member ||
        String(member.email || "").toLowerCase() !== email
      ) {
        member = await findUserByEmail(users, email);
      }

      if (!member) {
        return jsonError(
          res,
          "No existing Appwrite account was found for this member. Contact the administrator.",
          404
        );
      }

      const membershipCode = String(
        application.membership_code || ""
      ).trim();

      if (!membershipCode) {
        return jsonError(
          res,
          "The member's membership code is missing."
        );
      }

      const newPassword = randomBytes(24).toString("base64url");

      await users.updatePassword({
        userId: member.$id,
        password: newPassword
      });

      // Repair missing user_id while resending.
      const updated = await tablesDB.updateRow({
        databaseId,
        tableId,
        rowId,
        data: {
          user_id: member.$id,
          must_change_password: true
        }
      });

      await sendMembershipEmail({
        email,
        name,
        membershipCode,
        password: newPassword
      });

      return res.json({
        success: true,
        message: "Membership credentials resent successfully.",
        application: updated
      });
    }

    // --------------------------------------------------
    // APPROVE APPLICATION
    // --------------------------------------------------

    // Normal approval: pending.
    // Recovery approval: already approved but user_id missing.
    const recoveringApproval =
      status === "approved" &&
      !String(application.user_id || "").trim();

    if (status !== "pending" && !recoveringApproval) {
      return jsonError(
        res,
        "This application has already been processed. Use Resend Credentials if necessary.",
        409
      );
    }

    log(
      recoveringApproval
        ? "Recovering previously approved application."
        : "Processing new membership approval."
    );

    // --------------------------------------------------
    // FIND EXISTING ACCOUNT BEFORE CREATING ANYTHING
    // --------------------------------------------------

    let member = null;

    const savedUserId = String(
      application.user_id || ""
    ).trim();

    if (savedUserId) {
      member = await findUserById(users, savedUserId);

      if (
        member &&
        String(member.email || "").toLowerCase() !== email
      ) {
        member = null;
      }
    }

    if (!member) {
      member = await findUserByEmail(users, email);
    }

    // Generate a new password for the member.
    const password = randomBytes(24).toString("base64url");

    // --------------------------------------------------
    // REUSE EXISTING USER OR CREATE A NEW ONE
    // --------------------------------------------------

    if (member) {
      log("Existing Appwrite account found. Reusing account.");

      // IMPORTANT:
      // Do not create another Appwrite user.
      await users.updatePassword({
        userId: member.$id,
        password
      });

    } else {
      log("No existing Appwrite account found. Creating account.");

      const newUser = await users.create({
        userId: ID.unique(),
        email,
        password,
        name
      });

      member = newUser;
      newlyCreatedUserId = newUser.$id;
    }

    // --------------------------------------------------
    // PRESERVE OR GENERATE MEMBERSHIP CODE
    // --------------------------------------------------

    let membershipCode = String(
      application.membership_code || ""
    ).trim();

    if (!membershipCode || membershipCode === "Optional") {
      membershipCode = await generateMembershipCode(
        tablesDB,
        databaseId,
        tableId
      );
    }

    // --------------------------------------------------
    // SAVE APPROVAL AND LINK AUTH ACCOUNT
    // --------------------------------------------------

    let updated;

    try {
      updated = await tablesDB.updateRow({
        databaseId,
        tableId,
        rowId,
        data: {
          status: "approved",
          membership_code: membershipCode,
          user_id: member.$id,
          must_change_password: true
        }
      });

      // Database link succeeded.
      // Never delete the account after this point.
      newlyCreatedUserId = null;

    } catch (databaseError) {
      throw databaseError;
    }

    log("Application approved and Appwrite user linked.");

    // --------------------------------------------------
    // SEND MEMBERSHIP EMAIL
    // --------------------------------------------------

    try {
      await sendMembershipEmail({
        email,
        name,
        membershipCode,
        password
      });

      log("Membership credentials emailed successfully.");

      return res.json({
        success: true,
        email_sent: true,
        message: "Application approved and login credentials emailed.",
        application: updated
      });

    } catch (emailError) {
      // The application is already approved and linked.
      // Do not report the database approval as failed.
      error("Membership email delivery failed: " + String(
        emailError.message || emailError
      ));

      return res.json({
        success: true,
        email_sent: false,
        message: "Application approved and account linked, but email delivery failed. Use Resend Credentials.",
        application: updated
      });
    }

  } catch (err) {
    error(
      "Administrator function error: " +
      String(err.stack || err.message || err)
    );

    // Only delete a newly created account if linking it
    // to the database failed.
    if (newlyCreatedUserId) {
      try {
        const cleanupClient = new Client()
          .setEndpoint(process.env.APPWRITE_ENDPOINT)
          .setProject(process.env.APPWRITE_PROJECT_ID)
          .setKey(process.env.APPWRITE_API_KEY);

        const cleanupUsers = new Users(cleanupClient);

        await cleanupUsers.delete({
          userId: newlyCreatedUserId
        });

        log("Unlinked newly created account cleaned up.");

      } catch (cleanupError) {
        error(
          "Account cleanup failed: " +
          String(cleanupError.message || cleanupError)
        );
      }
    }

    return res.json({
      success: false,
      message: "The request failed. Check the function logs before retrying."
    }, 500);
  }
};
