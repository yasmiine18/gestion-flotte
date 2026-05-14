import { useEffect, useState, useRef } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const BASE = import.meta.env.VITE_API_LOCALISATION;
const TOKEN_KEY = "sgfv_token";
const getToken = () => localStorage.getItem(TOKEN_KEY) || "";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

export default function LocalisationPage({ role }) {
  const peutGererZones = ["admin", "gestionnaire"].includes(role);

  const [vehiculeId, setVehiculeId] = useState("1");
  const [inputId, setInputId] = useState("1");
  const [positions, setPositions] = useState([]);
  const [derniere, setDerniere] = useState(null);
  const [zones, setZones] = useState([]);
  const [erreur, setErreur] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [zoneForm, setZoneForm] = useState({
    nom: "",
    min_lat: "",
    max_lat: "",
    min_lon: "",
    max_lon: "",
  });

  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const markerRef = useRef(null);
  const traceRef = useRef(null);
  const intervalRef = useRef(null);

  async function chargerHistorique(vid) {
    try {
      const r = await fetch(`${BASE}/localisations/vehicule/${vid}?limit=50`);
      setPositions(r.ok ? await r.json() : []);
    } catch {
      setPositions([]);
    }
  }

  async function chargerDerniere(vid) {
    try {
      const r = await fetch(`${BASE}/localisations/vehicule/${vid}/derniere`);
      setDerniere(r.ok ? await r.json() : null);
    } catch {
      setDerniere(null);
    }
  }

  async function chargerZones() {
    try {
      const r = await fetch(`${BASE}/zones`);
      if (r.ok) setZones(await r.json());
    } catch (_e) {}
  }

  async function chargerTout(vid) {
    setErreur("");
    await Promise.all([
      chargerHistorique(vid),
      chargerDerniere(vid),
      chargerZones(),
    ]);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    chargerTout(vehiculeId);
  }, [vehiculeId]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => chargerDerniere(vehiculeId), 4000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, vehiculeId]);

  // Initialiser la carte
  useEffect(() => {
    if (!mapRef.current || mapObj.current) return;

    const map = L.map(mapRef.current).setView([49.44, 1.09], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
    }).addTo(map);
    mapObj.current = map;
  }, []);

  // Mettre à jour la carte quand les positions changent
  useEffect(() => {
    const map = mapObj.current;
    if (!map) return;

    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    if (traceRef.current) {
      traceRef.current.remove();
      traceRef.current = null;
    }

    if (positions.length === 0) return;

    const coords = positions.map((p) => [p.latitude, p.longitude]).reverse();

    traceRef.current = L.polyline(coords, {
      color: "#63b3ed",
      weight: 3,
      opacity: 0.7,
    }).addTo(map);

    const last = coords[coords.length - 1];
    markerRef.current = L.marker(last)
      .addTo(map)
      .bindPopup(`Véhicule #${vehiculeId}<br>Dernière position connue`)
      .openPopup();

    map.fitBounds(traceRef.current.getBounds(), { padding: [30, 30] });
  }, [positions, vehiculeId]);

  async function ajouterZone(e) {
    e.preventDefault();
    setErreur("");
    try {
      const r = await fetch(`${BASE}/zones`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          nom: zoneForm.nom,
          min_lat: Number(zoneForm.min_lat),
          max_lat: Number(zoneForm.max_lat),
          min_lon: Number(zoneForm.min_lon),
          max_lon: Number(zoneForm.max_lon),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Erreur");
      setZoneForm({
        nom: "",
        min_lat: "",
        max_lat: "",
        min_lon: "",
        max_lon: "",
      });
      setShowZoneForm(false);
      chargerZones();
    } catch (e) {
      setErreur(e.message);
    }
  }

  async function supprimerZone(id) {
    try {
      const r = await fetch(`${BASE}/zones/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || "Erreur suppression zone");
      }
      chargerZones();
    } catch (e) {
      setErreur(e.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📍 Localisation GPS</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              color: "#94a3b8",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto (4s)
          </label>
          <button
            className="btn btn-secondary"
            onClick={() => chargerTout(vehiculeId)}
          >
            ↺ Actualiser
          </button>
        </div>
      </div>

      {erreur && <div className="alert-error">⚠ {erreur}</div>}

      <div className="card">
        <div className="card-title">🔍 Sélection du véhicule</div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">ID Véhicule</label>
            <input
              type="number"
              min="1"
              value={inputId}
              onChange={(e) => setInputId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setVehiculeId(inputId)}
              style={{ width: 100 }}
            />
          </div>
          <button
            className="btn btn-primary"
            style={{ alignSelf: "flex-end" }}
            onClick={() => setVehiculeId(inputId)}
          >
            Charger
          </button>
        </div>
      </div>

      {derniere && (
        <div
          className="card"
          style={{
            borderColor: "rgba(104,211,145,0.3)",
            background: "rgba(104,211,145,0.05)",
            marginBottom: 16,
          }}
        >
          <div className="card-title" style={{ color: "#68d391" }}>
            📡 Dernière position — Véhicule #{vehiculeId}
            {autoRefresh && (
              <span style={{ marginLeft: 8, fontSize: 10 }}>● LIVE</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            <div>
              <div style={{ color: "#64748b", fontSize: 11 }}>LATITUDE</div>
              <strong style={{ fontSize: 18 }}>
                {Number(derniere.latitude).toFixed(5)}
              </strong>
            </div>
            <div>
              <div style={{ color: "#64748b", fontSize: 11 }}>LONGITUDE</div>
              <strong style={{ fontSize: 18 }}>
                {Number(derniere.longitude).toFixed(5)}
              </strong>
            </div>
            <div>
              <div style={{ color: "#64748b", fontSize: 11 }}>VITESSE</div>
              <strong style={{ fontSize: 18 }}>
                {derniere.vitesse ?? "—"} km/h
              </strong>
            </div>
            <div>
              <div style={{ color: "#64748b", fontSize: 11 }}>HEURE</div>
              <strong style={{ fontSize: 13 }}>
                {new Date(derniere.timestamp).toLocaleString("fr-FR")}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* Carte Leaflet */}
      <div
        className="card"
        style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}
      >
        {positions.length === 0 && (
          <div style={{ padding: "16px 20px", color: "#4a5568", fontSize: 13 }}>
            ℹ Aucune position pour ce véhicule. Lancez :{" "}
            <code
              style={{
                background: "rgba(255,255,255,0.05)",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              node simulateur-gps.js
            </code>
          </div>
        )}
        <div ref={mapRef} style={{ height: 380, width: "100%" }} />
      </div>

      {/* Historique */}
      <div style={{ marginBottom: 20 }}>
        <h3
          style={{
            color: "#94a3b8",
            fontSize: 13,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginBottom: 10,
          }}
        >
          Historique — {positions.length} positions
        </h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Horodatage</th>
                <th>Latitude</th>
                <th>Longitude</th>
                <th>Vitesse</th>
              </tr>
            </thead>
            <tbody>
              {positions.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={5}>Aucune position</td>
                </tr>
              ) : (
                positions.map((p, i) => (
                  <tr key={i}>
                    <td style={{ color: "#4a5568" }}>{i + 1}</td>
                    <td style={{ fontSize: 12 }}>
                      {new Date(p.timestamp).toLocaleString("fr-FR")}
                    </td>
                    <td style={{ fontFamily: "monospace" }}>
                      {Number(p.latitude).toFixed(5)}
                    </td>
                    <td style={{ fontFamily: "monospace" }}>
                      {Number(p.longitude).toFixed(5)}
                    </td>
                    <td>
                      {p.vitesse != null ? (
                        <span className="badge badge-blue">
                          {p.vitesse} km/h
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Zones */}
      <div className="page-header" style={{ marginTop: 8 }}>
        <h2
          style={{
            fontSize: 16,
            color: "#e2e8f0",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          🗺 Zones de géofencing
          <span className="badge badge-blue">{zones.length}</span>
        </h2>
        {peutGererZones && (
          <button
            className="btn btn-primary"
            onClick={() => setShowZoneForm(!showZoneForm)}
          >
            {showZoneForm ? "✕ Annuler" : "➕ Ajouter"}
          </button>
        )}
      </div>

      {peutGererZones && showZoneForm && (
        <div className="card">
          <form onSubmit={ajouterZone}>
            <div className="form-row" style={{ marginBottom: 12 }}>
              <div className="form-group">
                <label className="form-label">Nom *</label>
                <input
                  placeholder="Zone Rouen centre"
                  value={zoneForm.nom}
                  onChange={(e) =>
                    setZoneForm({ ...zoneForm, nom: e.target.value })
                  }
                  required
                />
              </div>
              {["min_lat", "max_lat", "min_lon", "max_lon"].map((k) => (
                <div className="form-group" key={k}>
                  <label className="form-label">
                    {k.replace("_", " ")} *
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={zoneForm[k]}
                    onChange={(e) =>
                      setZoneForm({ ...zoneForm, [k]: e.target.value })
                    }
                    required
                    style={{ width: 110 }}
                  />
                </div>
              ))}
            </div>
            <button type="submit" className="btn btn-success">
              ✓ Créer
            </button>
          </form>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Nom</th>
              <th>Lat min</th>
              <th>Lat max</th>
              <th>Lon min</th>
              <th>Lon max</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {zones.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={8}>Aucune zone définie</td>
              </tr>
            ) : (
              zones.map((z) => (
                <tr key={z.id}>
                  <td>
                    <strong style={{ color: "#63b3ed" }}>#{z.id}</strong>
                  </td>
                  <td>
                    <strong>{z.nom}</strong>
                  </td>
                  <td style={{ fontFamily: "monospace" }}>{z.min_lat}</td>
                  <td style={{ fontFamily: "monospace" }}>{z.max_lat}</td>
                  <td style={{ fontFamily: "monospace" }}>{z.min_lon}</td>
                  <td style={{ fontFamily: "monospace" }}>{z.max_lon}</td>
                  <td>
                    <span
                      className={
                        "badge " + (z.active ? "badge-green" : "badge-gray")
                      }
                    >
                      {z.active ? "● Active" : "○ Inactive"}
                    </span>
                  </td>
                  <td>
                    {peutGererZones && (
                      <button
                        className="btn btn-danger"
                        style={{ padding: "4px 10px", fontSize: 11 }}
                        onClick={() => supprimerZone(z.id)}
                      >
                        Supprimer
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}