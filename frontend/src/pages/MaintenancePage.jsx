import { useEffect, useState } from "react";
import { getMaintenances, addMaintenance } from "../api/maintenanceApi";

const getToken = () => localStorage.getItem("sgfv_token") || "";
const TYPES = ["Révision", "Vidange", "Pneus", "Freins", "Courroie", "Climatisation", "Autre"];

export default function MaintenancePage({ role }) {
  const [maintenances, setMaintenances] = useState([]);
  const [erreur,       setErreur]       = useState("");
  const [loading,      setLoading]      = useState(false);
  const [showForm,     setShowForm]     = useState(false);
  const [form, setForm] = useState({
    vehicule_id: "", type: "Révision",
    date: new Date().toISOString().split("T")[0],
    cout: "", commentaire: ""
  });

  const peutEcrire = ["admin", "gestionnaire", "technicien"].includes(role);

  async function charger() {
    setLoading(true); setErreur("");
    try { setMaintenances(await getMaintenances()); }
    catch (e) { setErreur(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { charger(); }, []);

  async function ajouter(e) {
    e.preventDefault(); setErreur("");
    try {
      await addMaintenance({
        vehicule_id: Number(form.vehicule_id), type: form.type, date: form.date,
        cout: form.cout ? Number(form.cout) : null,
        commentaire: form.commentaire || null,
      }, getToken());
      setShowForm(false);
      setForm({ vehicule_id: "", type: "Révision", date: new Date().toISOString().split("T")[0], cout: "", commentaire: "" });
      charger();
    } catch (e) { setErreur(e.message); }
  }

  async function supprimer(id) {
    if (!window.confirm(`Supprimer la maintenance #${id} ?`)) return;
    try {
      const API = import.meta.env.VITE_API_MAINTENANCE;
      const r = await fetch(`${API}/maintenances/${id}`, {
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

  const totalCout = maintenances.reduce((s, m) => s + (Number(m.cout) || 0), 0);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">🔧 Maintenance</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={charger}>↺ Actualiser</button>
          {peutEcrire && (
            <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
              {showForm ? "✕ Annuler" : "➕ Nouvelle intervention"}
            </button>
          )}
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-card"><div className="stat-value">{maintenances.length}</div><div className="stat-label">Interventions</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "#f6ad55", fontSize: 22 }}>{totalCout.toFixed(0)} €</div><div className="stat-label">Coût total</div></div>
      </div>

      {erreur && <div className="alert-error">⚠ {erreur}</div>}

      {showForm && (
        <div className="card">
          <div className="card-title">➕ Nouvelle intervention</div>
          <form onSubmit={ajouter}>
            <div className="form-row" style={{ marginBottom: 12 }}>
              <div className="form-group">
                <label className="form-label">ID Véhicule *</label>
                <input type="number" placeholder="1" value={form.vehicule_id}
                  onChange={e => setForm({ ...form, vehicule_id: e.target.value })} required min="1" style={{ width: 100 }} />
              </div>
              <div className="form-group">
                <label className="form-label">Type *</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Date *</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Coût (€)</label>
                <input type="number" step="0.01" min="0" value={form.cout}
                  onChange={e => setForm({ ...form, cout: e.target.value })} style={{ width: 110 }} />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Commentaire</label>
              <input placeholder="Détails..." value={form.commentaire}
                onChange={e => setForm({ ...form, commentaire: e.target.value })} style={{ width: "100%", maxWidth: 500 }} />
            </div>
            <button type="submit" className="btn btn-success">✓ Enregistrer</button>
          </form>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Véhicule</th><th>Type</th><th>Date</th><th>Coût</th><th>Commentaire</th>{peutEcrire && <th></th>}</tr></thead>
          <tbody>
            {loading ? <tr className="empty-row"><td colSpan={7}>Chargement...</td></tr>
            : maintenances.length === 0 ? <tr className="empty-row"><td colSpan={7}>Aucune intervention</td></tr>
            : maintenances.map(m => (
              <tr key={m.id}>
                <td><strong style={{ color: "#63b3ed" }}>#{m.id}</strong></td>
                <td><span className="badge badge-gray">#{m.vehicule_id}</span></td>
                <td><span className="badge badge-orange">{m.type}</span></td>
                <td>{m.date ? new Date(m.date).toLocaleDateString("fr-FR") : "—"}</td>
                <td style={{ color: m.cout ? "#f6ad55" : "#4a5568" }}>{m.cout ? `${Number(m.cout).toFixed(2)} €` : "—"}</td>
                <td style={{ color: "#94a3b8", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.commentaire || "—"}</td>
                {peutEcrire && (
                  <td><button className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => supprimer(m.id)}>Supprimer</button></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
