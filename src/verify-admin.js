import { Client, Account, TablesDB, Query } from "node-appwrite";

export default async ({ req, res, log, error }) => {
  try {
    const payload = req.bodyJson ?? JSON.parse(req.bodyText || "{}");
    const jwt = payload.jwt;
    const action = payload.action || "verify_admin";

    if (!jwt) {
      return res.json(
        { success: false, message: "Authentication required." },
        401
      );
    }

    // Verify the requester's identity using their Appwrite session JWT.
    const authClient = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setJWT(jwt);

    const account = new Account(authClient);
    const user = await account.get();

    // Only the designated administrator may perform these actions.
    if (
      !process.env.ADMIN_USER_ID ||
      user.$id !== process.env.ADMIN_USER_ID
    ) {
      return res.json(
        { success: false, message: "Administrator access denied." },
        403
      );
    }

    // Existing login verification remains supported.
    if (action === "verify_admin") {
      return res.json({
        success: true,
        message: "Administrator verified."
      });
    }

    // Retrieve applications only for an authenticated administrator.
    if (action === "get_applications") {
      const databaseId = process.env.APPWRITE_DATABASE_ID;
      const tableId = process.env.APPWRITE_TABLE_ID;

      if (!databaseId || !tableId) {
        error("Missing APPWRITE_DATABASE_ID or APPWRITE_TABLE_ID.");
        return res.json(
          { success: false, message: "Database configuration is incomplete." },
          500
        );
      }

      // Use a separate client with the server API key.
      // Never expose this API key in browser code.
      const serverKey = process.env.APPWRITE_API_KEY;

      if (!serverKey) {
        error("APPWRITE_API_KEY environment variable is missing.");
        return res.json(
          { success: false, message: "Server configuration is incomplete." },
          500
        );
      }

      const databaseClient = new Client()
        .setEndpoint(process.env.APPWRITE_ENDPOINT)
        .setProject(process.env.APPWRITE_PROJECT_ID)
        .setKey(serverKey);

      const tablesDB = new TablesDB(databaseClient);

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
        message: "Applications retrieved.",
        applications: result.rows
      });
    }

    return res.json(
      { success: false, message: "Unknown administrator action." },
      400
    );

  } catch (err) {
    error(err.message);
    log("Administrator function request failed.");

    return res.json(
      { success: false, message: "The request could not be completed." },
      500
    );
  }
};