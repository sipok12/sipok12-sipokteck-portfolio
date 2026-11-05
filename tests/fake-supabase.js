// Faux serveur Supabase (Auth + Storage) pour les tests : aucun appel vers le vrai projet Supabase.
// Usage : FAKE_PORT=54399 node tests/fake-supabase.js
// Puis lancer le site avec SUPABASE_URL=http://127.0.0.1:54399, SUPABASE_ANON_KEY=test-anon, SUPABASE_SERVICE_ROLE_KEY=test-service.
const http = require("http");

const users = new Map([["admin@test.local", "SupaPass-2026-test"], ["autre-app@test.local", "AutreAppPass-2026"]]);
const files = new Map();
const state = { recoveries: [], uploads: [], deleted: [], buckets: [], missingApikey: 0 };

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const url = new URL(req.url, "http://fake");
    const path = url.pathname;
    const json = () => { try { return JSON.parse(body.toString() || "{}"); } catch { return {}; } };
    const bearer = (req.headers.authorization || "").replace(/^Bearer /, "");

    if (path === "/__state") return send(res, 200, state);
    // Lecture publique d'une image envoyée (comme un bucket public Supabase) : sans clé API.
    if (req.method === "GET" && path.startsWith("/storage/v1/object/public/")) {
      const file = files.get(path.replace("/storage/v1/object/public/", ""));
      if (!file) return send(res, 404, { message: "Object not found" });
      res.writeHead(200, { "Content-Type": file.type });
      return res.end(file.body);
    }
    if (!req.headers.apikey) { state.missingApikey++; return send(res, 401, { message: "No API key found" }); }

    if (path === "/auth/v1/token" && req.method === "POST") {
      const { email, password } = json();
      if (users.get(email) === password) return send(res, 200, { access_token: `tok_${email}`, user: { email } });
      return send(res, 400, { error: "invalid_grant" });
    }
    if (path === "/auth/v1/user") {
      const email = bearer.startsWith("tok_") ? bearer.slice(4) : "";
      if (!users.has(email)) return send(res, 401, { message: "invalid JWT" });
      if (req.method === "PUT") {
        const { password } = json();
        if (!password || password.length < 12) return send(res, 422, { msg: "Password should be at least 12 characters." });
        users.set(email, password);
      }
      return send(res, 200, { email });
    }
    if (path === "/auth/v1/recover" && req.method === "POST") {
      state.recoveries.push({ email: json().email, redirectTo: url.searchParams.get("redirect_to") });
      return send(res, 200, {});
    }
    if (path.startsWith("/storage/v1/bucket")) {
      const id = path.split("/")[4];
      if (req.method === "GET") return state.buckets.includes(id) ? send(res, 200, { id }) : send(res, 404, { message: "Bucket not found" });
      if (req.method === "POST") { state.buckets.push(json().id); return send(res, 200, { name: json().id }); }
    }
    if (path.startsWith("/storage/v1/object/") && req.method === "POST") {
      const objectPath = path.replace("/storage/v1/object/", "");
      files.set(objectPath, { body, type: req.headers["content-type"] });
      state.uploads.push({ path: objectPath, bytes: body.length, type: req.headers["content-type"] });
      return send(res, 200, { Key: path });
    }
    if (path.startsWith("/storage/v1/object/") && req.method === "DELETE") {
      state.deleted.push(...(json().prefixes || []));
      return send(res, 200, []);
    }
    send(res, 404, { message: "not found" });
  });
}).listen(Number(process.env.FAKE_PORT || 54399), "127.0.0.1", () => console.log("Faux Supabase prêt"));
