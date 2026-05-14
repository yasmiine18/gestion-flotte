/**
 * Tests unitaires — service-conducteurs
 */

const PERMIS_VALIDES = ["A", "B", "C", "D", "BE", "CE", "DE"];

function permisEstValide(permis) {
  return PERMIS_VALIDES.includes(String(permis).toUpperCase());
}

function validerConducteur({ nom, prenom, permis }) {
  if (!nom || !prenom || !permis) return "nom, prenom, permis sont obligatoires";
  if (!permisEstValide(permis))   return `Permis invalide. Valeurs autorisées : ${PERMIS_VALIDES.join(", ")}`;
  return null;
}

function normaliserPermis(permis) {
  return String(permis).toUpperCase();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("permisEstValide", () => {
  test.each(["A", "B", "C", "D", "BE", "CE", "DE"])("accepte le permis %s", (p) => {
    expect(permisEstValide(p)).toBe(true);
  });

  test("accepte en minuscules (normalisation)", () => {
    expect(permisEstValide("b")).toBe(true);
    expect(permisEstValide("ce")).toBe(true);
  });

  test("refuse les permis inconnus", () => {
    expect(permisEstValide("X")).toBe(false);
    expect(permisEstValide("AB")).toBe(false);
    expect(permisEstValide("")).toBe(false);
  });
});

describe("validerConducteur", () => {
  test("accepte un conducteur valide", () => {
    expect(validerConducteur({ nom: "Dupont", prenom: "Marie", permis: "B" })).toBeNull();
  });

  test("rejette si nom manquant", () => {
    expect(validerConducteur({ prenom: "Marie", permis: "B" })).toBeTruthy();
  });

  test("rejette si prénom manquant", () => {
    expect(validerConducteur({ nom: "Dupont", permis: "B" })).toBeTruthy();
  });

  test("rejette si permis manquant", () => {
    expect(validerConducteur({ nom: "Dupont", prenom: "Marie" })).toBeTruthy();
  });

  test("rejette un permis invalide", () => {
    const err = validerConducteur({ nom: "Dupont", prenom: "Marie", permis: "Z" });
    expect(err).toMatch(/Permis invalide/);
  });
});

describe("normaliserPermis", () => {
  test("met en majuscules", () => {
    expect(normaliserPermis("b")).toBe("B");
    expect(normaliserPermis("ce")).toBe("CE");
  });

  test("ne modifie pas ce qui est déjà en majuscules", () => {
    expect(normaliserPermis("BE")).toBe("BE");
  });
});
