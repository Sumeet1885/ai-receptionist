// Every limit on what people type, in one place. Forms use these for maxLength and hints, the
// validators in this folder enforce them (in the browser and again in the API), and the database
// CHECK constraints, where a column has one, match them.
//
// Lengths are characters after trimming. Amounts are minor units (paise / cents).

export const LIMITS = {
  // People and businesses
  personName: { min: 2, max: 120 },
  businessName: { min: 2, max: 150 },
  email: { max: 254 },
  website: { max: 200 },
  city: { max: 80 },
  useCase: { max: 1000 },

  // Passwords
  customerPassword: { min: 8, max: 128 },
  adminPassword: { min: 12, max: 128 },

  // Admin review of access requests
  adminNotes: { max: 2000 },
  rejectionReason: { max: 1000 },
  recipientLabel: { max: 80 },
  search: { max: 100 },
  // Alert emails added in one go.
  recipientBatch: { max: 20 },

  // Plans and the pricing comparison table
  planName: { min: 2, max: 80 },
  planSlug: { min: 2, max: 60 },
  planTagline: { max: 200 },
  planSortOrder: { min: 0, max: 10_000 },
  planMinutes: { min: 0, max: 10_000_000 },
  planSeats: { min: 0, max: 10_000 },
  amount: { min: 0, max: 2_000_000_000 },
  featureLabel: { min: 1, max: 80 },
  featureKey: { max: 40 },
  featureValue: { max: 60 },
  featureRows: { max: 30 },

  // Coupons
  couponCode: { min: 3, max: 32 },
  couponDescription: { max: 200 },
  couponPercent: { min: 0.01, max: 100 },
  couponRedemptions: { min: 1, max: 1_000_000 },
} as const;

export type LimitName = keyof typeof LIMITS;
