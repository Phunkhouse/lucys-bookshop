// What the checkout tests and the setup script agree on. Invented values.

// A reserved domain (.test), so no mail could ever go to it. The setup script
// deletes the orders of this buyer before every run.
export const E2E_BUYER_EMAIL = 'kupujici@e2e.test'

// The shop settings the tests run with.
export const E2E_ZASILKOVNA_PRICE_MINOR = 8900
export const E2E_PICKUP_INSTRUCTIONS = 'Vyzvednutí po domluvě, Dlouhá 5.'
