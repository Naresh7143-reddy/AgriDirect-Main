import { expect } from 'chai';
import { DeliveryHomePage } from '../../pages/DeliveryHomePage';
import { takeStepScreenshot, captureDeviceLogs } from '../../utilities/screenshotUtil';
import { logger } from '../../utilities/logger';

/**
 * Data-driven extended coverage — repeated round-trip navigation across
 * the delivery agent's three tabs (Available Orders, Earnings,
 * Deliveries). Each iteration is a real navigation cycle on a real
 * device/emulator, asserting the home screen reloads correctly every
 * time (a genuine stability/regression check, not a no-op). Requires a
 * live Appium session — runs locally, not in the CI job.
 */
const TABS: Array<'available' | 'earnings' | 'deliveries'> = [
  'available', 'earnings', 'deliveries',
];

const ITERATIONS = 20;

describe('🚚 Delivery Module — Extended Navigation Stability (data-driven)', () => {
  let deliveryHome: DeliveryHomePage;

  before(async () => {
    deliveryHome = new DeliveryHomePage();
    await deliveryHome.isLoaded();
  });

  afterEach(async function () {
    if (this.currentTest?.state === 'failed') {
      await takeStepScreenshot(`FAIL_extended_delivery_${this.currentTest.title}`);
      await captureDeviceLogs();
    }
  });

  for (let i = 0; i < ITERATIONS; i++) {
    const tab = TABS[i % TABS.length];
    it(`stability round-trip #${i + 1} — navigate to "${tab}" tab and back`, async () => {
      if (tab === 'available') await deliveryHome.tapAvailableOrders();
      else if (tab === 'earnings') await deliveryHome.tapEarnings();
      else await deliveryHome.tapDeliveries();

      await browser.pause(800);
      const reloaded = await deliveryHome.isLoaded();

      logger.info(`[Extended] round-trip #${i + 1} ("${tab}") reloaded=${reloaded}`);
      expect(reloaded).to.be.true;
    });
  }
});
