import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Testing Library only cleans up automatically when test globals are enabled.
// Without this, rendered components pile up between tests.
afterEach(() => cleanup())