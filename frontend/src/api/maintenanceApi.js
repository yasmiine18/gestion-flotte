const baseUrl = import.meta.env.VITE_API_MAINTENANCE;

export async function getMaintenances() {
  const res = await fetch(`${baseUrl}/maintenances`);
  if (!res.ok) throw new Error("Erreur API maintenances");
  return res.json();
}

export async function getMaintenancesVehicule(vehiculeId) {
  const res = await fetch(`${baseUrl}/maintenances/vehicule/${vehiculeId}`);
  if (!res.ok) throw new Error("Erreur API maintenances vehicule");
  return res.json();
}

export async function addMaintenance(payload, token) {
  const res = await fetch(`${baseUrl}/maintenances`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erreur ajout maintenance");
  }
  return res.json();
}
