const baseUrl = import.meta.env.VITE_API_CONDUCTEURS;

export async function getConducteurs() {
  const res = await fetch(`${baseUrl}/conducteurs`);
  if (!res.ok) throw new Error("Erreur API conducteurs");
  return res.json();
}

export async function addConducteur(payload, token) {
  const res = await fetch(`${baseUrl}/conducteurs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erreur ajout conducteur");
  }
  return res.json();
}
