import { Client, Databases, Query } from 'node-appwrite';

export default async ({ req, res, log }) => {
  log("FIXED VERSION RUNNING");
  try {
    const key = process.env.MY_API_KEY;
    if (!key) return res.json({ success: false, error: "MY_API_KEY missing" });

    const client = new Client()
      .setEndpoint('https://fra.cloud.appwrite.io/v1')
      .setProject('6ae27aad00007b481204')
      .setKey(key);

    const db = new Databases(client);
    const body = req.bodyJson || {};
    const action = body.action || 'get_applications';
    log("Action: " + action);

    if (action === 'get_applications') {
      const result = await db.listDocuments(
        'illumilight-db',
        'membership_applications',
        [Query.limit(100), Query.orderDesc('$createdAt')]
      );
      log("Found " + result.total);
      return res.json({ success: true, applications: result.documents, total: result.total });
    }

    return res.json({ success: false, error: "unknown action" });
  } catch (e) {
    log("ERROR: " + e.message);
    return res.json({ success: false, error: e.message }, 500);
  }
};