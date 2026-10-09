import { test as base, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Toute exception JavaScript non gérée dans la page fait échouer le test
const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await use(page);
    expect(errors, 'erreurs JavaScript dans la page').toEqual([]);
  },
});

const modal = (page: Page) => page.getByText('Grille tarifaire actuelle en vigueur');
const hash = (page: Page) => page.evaluate(() => window.location.hash);

test.describe('Fiche station', () => {
  test('le créneau tarifaire en cours est mis en évidence', async ({ page }) => {
    // 17:30 à Paris (UTC+2) : en heures pleines pour la plage 09:00 - 20:00 de la station
    await page.clock.setFixedTime(new Date('2026-10-09T15:30:00Z'));
    await page.goto('#/carte?station=6507');
    await expect(page.getByTestId('current-period')).toHaveText('En ce moment : heures pleines');
    await expect(page.getByText('Maintenant')).toHaveCount(2); // Tesla et non-Tesla
  });
});

test.describe('URLs partageables', () => {
  test('la recherche, les filtres et le tri sont relus depuis l’URL', async ({ page }) => {
    await page.goto('#/liste?q=rennes&tri=price');
    await expect(page.locator('#search-superchargers-input')).toHaveValue('rennes');
    const cards = page.locator('[id^=view-charger-details-]');
    await expect(cards).toHaveCount(2);
    // Tri par prix HC : Cleunay (0.16 €) avant Avenue du Canada (0.18 €)
    await expect(cards.nth(0)).toHaveId('view-charger-details-6507');
    await expect(cards.nth(1)).toHaveId('view-charger-details-662');
  });

  test('les filtres modifiés sont écrits dans l’URL', async ({ page }) => {
    await page.goto('#/liste');
    await page.locator('#search-superchargers-input').fill('paris');
    await page.getByRole('button', { name: /Prix HC/ }).click();
    await expect.poll(() => hash(page)).toBe('#/liste?q=paris&tri=price');
  });

  test('ouvrir une fiche ajoute la station à l’URL, Retour la referme', async ({ page }) => {
    await page.goto('#/liste?q=rennes');
    // Deux stations partagent le slug « rennessupercharger » : la fiche doit être celle cliquée
    await page.locator('#view-charger-details-662').click();
    await expect(modal(page)).toBeVisible();
    await expect(page.getByText('35200 Rennes (Bretagne)')).toBeVisible();
    expect(await hash(page)).toBe('#/liste?q=rennes&station=662');

    await page.goBack();
    await expect(modal(page)).toBeHidden();
    expect(await hash(page)).toBe('#/liste?q=rennes');
  });

  test('un lien direct ouvre la bonne fiche (identifiant, ou slug des anciens liens)', async ({ page }) => {
    await page.goto('#/carte?station=6507');
    await expect(page.getByText('Rue Jules Vallès, 35000 Rennes (Bretagne)')).toBeVisible();

    await page.goto('#/carte?station=parissupercharger');
    await page.reload();
    await expect(page.getByText('75015 Paris (Île-de-France)')).toBeVisible();

    // Fermer une fiche ouverte par lien direct la retire de l'URL
    await page.locator('.fixed.inset-0.z-50 button:has(svg.lucide-x)').first().click();
    await expect(modal(page)).toBeHidden();
    expect(await hash(page)).toBe('#/carte');
  });

  test('les onglets ont chacun leur URL', async ({ page }) => {
    await page.goto('');
    for (const [id, expected] of [['#tab-list', '#/liste'], ['#tab-stats', '#/evolution'], ['#tab-updates', '#/mises-a-jour'], ['#tab-simulator', '#/simulateur'], ['#tab-map', '#/carte']]) {
      await page.locator(id).click();
      expect(await hash(page)).toBe(expected);
    }
  });
});

test.describe('Autour de moi', () => {
  test('la carte liste les stations ouvertes les plus proches', async ({ page }) => {
    await page.goto('#/carte');
    await page.getByRole('button', { name: /Autour de moi/ }).click();
    const panel = page.getByRole('region', { name: 'Superchargeurs les plus proches' });
    await expect(panel).toContainText('Les plus proches de vous');
    await expect(panel.getByRole('listitem')).toHaveCount(3);
    await expect(panel.getByRole('listitem').first()).toContainText('Rennes');
    await expect(panel.getByRole('listitem').last()).toContainText('Paris');

    await panel.getByRole('listitem').last().getByRole('button').click();
    await expect(page.getByText('75015 Paris (Île-de-France)')).toBeVisible();
  });

  test('la liste se trie par distance avec la distance affichée', async ({ page }) => {
    await page.goto('#/liste');
    await page.getByRole('button', { name: /Distance/ }).click();
    await expect.poll(() => hash(page)).toBe('#/liste?tri=distance');
    const cards = page.locator('[id^=view-charger-details-]');
    await expect(cards.first()).toHaveId('view-charger-details-6507');
    await expect(page.getByText(/^\d+,\d km$/).first()).toBeVisible();
  });
});

test.describe('Fraîcheur et collecte', () => {
  test('chaque carte affiche l’ancienneté de son relevé', async ({ page }) => {
    await page.goto('#/liste?q=rennes');
    await expect(page.getByText(/^Relevé (aujourd'hui|hier|il y a \d+ j)$/)).toHaveCount(2);
  });

  test('l’onglet Mises à jour montre l’état de la collecte', async ({ page }) => {
    await page.goto('#/mises-a-jour');
    await expect(page.getByRole('heading', { name: 'État de la collecte des tarifs' })).toBeVisible();
    // La base de test ne contient aucun import
    await expect(page.getByText('Aucun relevé reçu pour l’instant.')).toBeVisible();
    await expect(page.getByText(/3 stations ouvertes/)).toBeVisible();
  });
});

test.describe('Divers', () => {
  test('les notes de version s’ouvrent depuis le numéro de version', async ({ page }) => {
    const config = fs.readFileSync(path.join(import.meta.dirname, '..', 'tesla-pricing', 'config.yaml'), 'utf-8');
    const version = config.match(/^version:\s*"?([^"\s]+)"?/m)![1];

    await page.goto('');
    await page.getByRole('button', { name: `v${version}` }).click();
    const dialog = page.getByRole('dialog', { name: 'Notes de version' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { level: 3 }).first()).toHaveText(`v${version}`);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('le simulateur utilise le tarif de la station choisie', async ({ page }) => {
    await page.goto('#/simulateur');
    await page.locator('select').filter({ has: page.locator('option[value="NATIONAL"]') }).selectOption('662');
    await expect(page.getByText('(0.18 €/kWh)')).toBeVisible();
  });

  test('les écrans principaux s’affichent sans erreur', async ({ page }) => {
    for (const route of ['#/carte', '#/liste', '#/evolution', '#/mises-a-jour', '#/simulateur']) {
      await page.goto(route);
      await expect(page.locator('main')).not.toBeEmpty();
    }
  });
});
