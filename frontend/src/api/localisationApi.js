const baseUrl = import.meta.env.VITE_API_LOCALISATION;

export async function getDernierePosition(vehiculeId) {
  const res = await fetch(`${baseUrl}/localisations/vehicule/${vehiculeId}/derniere`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Erreur API localisation");
  return res.json();
}