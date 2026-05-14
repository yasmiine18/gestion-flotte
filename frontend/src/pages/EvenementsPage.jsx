import { useEffect, useState, useRef } from "react";

const API = import.meta.env.VITE_API_EVENEMENTS;

const TYPE_CONFIG = {
  GEOFENCE_OUT:              { label: "Sortie de zone",  color: "badge-red",    icon: "🚨" },
  VEHICULE_CREATED:          { label: "Véhicule créé",   color: "badge-green",  icon: "🚗" },
  VEHICULE_ASSIGNED:         { label: "Assignation",     color: "badge-blue",   icon: "🔗" },
  VEHICULE_ASSIGNMENT_STARTED: { label: "Assignation...", color: "badge-gray",  icon: "⏳" },
  VEHICULE_ASSIGNMENT_FAILED:  { label: "Échec assign.", color: "badge-red",    icon: "❌" },
  VEHICULE_DELETED:          { label: "Supprimé",        color: "badge-red",    icon: "🗑" },
  CONDUCTEUR_CREATED:        { label: "Conducteur créé", color: "badge-green",  icon: "👤" },
  CONDUCTEUR_UPDATED:        { label: "Conducteur modif", color: "badge-blue",  icon: "✏️" },
  MAINTENANCE_CREATED:       { label: "Maintenance",     color: "badge-orange", icon: "🔧" },
  MAINTENANCE_UPDATED:       { label: "Maintenance modif", color: "badge-blue", icon: "🔧" },
};

function getBadge(type) {
  const cfg = TYPE_CONFIG[type] || { label: type, color: "badge-gray", icon: "📋" };
  return cfg;
}

export default function EvenementsPage() {
  const [events,   setEvents]   = useState([]);
  const [erreur,   setErreur]   = useState("");
  const [loading,  setLoading]  = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [filtre,   setFiltre]   = useState("tous");
  const intervalRef = useRef(null);

  async function charger() {
    setLoading(true); setErreur("");
    try {
      const res = await fetch(`${API}/evenements`);
      if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
      setEvents(await res.json());
    } catch (e) { setErreur(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { charger(); }, []);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(charger, 3000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoRefresh]);

  const types = ["tous", ...Object.keys(TYPE_CONFIG)];
  const filtered = filtre === "tous" ? events : events.filter(e => e.type === filtre);

  const geofences = events.filter(e => e.type === "GEOFENCE_OUT").length;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">🔔 Événements Kafka</h1>
        <div style={{display:"flex", gap:8, alignItems:"center"}}>
          <label style={{display:"flex", alignItems:"center", gap:6, fontSize:13, color:"#94a3b8", cursor:"pointer"}}>
            <input type="checkbox" checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)} />
            Auto (3s)
          </label>
          <button className="btn btn-secondary" onClick={charger}>↺ Actualiser</button>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{events.length}</div>
          <div className="stat-label">Total événements</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{color:"#fc8181"}}>{geofences}</div>
          <div className="stat-label">Sorties de zone</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{color:autoRefresh?"#68d391":"#4a5568", fontSize:14}}>
            {autoRefresh ? "● LIVE" : "○ Arrêté"}
          </div>
          <div className="stat-label">Rafraîchissement</div>
        </div>
      </div>

      {erreur && <div className="alert-error">⚠ {erreur} — Vérifiez que le service-evenements est démarré (port 8086)</div>}

      {!loading && events.length === 0 && !erreur && (
        <div className="alert-info">
          ℹ Aucun événement pour l'instant. Les événements apparaissent automatiquement quand vous créez des véhicules,
          conducteurs, ou lancez le simulateur GPS (<code>node simulateur-gps.js</code>).
        </div>
      )}

      <div className="card" style={{padding:"10px 14px", marginBottom:16}}>
        <div style={{display:"flex", gap:6, flexWrap:"wrap", alignItems:"center"}}>
          <span style={{fontSize:11, color:"#64748b", marginRight:4}}>FILTRER :</span>
          {types.slice(0, 8).map(t => (
            <button key={t} className={"btn " + (filtre===t ? "btn-primary" : "btn-secondary")}
              style={{padding:"4px 10px", fontSize:11}}
              onClick={() => setFiltre(t)}>
              {t === "tous" ? "Tous" : (TYPE_CONFIG[t]?.icon + " " + (TYPE_CONFIG[t]?.label || t))}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>Type</th><th>Saga ID</th><th>Véhicule</th><th>Localisation</th><th>Date</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="empty-row"><td colSpan={6}>Chargement...</td></tr>
            ) : filtered.length === 0 ? (
              <tr className="empty-row"><td colSpan={6}>Aucun événement{filtre !== "tous" ? " pour ce filtre" : ""}</td></tr>
            ) : filtered.map(e => {
              const cfg = getBadge(e.type);
              return (
                <tr key={e.id}>
                  <td><strong style={{color:"#63b3ed"}}>#{e.id}</strong></td>
                  <td><span className={"badge " + cfg.color}>{cfg.icon} {cfg.label}</span></td>
                  <td style={{fontFamily:"monospace", fontSize:11, color:"#64748b"}}>
                    {e.saga_id ? e.saga_id.substring(0, 20) + "..." : "—"}
                  </td>
                  <td>{e.vehicule_id ? <span className="badge badge-gray">#{e.vehicule_id}</span> : "—"}</td>
                  <td style={{fontFamily:"monospace", fontSize:12}}>
                    {e.latitude ? `${Number(e.latitude).toFixed(3)}, ${Number(e.longitude).toFixed(3)}` : "—"}
                  </td>
                  <td style={{color:"#64748b", fontSize:12}}>
                    {new Date(e.timestamp).toLocaleString("fr-FR")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
