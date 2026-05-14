import { test, expect } from "@playwright/test";

test("login Keycloak puis affichage du dashboard", async ({ page }) => {

  // 1. Aller DIRECTEMENT sur Keycloak
  await page.goto("http://localhost:8085");

  // 2. Attendre que le formulaire apparaisse
  await page.waitForSelector('input[name="username"]', { timeout: 10000 });

  // 3. Remplir login
  await page.locator('input[name="username"]').fill("admin");
  await page.locator('input[name="password"]').fill("admin123");

  // 4. Se connecter
  await page.locator('input[type="submit"], button[type="submit"]').click();

  // 5. Aller sur ton app après login
  await page.goto("http://localhost");

  // 6. Vérifier que ça marche
  await expect(page.locator("text=SGFV")).toBeVisible();
});