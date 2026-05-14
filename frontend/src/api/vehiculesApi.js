const baseUrl = import.meta.env.VITE_API_VEHICULES;

export async function getVehicules() {
  const res = await fetch(`${baseUrl}/vehicules`);
  if (!res.ok) throw new Error("Erreur API vehicules");
  return res.json();
}

export async function addVehicule(payload, token) {
  const res = await fetch(`${baseUrl}/vehicules`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erreur ajout vehicule");
  }
  return res.json();
}

export async function assignerConducteur(vehiculeId, conducteurId, token) {
  const res = await fetch(`${baseUrl}/vehicules/${vehiculeId}/assigner/${conducteurId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erreur assignation");
  }
  return res.json();
}
