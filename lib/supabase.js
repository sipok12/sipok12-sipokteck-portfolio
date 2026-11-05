// Accès à Supabase Auth et Supabase Storage via leur API REST (aucune dépendance supplémentaire).
//  - SUPABASE_URL + SUPABASE_ANON_KEY (clé publique) : connexion des administrateurs.
//  - SUPABASE_SERVICE_ROLE_KEY : envoi d'images. Cette clé reste côté serveur (variables d'environnement Render) :
//    elle n'est jamais envoyée au navigateur ni écrite dans un fichier du dépôt.
const url = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "").trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const BUCKET = (process.env.SUPABASE_STORAGE_BUCKET || "portfolio").trim();

const authConfigured = Boolean(url && anonKey);
const storageConfigured = Boolean(url && serviceKey);

async function call(path, { method = "GET", key, token, body, headers, raw } = {}) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: key,
      // Les clés « sb_publishable_ / sb_secret_ » ne sont pas des JWT : elles passent uniquement par l'en-tête apikey.
      ...((token || String(key).startsWith("eyJ")) ? { Authorization: `Bearer ${token || key}` } : {}),
      ...(body && !raw ? { "Content-Type": "application/json" } : {}),
      ...headers
    },
    body: body ? (raw ? body : JSON.stringify(body)) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  return { ok: response.ok, status: response.status, data };
}

// --- Supabase Auth ---
// Retourne { user, accessToken } ou null si les identifiants sont refusés. Lève une erreur si Supabase est injoignable.
async function signIn(email, password) {
  const r = await call("/auth/v1/token?grant_type=password", { method: "POST", key: anonKey, body: { email, password } });
  if (r.ok && r.data.user && r.data.access_token) return { user: r.data.user, accessToken: r.data.access_token };
  if (r.status >= 400 && r.status < 500) return null;
  throw new Error(`Supabase Auth indisponible (${r.status})`);
}

async function getUser(accessToken) {
  const r = await call("/auth/v1/user", { key: anonKey, token: accessToken });
  return r.ok && r.data && r.data.email ? r.data : null;
}

async function updatePassword(accessToken, password) {
  const r = await call("/auth/v1/user", { method: "PUT", key: anonKey, token: accessToken, body: { password } });
  if (!r.ok) {
    const message = r.data && (r.data.msg || r.data.message || r.data.error_description);
    const error = new Error(message || "Mot de passe refusé.");
    error.status = r.status;
    throw error;
  }
}

// Envoie l'email de récupération (lien à usage unique géré par Supabase).
async function sendRecovery(email, redirectTo) {
  await call(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, { method: "POST", key: anonKey, body: { email } });
}

// --- Supabase Storage ---
let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  const existing = await call(`/storage/v1/bucket/${BUCKET}`, { key: serviceKey });
  if (!existing.ok) {
    const created = await call("/storage/v1/bucket", {
      method: "POST", key: serviceKey,
      body: {
        id: BUCKET, name: BUCKET, public: true, file_size_limit: 5 * 1024 * 1024,
        allowed_mime_types: ["image/jpeg", "image/png", "image/webp"]
      }
    });
    if (!created.ok && created.status !== 409) throw new Error(`Création du bucket impossible (${created.status})`);
  }
  bucketReady = true;
}

function publicUrl(objectPath) {
  return `${url}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

// Chemin d'un objet à partir de son URL publique (null si l'URL n'appartient pas à notre bucket).
function objectPathFromUrl(value) {
  const prefix = `${url}/storage/v1/object/public/${BUCKET}/`;
  if (!url || typeof value !== "string" || !value.startsWith(prefix)) return null;
  const objectPath = value.slice(prefix.length);
  return /^[a-z0-9/_-]+\.(jpg|png|webp)$/.test(objectPath) && !objectPath.includes("..") ? objectPath : null;
}

async function uploadImage(objectPath, buffer, contentType) {
  await ensureBucket();
  const r = await call(`/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: "POST", key: serviceKey, body: buffer, raw: true,
    headers: { "Content-Type": contentType, "Cache-Control": "max-age=31536000" }
  });
  if (!r.ok) throw new Error(`Envoi vers Supabase Storage refusé (${r.status})`);
  return publicUrl(objectPath);
}

async function deleteImages(urls) {
  if (!storageConfigured) return;
  const paths = [...new Set(urls.map(objectPathFromUrl).filter(Boolean))];
  if (!paths.length) return;
  await call(`/storage/v1/object/${BUCKET}`, { method: "DELETE", key: serviceKey, body: { prefixes: paths } });
}

module.exports = {
  authConfigured, storageConfigured, BUCKET,
  signIn, getUser, updatePassword, sendRecovery,
  uploadImage, deleteImages, objectPathFromUrl
};
