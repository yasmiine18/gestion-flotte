import { useEffect, useState } from "react";
import { getVehicules, addVehicule, assignerConducteur } from "../api/vehiculesApi";
import { getConducteurs } from "../api/conducteursApi";
import { getDernierePosition } from "../api/localisationApi";

const getToken = () => localStorage.getItem("sgfv_token") || "";

export default function VehiculesPage({ role }) {
  const [vehicules,   setVehicules]   = useState([]);
  const [conducteurs, setConducteurs] = useState([]);
  const [positions,   setPositions]   = useState({});
  const [erreur,      setErreur]      = useState("");
  const [loading,     setLoading]     = useState(false);
  const [form,        setForm]        = useState({ immatriculation: "", marque: "", dispo: true });
  const [assign,      setAssign]      = useState({ vehiculeId: "", conducteurId: "" });

  const peutEcrire = ["admin", "gestionnaire"].includes(role);

  async function charger() {
    setLoading(true); setErreur("");
    try {
      const data = await getVehicules();
      setVehicules(data);
      const pos = {};
      await Promise.all(data.map(async v => {
        try { pos[v.id] = await getDernierePosition(v.id); } catch { pos[v.id] = null; }
      }));
      setPositions(pos);
    } catch (e) { setErreur(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    charger();
    getConducteurs().then(setConducteurs).catch(() => {});
  }, []);

  async function ajouter(e) {
    e.preventDefault(); setErreur("");
    try {
      await addVehicule(form, getToken());
      setForm({ immatriculation: "", marque: "", dispo: true });
      charger();
    } catch (e) { setErreur(e.message); }
  }

  async function assigner(e) {
    e.preventDefault(); setErreur("");
    if (!assign.vehiculeId || !assign.conducteurId) { setErreur("Sélectionnez un véhicule et un conducteur"); return; }
    try {
      await assignerConducteur(Number(assign.vehiculeId), Number(assign.conducteurId), getToken());
      setAssign({ vehiculeId: "", conducteurId: "" });
      charger();
    } catch (e) { setErreur(e.message); }
  }

  async function supprimer(id) {
    if (!window.confirm(`Supprimer le véhicule #${id} ?`)) return;
    try {
      const API = import.meta.env.VITE_API_VEHICULES;
      const r = await fetch(`${API}/vehicules/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "Erreur suppression");
      }
      charger();
    } catch (e) { setErreur(e.message); }
  }

  const dispos = vehicules.filter(v => v.dispo).length;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">🚗 Véhicules</h1>
        <button className="btn btn-secondary" onClick={charger}>↺ Actualiser</button>
      </div>

      <div className="stats-row">
        <div className="stat-card"><div className="stat-value">{vehicules.length}</div><div className="stat-label">Total</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "#68d391" }}>{dispos}</div><div className="stat-label">Disponibles</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "#f6ad55" }}>{vehicules.length - dispos}</div><div className="stat-label">Indisponibles</div></div>
      </div>

      {erreur && <div className="alert-error">⚠ {erreur}</div>}

      {peutEcrire && (
        <>
          <div className="card">
            <div className="card-title">➕ Ajouter un véhicule</div>
            <form className="form-row" onSubmit={ajouter}>
              <div className="form-group">
                <label className="form-label">Immatriculation</label>
                <input placeholder="A44-001-MA" value={form.immatriculation}
                  onChange={e => setForm({ ...form, immatriculation: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Marque</label>
                <input placeholder="Renault" value={form.marque}
                  onChange={e => setForm({ ...form, marque: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Disponible</label>
                <select value={form.dispo ? "true" : "false"} onChange={e => setForm({ ...form, dispo: e.target.value === "true" })}>
                  <option value="true">Oui</option>
                  <option value="false">Non</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-end" }}>Ajouter</button>
            </form>
          </div>

          <div className="card">
            <div className="card-title">🔗 Assigner un conducteur</div>
            <form className="form-row" onSubmit={assigner}>
              <div className="form-group">
                <label className="form-label">Véhicule</label>
                <select value={assign.vehiculeId} onChange={e => setAssign({ ...assign, vehiculeId: e.target.value })}>
                  <option value="">Choisir</option>
                  {vehicules.map(v => <option key={v.id} value={v.id}>{v.id} — {v.immatriculation}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Conducteur</label>
                <select value={assign.conducteurId} onChange={e => setAssign({ ...assign, conducteurId: e.target.value })}>
                  <option value="">Choisir</option>
                  {conducteurs.map(c => <option key={c.id} value={c.id}>{c.id} — {c.prenom} {c.nom}</option>)}
                </select>
              </div>
              <button type="submit" className="btn btn-success" style={{ alignSelf: "flex-end" }}>Assigner</button>
            </form>
          </div>
        </>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Immatriculation</th><th>Marque</th><th>Statut</th><th>Conducteur</th><th>Dernière position</th>{peutEcrire && <th></th>}</tr></thead>
          <tbody>
            {loading ? <tr className="empty-row"><td colSpan={7}>Chargement...</td></tr>
            : vehicules.length === 0 ? <tr className="empty-row"><td colSpan={7}>Aucun véhicule</td></tr>
            : vehicules.map(v => (
              <tr key={v.id}>
                <td><strong style={{ color: "#63b3ed" }}>#{v.id}</strong></td>
                <td><strong>{v.immatriculation}</strong></td>
                <td>{v.marque}</td>
                <td><span className={"badge " + (v.dispo ? "badge-green" : "badge-orange")}>{v.dispo ? "● Disponible" : "● Indisponible"}</span></td>
                <td>{v.conducteur ? <span className="badge badge-blue">👤 {v.conducteur.prenom} {v.conducteur.nom}</span> : <span style={{ color: "#4a5568" }}>—</span>}</td>
                <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                  {positions[v.id] ? `${Number(positions[v.id].latitude).toFixed(4)}, ${Number(positions[v.id].longitude).toFixed(4)}` : <span style={{ color: "#4a5568" }}>—</span>}
                </td>
                {peutEcrire && (
                  <td><button className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => supprimer(v.id)}>Supprimer</button></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
