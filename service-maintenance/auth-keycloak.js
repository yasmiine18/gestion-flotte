const { createRemoteJWKSet, jwtVerify } = require("jose");

const KEYCLOAK_URL = process.env.KEYCLOAK_ISSUER || "http://keycloak:8080/realms/sgfv";
const CLIENT_ID    = process.env.KEYCLOAK_CLIENT_ID || "sgfv-frontend";

const JWKS = createRemoteJWKSet(
  new URL(`${KEYCLOAK_URL}/protocol/openid-connect/certs`)
);

async function verifierToken(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token manquant" });
    }
    const token = auth.split(" ")[1];
    // On vérifie uniquement la signature (clé publique JWKS)
    // sans imposer l'issuer car il peut varier selon le contexte
    // (localhost en dev, keycloak en Docker interne)
    const { payload } = await jwtVerify(token, JWKS, {
      algorithms: ["RS256"],
    });
    req.user = payload;
    next();
  } catch (err) {
    console.error("[auth] Token invalide:", err.message);
    return res.status(403).json({ error: "Token Keycloak invalide" });
  }
}

function verifierRole(...rolesAutorises) {
  return (req, res, next) => {
    const roles = req.user?.realm_access?.roles || [];
    const autorise = rolesAutorises.some((r) => roles.includes(r));
    if (!autorise) {
      return res.status(403).json({ error: "Accès refusé : rôle insuffisant" });
    }
    next();
  };
}

module.exports = { verifierToken, verifierRole };
