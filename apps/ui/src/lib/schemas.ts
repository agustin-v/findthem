import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export const signupSchema = z
  .object({
    fullName: z.string().min(2).max(100),
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export const coordsSchema = z.object({ lat: z.number(), lng: z.number() })
export type Coords = z.infer<typeof coordsSchema>

export const personSchema = z.object({
  photos: z.array(z.instanceof(File)).max(5).optional(),
  name: z.string().min(2).max(100),
  age: z.number().int().min(0).max(120),
  physicalDescription: z.string().min(2).max(500),
  healthNotes: z.string().optional(),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/)
    .optional()
    .or(z.literal('')),
  lastSeenAt: z.string().min(1, 'Required'),
  lastSeenLocation: z.string().min(3).max(200),
  lastSeenCoords: coordsSchema.optional(),
  intendedDestination: z.string().optional(),
})

export const animalSchema = z.object({
  photos: z.array(z.instanceof(File)).max(5).optional(),
  speciesBreed: z.string().min(2).max(100),
  name: z.string().optional(),
  behaviourNotes: z.string().optional(),
  microchip: z.string().optional(),
  lastSeenAt: z.string().min(1, 'Required'),
  lastSeenLocation: z.string().min(3).max(200),
  lastSeenCoords: coordsSchema.optional(),
})

export const objectSchema = z.object({
  photos: z.array(z.instanceof(File)).max(5).optional(),
  description: z.string().min(2).max(200),
  sizeWeight: z.string().optional(),
  lastKnownState: z.string().optional(),
  lastSeenAt: z.string().min(1, 'Required'),
  lastSeenLocation: z.string().min(3).max(200),
  lastSeenCoords: coordsSchema.optional(),
})

export type LoginData = z.infer<typeof loginSchema>
export type SignupData = z.infer<typeof signupSchema>
export type PersonData = z.infer<typeof personSchema>
export type AnimalData = z.infer<typeof animalSchema>
export type ObjectData = z.infer<typeof objectSchema>
export type SubjectType = 'person' | 'animal' | 'object'
export type SubjectData = PersonData | AnimalData | ObjectData

export type ResourceType = 'people' | 'motorbikes' | 'cars' | 'drones'

export const resourcesSchema = z.object({
  radiusKm: z.number().min(0.1).max(50),
  needSuggestion: z.boolean(),
  resources: z.array(
    z.object({
      type: z.enum(['people', 'motorbikes', 'cars', 'drones']),
      count: z.number().int().min(1),
    }),
  ),
})

export type ResourcesData = z.infer<typeof resourcesSchema>
