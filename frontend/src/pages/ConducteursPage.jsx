import { useEffect, useState } from "react";
import { getConducteurs, addConducteur } from "../api/conducteursApi";

const getToken = () => localStorage.getItem("sgfv_token") || "";
const PERMIS = ["A", "B", "C", "D", "BE", "CE", "DE"];

export default function ConducteursPage({ role }) {
  const [conducteurs, setConducteurs] = useState([]);
  const [erreur,      setErreur]      = useState("");
  const [loading,     setLoading]     = useState(false);
  const [form,        setForm]        = useState({ nom: "", prenom: "", permis: "B" });

  const peutEcrire = ["admin", "gestionnaire"].includes(role);

  async function charger() {
    setLoading(true); setErreur("");
    try { setConducteurs(await getConducteurs()); }
    catch (e) { setErreur(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { charger(); }, []);

  async function ajouter(e) {
    e.preventDefault(); setErreur("");
    try {
      await addConducteur(form, getToken());
      setForm({ nom: "", prenom: "", permis: "B" });
      charger();
    } catch (e) { setErreur(e.message); }
  }

  async function supprimer(id) {
    if (!window.confirm(`Supprimer le conducteur #${id} ?`)) return;
    try {
      const API = import.meta.env.VITE_API_CONDUCTEURS;
      const r = await fetch(`${API}/conducteurs/${id}`, {
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

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">👤 Conducteurs</h1>
        <button className="btn btn-secondary" onClick={charger}>↺ Actualiser</button>
      </div>

      <div className="stats-row">
        <div className="stat-card"><div className="stat-value">{conducteurs.length}</div><div className="stat-label">Total</div></div>
      </div>

      {erreur && <div className="alert-error">⚠ {erreur}</div>}

      {peutEcrire && (
        <div className="card">
          <div className="card-title">➕ Ajouter un conducteur</div>
          <form className="form-row" onSubmit={ajouter}>
            <div className="form-group">
              <label className="form-label">Nom</label>
              <input placeholder="Dupont" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">Prénom</label>
              <input placeholder="Marie" value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">Permis</label>
              <select value={form.permis} onChange={e => setForm({ ...form, permis: e.target.value })}>
                {PERMIS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-end" }}>Ajouter</button>
          </form>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Nom</th><th>Prénom</th><th>Permis</th>{peutEcrire && <th></th>}</tr></thead>
          <tbody>
            {loading ? <tr className="empty-row"><td colSpan={5}>Chargement...</td></tr>
            : conducteurs.length === 0 ? <tr className="empty-row"><td colSpan={5}>Aucun conducteur</td></tr>
            : conducteurs.map(c => (
              <tr key={c.id}>
                <td><strong style={{ color: "#63b3ed" }}>#{c.id}</strong></td>
                <td><strong>{c.nom}</strong></td>
                <td>{c.prenom}</td>
                <td><span className="badge badge-blue">{c.permis}</span></td>
                {peutEcrire && (
                  <td><button className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => supprimer(c.id)}>Supprimer</button></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
