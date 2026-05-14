/**
 * Tests unitaires — service-maintenance
 */

function validerMaintenance({ vehicule_id, type, date, cout }) {
  if (!vehicule_id || !type || !date) return "vehicule_id, type et date sont obligatoires";
  if (cout !== undefined && cout !== null && Number(cout) < 0) return "Le coût ne peut pas être négatif";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "Date invalide";
  return null;
}

function formatDate(date) {
  return new Date(date).toISOString().split("T")[0];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("validerMaintenance", () => {
  test("accepte une maintenance valide", () => {
    expect(validerMaintenance({ vehicule_id: 1, type: "Révision", date: "2026-03-01" })).toBeNull();
  });

  test("accepte avec coût positif", () => {
    expect(validerMaintenance({ vehicule_id: 1, type: "Révision", date: "2026-03-01", cout: 150 })).toBeNull();
  });

  test("accepte coût = 0", () => {
    expect(validerMaintenance({ vehicule_id: 1, type: "Révision", date: "2026-03-01", cout: 0 })).toBeNull();
  });

  test("rejette si vehicule_id manquant", () => {
    expect(validerMaintenance({ type: "Révision", date: "2026-03-01" })).toBeTruthy();
  });

  test("rejette si type manquant", () => {
    expect(validerMaintenance({ vehicule_id: 1, date: "2026-03-01" })).toBeTruthy();
  });

  test("rejette si date manquante", () => {
    expect(validerMaintenance({ vehicule_id: 1, type: "Révision" })).toBeTruthy();
  });

  test("rejette un coût négatif", () => {
    const err = validerMaintenance({ vehicule_id: 1, type: "Révision", date: "2026-03-01", cout: -50 });
    expect(err).toMatch(/négatif/);
  });

  test("rejette une date invalide", () => {
    expect(validerMaintenance({ vehicule_id: 1, type: "Révision", date: "pas-une-date" })).toBeTruthy();
  });
});

describe("formatDate", () => {
  test("extrait la partie date uniquement", () => {
    expect(formatDate("2026-03-01T10:30:00Z")).toBe("2026-03-01");
  });

  test("fonctionne avec une date simple", () => {
    expect(formatDate("2026-06-15")).toBe("2026-06-15");
  });
});
