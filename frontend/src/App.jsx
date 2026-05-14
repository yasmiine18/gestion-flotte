import { useEffect, useState } from "react";
import VehiculesPage from "./pages/VehiculesPage";
import ConducteursPage from "./pages/ConducteursPage";
import MaintenancePage from "./pages/MaintenancePage";
import EvenementsPage from "./pages/EvenementsPage";
import LocalisationPage from "./pages/LocalisationPage";
import "./App.css";

const PAGES = [
  { id: "vehicules", label: "Véhicules", icon: "🚗" },
  { id: "conducteurs", label: "Conducteurs", icon: "👤" },
  { id: "maintenance", label: "Maintenance", icon: "🔧" },
  { id: "localisation", label: "Localisation GPS", icon: "📍" },
  { id: "evenements", label: "Événements", icon: "🔔" },
];

const PAGE_ACCESS = {
  vehicules: ["admin", "gestionnaire", "technicien", "utilisateur"],
  conducteurs: ["admin", "gestionnaire"],
  maintenance: ["admin", "gestionnaire", "technicien"],
  localisation: ["admin", "gestionnaire", "technicien", "utilisateur"],
  evenements: ["admin", "gestionnaire", "technicien"],
};

const ROLE_COLORS = {
  admin: "#fc8181",
  gestionnaire: "#63b3ed",
  technicien: "#f6ad55",
  utilisateur: "#68d391",
};

export default function App({ keycloak }) {
  const [page, setPage] = useState("vehicules");

  const roles = keycloak?.realmAccess?.roles || [];
  const role =
    ["admin", "gestionnaire", "technicien", "utilisateur"].find((r) =>
      roles.includes(r)
    ) || "inconnu";

  const prenom =
    keycloak?.tokenParsed?.given_name ||
    keycloak?.tokenParsed?.preferred_username ||
    "Utilisateur";

  const pagesAutorisees = PAGES.filter((p) =>
    (PAGE_ACCESS[p.id] || []).includes(role)
  );

  useEffect(() => {
    if (!pagesAutorisees.some((p) => p.id === page)) {
      setPage(pagesAutorisees[0]?.id || "vehicules");
    }
  }, [page, pagesAutorisees]);

  function logout() {
    localStorage.removeItem("sgfv_token");
    keycloak.logout({ redirectUri: window.location.origin });
  }

  return (
    <div className="app">
      <header className="navbar">
        <div className="navbar-brand">
          <span className="brand-icon">🚛</span>
          <div>
            <div className="brand-name">SGFV</div>
            <div className="brand-sub">Système de Gestion de Flotte</div>
          </div>
        </div>

        <nav className="navbar-nav">
          {pagesAutorisees.map((p) => (
            <button
              key={p.id}
              className={"nav-btn" + (page === p.id ? " active" : "")}
              onClick={() => setPage(p.id)}
            >
              <span className="nav-icon">{p.icon}</span>
              <span className="nav-label">{p.label}</span>
            </button>
          ))}
        </nav>

        <div className="navbar-user">
          <span className="user-name">{prenom}</span>
          <span
            className="user-role"
            style={{
              background: (ROLE_COLORS[role] || "#999") + "22",
              color: ROLE_COLORS[role] || "#999",
            }}
          >
            {role}
          </span>
          <button className="btn-logout" onClick={logout}>
            Déconnexion
          </button>
        </div>
      </header>

      <main className="main-content">
        {page === "vehicules" && <VehiculesPage role={role} />}
        {page === "conducteurs" && <ConducteursPage role={role} />}
        {page === "maintenance" && <MaintenancePage role={role} />}
        {page === "localisation" && <LocalisationPage role={role} />}
        {page === "evenements" && <EvenementsPage role={role} />}
      </main>
    </div>
  );
}