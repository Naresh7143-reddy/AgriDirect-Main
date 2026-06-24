import { expect } from 'chai';
import { BuyerHomePage } from '../../pages/BuyerHomePage';
import { takeStepScreenshot, captureDeviceLogs } from '../../utilities/screenshotUtil';
import { APP_CONFIG } from '../../test-data/testData';
import { logger } from '../../utilities/logger';

/**
 * Data-driven extended coverage for the Buyer search flow — a small list
 * of crop names is expanded via a loop into one real `it()` per term.
 * Each case performs a genuine search on the real device/emulator and
 * asserts the app did not surface a crash/error screen. Requires a live
 * Appium session — runs locally, not in the CI job (see workflow notes).
 */
const SEARCH_TERMS = [
  'tomato', 'onion', 'potato', 'wheat', 'rice', 'maize', 'cotton', 'sugarcane',
  'banana', 'mango', 'apple', 'grapes', 'carrot', 'cabbage', 'cauliflower',
  'spinach', 'chilli', 'garlic', 'ginger', 'turmeric', 'soybean', 'groundnut',
  'mustard', 'sunflower', 'barley', 'millet', 'lentil', 'chickpea', 'peanut',
  'cucumber', 'pumpkin', 'brinjal', 'okra', 'beetroot', 'radish', 'peas',
  'coconut', 'papaya', 'guava', 'pomegranate', 'watermelon', 'muskmelon',
  'strawberry', 'lemon', 'orange', 'lychee', 'jackfruit', 'drumstick',
  'bittergourd', 'bottlegourd', 'ridgegourd', 'fenugreek', 'coriander',
  'mint', 'curryleaves', 'sesame', 'jute', 'tobacco', 'rubber', 'tea',
];

describe('🛒 Buyer Module — Extended Search Coverage (data-driven)', () => {
  let buyerHome: BuyerHomePage;

  before(async () => {
    buyerHome = new BuyerHomePage();
    await buyerHome.isLoaded();
  });

  afterEach(async function () {
    if (this.currentTest?.state === 'failed') {
      await takeStepScreenshot(`FAIL_extended_search_${this.currentTest.title}`);
      await captureDeviceLogs();
    }
  });

  SEARCH_TERMS.forEach((term) => {
    it(`should search "${term}" without crashing`, async () => {
      await buyerHome.tapBrowse();
      await buyerHome.searchProduct(term);
      await browser.pause(APP_CONFIG.apiWait);

      const crashed =
        (await buyerHome.isTextContainingVisible('Unexpected error')) ||
        (await buyerHome.isTextContainingVisible('has stopped')) ||
        (await buyerHome.isTextContainingVisible('Application error'));

      logger.info(`[Extended] search "${term}" crashed=${crashed}`);
      expect(crashed).to.be.false;
    });
  });
});
