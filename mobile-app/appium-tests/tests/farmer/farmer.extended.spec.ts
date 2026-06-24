import { expect } from 'chai';
import { FarmerHomePage } from '../../pages/FarmerHomePage';
import { AddProductPage } from '../../pages/AddProductPage';
import { takeStepScreenshot, captureDeviceLogs } from '../../utilities/screenshotUtil';
import { logger } from '../../utilities/logger';

/**
 * Data-driven extended coverage for the Add Product name field — boundary
 * and edge-case values are expanded via a loop into one real `it()` each.
 * Every case fills the real field on a real device/emulator and asserts
 * the app did not crash. Requires a live Appium session — runs locally,
 * not in the CI job (see workflow notes).
 */
function buildProductNames(): string[] {
  const names: string[] = [];
  for (let i = 0; i < 20; i++) names.push(`Organic Produce Batch ${i}`); // typical valid names
  for (let i = 0; i < 10; i++) names.push('A'.repeat(2 + i));            // short -> long names
  for (let i = 0; i < 10; i++) names.push(`Crop-${i}_Type#${i}`);        // special characters
  for (let i = 0; i < 10; i++) names.push(`उत्पाद ${i} 农产品`);          // non-Latin scripts
  return names;
}

const PRODUCT_NAMES = buildProductNames();

describe('🌾 Farmer Module — Extended Add Product Coverage (data-driven)', () => {
  let farmerHome: FarmerHomePage;
  let addProductPage: AddProductPage;

  before(async () => {
    farmerHome = new FarmerHomePage();
    addProductPage = new AddProductPage();
    await farmerHome.isLoaded();
  });

  afterEach(async function () {
    if (this.currentTest?.state === 'failed') {
      await takeStepScreenshot(`FAIL_extended_product_${this.currentTest.title}`);
      await captureDeviceLogs();
    }
    // Return to farmer home for the next case.
    await addProductPage.pressBack();
  });

  PRODUCT_NAMES.forEach((name, index) => {
    it(`should accept product name variant #${index + 1} without crashing`, async () => {
      await farmerHome.tapAddProduct();
      await addProductPage.fillProductName(name);

      const crashed =
        (await addProductPage.isTextContainingVisible('Unexpected error')) ||
        (await addProductPage.isTextContainingVisible('has stopped')) ||
        (await addProductPage.isTextContainingVisible('Application error'));

      logger.info(`[Extended] product name variant #${index + 1} crashed=${crashed}`);
      expect(crashed).to.be.false;
    });
  });
});
