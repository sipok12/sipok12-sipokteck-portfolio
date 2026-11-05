// Historique des actions de l'administration. Un échec d'écriture du journal ne bloque jamais l'action elle-même.
const { query } = require("../db");

async function logActivity(req, action, entity, entityId, summary) {
  try {
    const actor = (req && req.session && req.session.adminEmail) || "";
    await query(
      "INSERT INTO activity_log (admin_email, action, entity, entity_id, summary) VALUES ($1,$2,$3,$4,$5)",
      [actor.slice(0, 254), action, entity, entityId || null, String(summary || "").slice(0, 300)]
    );
  } catch (error) {
    console.error("Journal d'activité :", error.message);
  }
}

module.exports = { logActivity };
