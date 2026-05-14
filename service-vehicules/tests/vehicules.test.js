function validerVehicule({ immatriculation, marque }) {
  if (!immatriculation || !marque) return "immatriculation et marque sont obligatoires";
  if (immatriculation.trim().length === 0) return "immatriculation vide";
  if (marque.trim().length === 0) return "marque vide";
  return null;
}

function genererSagaId(prefix = "saga") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function construirePayloadCreation(vehicule) {
  return { type: "VEHICULE_CREATED", vehicule_id: vehicule.id, immatriculation: vehicule.immatriculation, marque: vehicule.marque };
}

function construirePayloadAssignation(sagaId, vehiculeId, conducteurId) {
  return { type: "VEHICULE_ASSIGNED", saga_id: sagaId, vehicule_id: vehiculeId, conducteur_id: conducteurId };
}

// Corrigé : Number("") === 0 et Number(null) === 0 sont "isFinite" mais pas des IDs valides
function idValide(val) {
  if (val === null || val === undefined || val === "") return false;
  const n = Number(val);
  return Number.isFinite(n) && n > 0;
}

describe("validerVehicule", () => {
  test("accepte un véhicule valide", () => {
    expect(validerVehicule({ immatriculation: "AB-123-CD", marque: "Renault" })).toBeNull();
  });
  test("rejette si immatriculation manquante", () => {
    expect(validerVehicule({ marque: "Renault" })).toBeTruthy();
  });
  test("rejette si marque manquante", () => {
    expect(validerVehicule({ immatriculation: "AB-123-CD" })).toBeTruthy();
  });
  test("rejette si les deux sont manquants", () => {
    expect(validerVehicule({})).toBeTruthy();
  });
  test("rejette une immatriculation vide", () => {
    expect(validerVehicule({ immatriculation: "   ", marque: "Renault" })).toBeTruthy();
  });
});

describe("genererSagaId", () => {
  test("contient le préfixe", () => {
    expect(genererSagaId("vehicule-assignment")).toMatch(/^vehicule-assignment-/);
  });
  test("deux IDs sont différents", () => {
    expect(genererSagaId("test")).not.toBe(genererSagaId("test"));
  });
  test("préfixe par défaut = saga", () => {
    expect(genererSagaId()).toMatch(/^saga-/);
  });
});

describe("construirePayloadCreation", () => {
  test("contient les bons champs", () => {
    const p = construirePayloadCreation({ id: 1, immatriculation: "AB-123-CD", marque: "Renault" });
    expect(p.type).toBe("VEHICULE_CREATED");
    expect(p.vehicule_id).toBe(1);
    expect(p.immatriculation).toBe("AB-123-CD");
  });
});

describe("construirePayloadAssignation", () => {
  test("contient tous les champs", () => {
    const p = construirePayloadAssignation("saga-123", 5, 2);
    expect(p.type).toBe("VEHICULE_ASSIGNED");
    expect(p.saga_id).toBe("saga-123");
    expect(p.vehicule_id).toBe(5);
    expect(p.conducteur_id).toBe(2);
  });
});

describe("validation des IDs", () => {
  test("accepte des entiers positifs", () => {
    expect(idValide("1")).toBe(true);
    expect(idValide(42)).toBe(true);
  });
  test("refuse chaîne vide", () => {
    expect(idValide("")).toBe(false);
  });
  test("refuse chaîne non numérique", () => {
    expect(idValide("abc")).toBe(false);
  });
  test("refuse NaN", () => {
    expect(idValide(NaN)).toBe(false);
  });
  test("refuse null", () => {
    expect(idValide(null)).toBe(false);
  });
  test("refuse undefined", () => {
    expect(idValide(undefined)).toBe(false);
  });
  test("refuse zéro et négatifs", () => {
    expect(idValide(0)).toBe(false);
    expect(idValide(-1)).toBe(false);
  });
});
