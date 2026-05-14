const baseUrl = import.meta.env.VITE_API_EVENEMENTS;

export async function getEvenements() {
  const res = await fetch(`${baseUrl}/evenements`);
  if (!res.ok) throw new Error("Erreur API evenements");
  return res.json();
}

export async function getEvenementsVehicule(vehiculeId) {
  const res = await fetch(`${baseUrl}/evenements/vehicule/${vehiculeId}`);
  if (!res.ok) throw new Error("Erreur API evenements vehicule");
  return res.json();
}
