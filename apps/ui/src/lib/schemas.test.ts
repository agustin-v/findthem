import {
  resourcesSchema,
  personSchema,
  loginSchema,
  signupSchema,
} from './schemas'

describe('resourcesSchema', () => {
  it('requires radiusKm', () => {
    const result = resourcesSchema.safeParse({
      needSuggestion: false,
      resources: [],
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid radiusKm', () => {
    const result = resourcesSchema.safeParse({
      radiusKm: 1.5,
      needSuggestion: false,
      resources: [],
    })
    expect(result.success).toBe(true)
  })

  it('rejects radiusKm < 0.1', () => {
    const result = resourcesSchema.safeParse({
      radiusKm: 0.05,
      needSuggestion: false,
      resources: [],
    })
    expect(result.success).toBe(false)
  })

  it('rejects radiusKm > 50', () => {
    const result = resourcesSchema.safeParse({
      radiusKm: 51,
      needSuggestion: false,
      resources: [],
    })
    expect(result.success).toBe(false)
  })
})

describe('personSchema', () => {
  it('rejects missing name', () => {
    const result = personSchema.safeParse({
      age: 45,
      physicalDescription: 'Tall, brown hair',
      lastSeenAt: '2026-05-07T14:30:00Z',
      lastSeenLocation: 'Via del Corso',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid age (negative)', () => {
    const result = personSchema.safeParse({
      name: 'Marco',
      age: -1,
      physicalDescription: 'Tall, brown hair',
      lastSeenAt: '2026-05-07T14:30:00Z',
      lastSeenLocation: 'Via del Corso',
    })
    expect(result.success).toBe(false)
  })

  it('rejects age > 120', () => {
    const result = personSchema.safeParse({
      name: 'Marco',
      age: 121,
      physicalDescription: 'Tall, brown hair',
      lastSeenAt: '2026-05-07T14:30:00Z',
      lastSeenLocation: 'Via del Corso',
    })
    expect(result.success).toBe(false)
  })
})

describe('loginSchema', () => {
  it('rejects invalid email', () => {
    const result = loginSchema.safeParse({
      email: 'not-an-email',
      password: '12345678',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid credentials', () => {
    const result = loginSchema.safeParse({
      email: 'test@example.com',
      password: '12345678',
    })
    expect(result.success).toBe(true)
  })
})

describe('signupSchema', () => {
  it('rejects mismatched passwords', () => {
    const result = signupSchema.safeParse({
      fullName: 'Marco Rossi',
      email: 'marco@example.com',
      password: 'password123',
      confirmPassword: 'different123',
    })
    expect(result.success).toBe(false)
  })

  it('accepts matching passwords', () => {
    const result = signupSchema.safeParse({
      fullName: 'Marco Rossi',
      email: 'marco@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    })
    expect(result.success).toBe(true)
  })
})
