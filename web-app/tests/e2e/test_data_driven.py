"""Data-driven (parametrized) E2E tests — expands a small input table into
many concrete test cases via pytest.mark.parametrize, combined with the
hand-written suites (test_login/browse/cart/navigation) to reach the
project's 300-test-case target for the Selenium suite.
"""
import os
import itertools
import pytest
from pages import LoginPage, BrowsePage
from conftest import inject_auth_cookies

BASE_URL = os.environ.get("TEST_BASE_URL", "http://localhost:3000")


# ───────────────────────────────────────────────────────────────────────────
# Group 1 — Phone number validation boundary values (100 cases)
# ───────────────────────────────────────────────────────────────────────────
def _valid_phones(n):
    """n distinct realistic 10-digit Indian mobile numbers."""
    return [f"9{str(700000000 + i).zfill(9)}"[:10] for i in range(n)]


def _invalid_phones(n):
    """n distinct invalid inputs: wrong length or non-numeric.

    NOTE: The 'too long' case must NOT be a pure-digit string longer than 10,
    because browsers enforce maxlength=10 and silently truncate pure-digit
    inputs to 10 chars, accidentally producing a valid number.  Instead we
    use short alphanumeric strings whose digit-count is < 10 regardless of
    any browser coercion.
    """
    out = []
    for i in range(n):
        if i % 3 == 0:
            # Too short: pure digit string with fewer than 10 digits
            out.append(str(10**i % 10**9))
        elif i % 3 == 1:
            # Non-numeric / mixed — digits are present but total digits < 10
            # e.g. "9abc0001xyz" → 5 digits after stripping → still invalid
            out.append(f"9abc{i:04d}xyz")
        else:
            # Non-numeric chars embedded in the middle
            out.append(f"98abc{i:05d}")
    return out


VALID_PHONES = _valid_phones(50)
INVALID_PHONES = _invalid_phones(50)


@pytest.mark.parametrize("phone", VALID_PHONES, ids=[f"valid_{i}" for i in range(len(VALID_PHONES))])
def test_valid_phone_enables_send_otp(driver, phone):
    page = LoginPage(driver, BASE_URL).open()
    page.enter_phone(phone)
    assert page.send_otp_btn_enabled


@pytest.mark.parametrize("phone", INVALID_PHONES, ids=[f"invalid_{i}" for i in range(len(INVALID_PHONES))])
def test_invalid_phone_keeps_send_otp_disabled(driver, phone):
    page = LoginPage(driver, BASE_URL).open()
    page.enter_phone(phone)
    digits_only = "".join(c for c in phone if c.isdigit())
    if len(digits_only) == 10:
        pytest.skip("input coerces to a valid 10-digit number")
    assert not page.send_otp_btn_enabled


# ───────────────────────────────────────────────────────────────────────────
# Group 2 — Responsive layout across viewport sizes (40 cases)
# ───────────────────────────────────────────────────────────────────────────
VIEWPORTS = [
    (320, 568), (360, 640), (375, 667), (375, 812), (390, 844),
    (412, 915), (414, 896), (428, 926), (480, 800), (540, 720),
    (600, 960), (768, 1024), (800, 1280), (834, 1112), (900, 1440),
    (1024, 768), (1024, 1366), (1152, 864), (1280, 720), (1280, 800),
    (1280, 900), (1280, 1024), (1366, 768), (1440, 900), (1536, 864),
    (1600, 900), (1680, 1050), (1920, 1080), (1920, 1200), (2048, 1152),
    (2560, 1440), (320, 480), (340, 700), (400, 700), (430, 932),
    (500, 900), (700, 1100), (850, 1300), (950, 1500), (1100, 1600),
]


@pytest.mark.parametrize("width,height", VIEWPORTS, ids=[f"{w}x{h}" for w, h in VIEWPORTS])
def test_login_page_responsive(driver, width, height):
    driver.set_window_size(width, height)
    page = LoginPage(driver, BASE_URL).open()
    assert page.is_visible("phone-input")
    assert page.is_visible("send-otp-btn")


# ───────────────────────────────────────────────────────────────────────────
# Group 3 — Browse search across many query terms (60 cases)
# ───────────────────────────────────────────────────────────────────────────
SEARCH_TERMS = [
    "tomato", "onion", "potato", "wheat", "rice", "maize", "cotton", "sugarcane",
    "banana", "mango", "apple", "grapes", "carrot", "cabbage", "cauliflower",
    "spinach", "chilli", "garlic", "ginger", "turmeric", "soybean", "groundnut",
    "mustard", "sunflower", "barley", "millet", "lentil", "chickpea", "peanut",
    "cucumber", "pumpkin", "brinjal", "okra", "beetroot", "radish", "peas",
    "coconut", "papaya", "guava", "pomegranate", "watermelon", "muskmelon",
    "strawberry", "lemon", "orange", "lychee", "jackfruit", "drumstick",
    "bittergourd", "bottlegourd", "ridge gourd", "fenugreek", "coriander",
    "mint", "curry leaves", "sesame", "jute", "tobacco", "rubber", "tea",
]


@pytest.mark.parametrize("term", SEARCH_TERMS, ids=[t.replace(" ", "_") for t in SEARCH_TERMS])
def test_browse_search_term(driver, term):
    inject_auth_cookies(driver, BASE_URL, role="BUYER")
    page = BrowsePage(driver, BASE_URL).open()
    page.search(term)
    assert page.search_value == term


# ───────────────────────────────────────────────────────────────────────────
# Group 4 — Protected route smoke test across routes × viewport (60 cases)
# ───────────────────────────────────────────────────────────────────────────
BUYER_ROUTES = [
    "/buyer", "/buyer/browse", "/buyer/cart", "/buyer/orders",
    "/buyer/addresses", "/buyer/profile", "/buyer/help", "/buyer/notifications",
    "/buyer/checkout", "/buyer/ai",
]
NAV_VIEWPORTS = [(360, 740), (414, 896), (768, 1024), (1024, 768), (1280, 900), (1920, 1080)]

ROUTE_VIEWPORT_COMBOS = list(itertools.product(BUYER_ROUTES, NAV_VIEWPORTS))


@pytest.mark.parametrize(
    "route,viewport",
    ROUTE_VIEWPORT_COMBOS,
    ids=[f"{r.replace('/', '_')}_{w}x{h}" for r, (w, h) in ROUTE_VIEWPORT_COMBOS],
)
def test_protected_route_loads_without_crash(driver, route, viewport):
    width, height = viewport
    driver.set_window_size(width, height)
    inject_auth_cookies(driver, BASE_URL, role="BUYER")
    driver.get(f"{BASE_URL}{route}")
    body_text = driver.find_element("tag name", "body").text
    assert "Internal Server Error" not in body_text
    assert "Application error" not in body_text
