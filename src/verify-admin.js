
import { Client, Account } from "node-appwrite";

export default async ({ req, res, log, error }) => {
  try {
    const payload = JSON.parse(req.bodyText || "{}");
    const jwt = payload.jwt;

    if (!jwt) {
      return res.json(
        { success: false, message: "Authentication required." },
        401
      );
    }

    const client = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setJWT(jwt);

    const account = new Account(client);
    const user = await account.get();

    if (user.$id !== process.env.ADMIN_USER_ID) {
      return res.json(
        { success: false, message: "Administrator access denied." },
        403
      );
    }

    return res.json({
      success: true,
      message: "Administrator verified."
    });

  } catch (err) {
    error(err.message);

    return res.json(
      { success: false, message: "Verification failed." },
      401
    );
  }
};
