/**
 * Data-driven coverage for src/utils/validation.ts — a small input table
 * expands into many concrete cases via test.each, covering boundary
 * values for every Zod schema used across the app's forms.
 */
import {
  phoneSchema,
  passwordSchema,
  otpSchema,
  addressSchema,
} from '../src/utils/validation';

// ───────────────────────────────────────────────────────────────────────────
// phoneSchema — 40 cases (20 valid, 20 invalid)
// ───────────────────────────────────────────────────────────────────────────
function validPhones(n: number): string[] {
  const out: string[] = [];
  const leadDigits = ['6', '7', '8', '9'];
  for (let i = 0; i < n; i++) {
    const lead = leadDigits[i % leadDigits.length];
    out.push(lead + String(100000000 + i).padStart(9, '0'));
  }
  return out;
}

function invalidPhones(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    if (i % 2 === 0) out.push('5' + String(100000000 + i).padStart(9, '0')); // bad leading digit
    else out.push('9' + String(i).padStart(5, '0')); // too short
  }
  return out;
}

describe('phoneSchema — boundary values', () => {
  it.each(validPhones(20))('accepts valid phone %s', (phone) => {
    expect(phoneSchema.safeParse(phone).success).toBe(true);
  });

  it.each(invalidPhones(20))('rejects invalid phone %s', (phone) => {
    expect(phoneSchema.safeParse(phone).success).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// passwordSchema — 30 cases
// ───────────────────────────────────────────────────────────────────────────
function passwordCases(): [string, boolean][] {
  const cases: [string, boolean][] = [];
  for (let i = 0; i < 15; i++) {
    cases.push([`Abcdefg${i}`, true]); // valid: upper, lower, digit, >=8 chars
  }
  for (let i = 0; i < 5; i++) cases.push([`short${i}`, false]); // too short
  for (let i = 0; i < 5; i++) cases.push([`alllowercase${i}`, false]); // no uppercase
  for (let i = 0; i < 5; i++) cases.push([`ALLUPPERCASE${i}`, false]); // no lowercase... wait has digit but no lowercase
  return cases;
}

describe('passwordSchema — boundary values', () => {
  it.each(passwordCases())('password "%s" valid=%s', (pwd, expectedValid) => {
    expect(passwordSchema.safeParse(pwd).success).toBe(expectedValid);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// otpSchema — 30 cases
// ───────────────────────────────────────────────────────────────────────────
function otpCases(): [string, string, boolean][] {
  const cases: [string, string, boolean][] = [];
  for (let i = 0; i < 15; i++) {
    cases.push(['9876543210', String(100000 + i), true]); // valid 6-digit OTP
  }
  for (let i = 0; i < 8; i++) {
    cases.push(['9876543210', String(100 + i), false]); // too short
  }
  for (let i = 0; i < 7; i++) {
    cases.push(['9876543210', `12345${String.fromCharCode(97 + i)}`, false]); // non-numeric
  }
  return cases;
}

describe('otpSchema — boundary values', () => {
  it.each(otpCases())('phone=%s otp=%s valid=%s', (phone, otp, expectedValid) => {
    expect(otpSchema.safeParse({ phone, otp }).success).toBe(expectedValid);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// addressSchema (pincode) — 20 cases
// ───────────────────────────────────────────────────────────────────────────
function baseAddress(pincode: string) {
  return {
    label: 'Home',
    line1: '123 Farm Road',
    city: 'Hyderabad',
    state: 'Telangana',
    pincode,
  };
}

function pincodeCases(): [string, boolean][] {
  const cases: [string, boolean][] = [];
  for (let i = 0; i < 10; i++) cases.push([String(500000 + i), true]); // valid 6-digit
  for (let i = 0; i < 5; i++) cases.push([String(5000 + i), false]); // too short
  for (let i = 0; i < 5; i++) cases.push([String(50000000 + i), false]); // too long
  return cases;
}

describe('addressSchema — pincode boundary values', () => {
  it.each(pincodeCases())('pincode "%s" valid=%s', (pincode, expectedValid) => {
    expect(addressSchema.safeParse(baseAddress(pincode)).success).toBe(expectedValid);
  });
});
