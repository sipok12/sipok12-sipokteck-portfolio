// Validation côté serveur : toutes les données reçues passent par ici avant d'atteindre la base.

function cleanString(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function validPhone(phone) {
  return /^[0-9+()\s.-]{6,25}$/.test(phone);
}

function isValidExternalUrl(value) {
  if (!value) return true;
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol);
  } catch {
    return false;
  }
}

/**
 * Lit et valide les champs d'un corps de requête selon un schéma.
 * Seuls les champs déclarés sont retenus (liste blanche) : rien d'autre n'atteint la base.
 * Types : string, text, email, url, int, bool, enum.
 * Retourne { data } ou { error }.
 */
function readFields(body, fields) {
  const source = body && typeof body === "object" ? body : {};
  const data = {};
  for (const f of fields) {
    const raw = source[f.name];
    const label = f.label || f.name;

    if (f.type === "bool") {
      data[f.name] = raw === true || raw === "true";
      continue;
    }

    if (f.type === "int") {
      if (raw === undefined || raw === null || raw === "") {
        if (f.required) return { error: `${label} est requis.` };
        data[f.name] = f.default !== undefined ? f.default : null;
        continue;
      }
      const n = Number(raw);
      const min = f.min ?? 0;
      const max = f.max ?? 1000000000;
      if (!Number.isInteger(n) || n < min || n > max) {
        return { error: `${label} doit être un nombre entier entre ${min} et ${max}.` };
      }
      data[f.name] = n;
      continue;
    }

    if (f.type === "enum") {
      const v = cleanString(raw, 80);
      if (!f.options.includes(v)) return { error: `${label} invalide.` };
      data[f.name] = v;
      continue;
    }

    const max = f.max || 200;
    let value = cleanString(raw, max);
    if (!value && f.default !== undefined) value = f.default;
    const min = f.min ?? (f.required ? 1 : 0);

    if (!value) {
      if (f.required) return { error: `${label} est requis.` };
      data[f.name] = f.type === "url" && f.nullable ? null : "";
      continue;
    }
    if (value.length < min) return { error: `${label} : ${min} caractères minimum.` };
    if (f.type === "email") {
      value = value.toLowerCase();
      if (!validEmail(value)) return { error: `${label} invalide.` };
    }
    if (f.type === "url" && !isValidExternalUrl(value)) {
      return { error: `${label} doit être une URL HTTP ou HTTPS valide.` };
    }
    if (f.pattern && !f.pattern.test(value)) {
      return { error: f.patternMessage || `${label} invalide.` };
    }
    data[f.name] = value;
  }
  return { data };
}

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { cleanString, validEmail, validPhone, isValidExternalUrl, readFields, asyncRoute };
