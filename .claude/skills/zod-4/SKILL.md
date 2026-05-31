---
name: zod-4
description: Zod 4 schema validation patterns and migration from Zod 3. Use when defining schemas, parsing data, using top-level format functions (z.email, z.url, z.uuid), ISO datetime validation, template literals, stringbool, file validation, codecs, registries, JSON schema conversion, or migrating from Zod 3 patterns (.merge, .strict, message parameter).
---

# Zod 4 Comprehensive Guide

## Overview

Zod 4 is a TypeScript-first schema validation library with significant performance improvements over Zod 3:
- String parsing: 14.71x faster
- Array parsing: 7.43x faster
- Object parsing: 6.5x faster
- Bundle size: 57% smaller (2.3x reduction)
- TypeScript compilation: ~100x fewer type instantiations

## Installation

```bash
npm install zod@^4.0.0
# or
pnpm add zod@^4.0.0
```

## Basic Usage

```typescript
import { z } from "zod"

// Define schema
const UserSchema = z.object({
  username: z.string(),
  email: z.email(),
  age: z.number().positive(),
})

// Infer TypeScript type
type User = z.infer<typeof UserSchema>

// Parse data
const user = UserSchema.parse({ username: "john", email: "john@example.com", age: 25 })
```

---

## Parsing Methods

All schemas implement these parsing methods:

```typescript
// Throws ZodError on failure
schema.parse(data)

// Returns { success: true, data } or { success: false, error }
schema.safeParse(data)

// Async versions for async refinements/transforms
schema.parseAsync(data)
schema.safeParseAsync(data)
```

**Best Practice**: Use `safeParse()` to avoid try-catch blocks:

```typescript
const result = UserSchema.safeParse(input)
if (!result.success) {
  console.error(result.error.issues)
  return
}
// result.data is typed correctly
```

---

## Type Inference

```typescript
// Output type (post-transformation)
type User = z.infer<typeof UserSchema>
type User = z.output<typeof UserSchema>  // Same as infer

// Input type (pre-transformation)
type UserInput = z.input<typeof UserSchema>
```

---

## Primitive Types

```typescript
z.string()
z.number()
z.bigint()
z.boolean()
z.symbol()
z.undefined()
z.null()
z.nan()
z.void()
z.unknown()
z.any()
z.never()
```

---

## String Validation

### Top-Level Format Functions (Zod 4 Preferred)

```typescript
z.email()           // Email validation
z.url()             // URL validation
z.uuid()            // UUID (RFC 9562/4122)
z.hostname()        // Hostname
z.emoji()           // Emoji string
z.base64()          // Base64 encoded
z.base64url()       // Base64 URL-safe (no padding)
z.hex()             // Hexadecimal
z.jwt()             // JSON Web Token
z.cidrv4()          // CIDR IPv4 notation
z.cidrv6()          // CIDR IPv6 notation
z.ipv4()            // IPv4 address
z.ipv6()            // IPv6 address
```

### String Methods

```typescript
z.string()
  .min(5)                    // Minimum length
  .max(100)                  // Maximum length
  .length(10)                // Exact length
  .regex(/^[a-z]+$/)         // Regex pattern
  .startsWith("prefix")      // Must start with
  .endsWith("suffix")        // Must end with
  .includes("substring")     // Must contain
  .uppercase()               // Must be uppercase
  .lowercase()               // Must be lowercase

// Transforms
z.string()
  .trim()                    // Trim whitespace
  .toLowerCase()             // Convert to lowercase
  .toUpperCase()             // Convert to uppercase
  .normalize()               // Unicode normalize
```

### ISO DateTime (Zod 4)

```typescript
z.iso.datetime()              // ISO 8601 datetime
z.iso.datetime({
  offset: true,               // Allow timezone offset
  precision: 3,               // Millisecond precision
})
z.iso.date()                  // ISO date only
z.iso.time()                  // ISO time only
```

### Template Literals (Zod 4)

```typescript
const CSSValue = z.templateLiteral([
  z.number(),
  z.enum(["px", "em", "rem"])
])
// Matches: "10px", "2.5em", "1rem"
```

### Custom String Formats

```typescript
const slug = z.stringFormat("slug", (val) => /^[a-z0-9-]+$/.test(val))
```

---

## Number Validation

```typescript
z.number()
  .gt(5)              // > 5
  .gte(5)             // >= 5
  .lt(10)             // < 10
  .lte(10)            // <= 10
  .positive()         // > 0
  .nonnegative()      // >= 0
  .negative()         // < 0
  .nonpositive()      // <= 0
  .multipleOf(5)      // Must be multiple of 5
  .finite()           // Must be finite (Zod 4 default)

z.int()               // Safe integer
z.int32()             // 32-bit integer range
```

**Zod 4 Breaking Change**: `z.number()` no longer accepts `Infinity` or `-Infinity`.

---

## Coercion

Convert input values to the target type:

```typescript
z.coerce.string()     // Converts to string
z.coerce.number()     // Converts to number (parseFloat)
z.coerce.boolean()    // Converts to boolean
z.coerce.bigint()     // Converts to bigint
z.coerce.date()       // Converts to Date
```

```typescript
z.coerce.number().parse("42")    // 42
z.coerce.boolean().parse("true") // true
z.coerce.date().parse("2024-01-01") // Date object
```

---

## Stringbool (Zod 4)

Parse boolean-like strings:

```typescript
z.stringbool()
// Parses: "true", "false", "yes", "no", "1", "0"

z.stringbool({
  truthy: ["yes", "on", "1"],
  falsy: ["no", "off", "0"],
})
```

---

## Literals

```typescript
z.literal("pending")
z.literal(42)
z.literal(true)
z.literal(["red", "green", "blue"])  // Multiple literals
```

---

## Enums

```typescript
const Status = z.enum(["pending", "active", "completed"])

Status.enum            // { pending: "pending", active: "active", completed: "completed" }
Status.options         // ["pending", "active", "completed"]
Status.exclude(["completed"])  // New enum without "completed"
Status.extract(["pending"])    // New enum with only "pending"
```

**Native Enums**:

```typescript
enum Color { Red, Green, Blue }
const ColorSchema = z.nativeEnum(Color)
```

---

## Arrays

```typescript
z.array(z.string())
  .min(1)              // At least 1 element
  .max(10)             // At most 10 elements
  .length(5)           // Exactly 5 elements
  .nonempty()          // Zod 4: Same as .min(1)
```

---

## Tuples

```typescript
// Fixed length typed array
z.tuple([z.string(), z.number()])
// ["hello", 42]

// With rest elements
z.tuple([z.string()], z.number())
// ["hello", 1, 2, 3, ...]
```

---

## Objects

```typescript
const User = z.object({
  name: z.string(),
  age: z.number(),
})

// Access shape
User.shape.name  // z.string()

// Create enum from keys
User.keyof()     // z.enum(["name", "age"])
```

### Object Variants

```typescript
z.object({...})        // Strips unknown keys (default)
z.strictObject({...})  // Rejects unknown keys (throws)
z.looseObject({...})   // Passes through unknown keys
```

### Object Utilities

```typescript
User.extend({ email: z.string() })     // Add/override properties
User.safeExtend({ email: z.string() }) // Add without override (Zod 4)
User.pick({ name: true })              // Pick specific keys
User.omit({ age: true })               // Omit specific keys
User.partial()                         // Make all fields optional
User.required()                        // Make all fields required
User.catchall(z.unknown())             // Validate unknown keys
```

**Zod 4 Breaking Change**: Use `.extend()` instead of `.merge()`.

### Recursive Objects (Zod 4)

```typescript
const Category: z.ZodType<Category> = z.object({
  name: z.string(),
  get subcategories() {
    return z.array(Category)
  },
})
```

---

## Records

```typescript
z.record(z.string())                    // Record<string, string>
z.record(z.string(), z.number())        // Record<string, number>
z.record(z.enum(["a", "b"]), z.number())// Exhaustive keys (Zod 4)

// Optional keys (Zod 4)
z.partialRecord(z.enum(["a", "b"]), z.number())

// Pass through unmatched keys (Zod 4)
z.looseRecord(z.enum(["a", "b"]), z.number())
```

---

## Maps and Sets

```typescript
z.map(z.string(), z.number())
z.set(z.string()).min(1).max(5)
```

---

## Unions

```typescript
// Basic union (checks sequentially)
z.union([z.string(), z.number()])

// XOR - exactly one match (Zod 4)
z.xor([z.object({ a: z.string() }), z.object({ b: z.number() })])

// Discriminated union (efficient)
z.discriminatedUnion("type", [
  z.object({ type: z.literal("a"), value: z.string() }),
  z.object({ type: z.literal("b"), value: z.number() }),
])
```

---

## Intersections

```typescript
z.intersection(
  z.object({ name: z.string() }),
  z.object({ age: z.number() })
)

// Prefer .extend() for objects
Base.extend({ extra: z.string() })
```

---

## Optionals, Nullables, and Nullish

```typescript
z.string().optional()   // string | undefined
z.string().nullable()   // string | null
z.string().nullish()    // string | null | undefined

// Unwrap inner schema
z.optional(z.string()).unwrap()  // z.string()
```

---

## Defaults and Fallbacks

```typescript
// Default: short-circuits on undefined
z.string().default("fallback")

// Prefault: parses default before returning
z.string().trim().prefault("  hello  ")  // Returns "hello"

// Catch: returns value on any validation error
z.number().catch(0)
z.number().catch((ctx) => ctx.input ?? 0)  // Dynamic
```

---

## Refinements

### Basic Refine

```typescript
z.string().refine(
  (val) => val.includes("@"),
  { error: "Must contain @" }
)

// With options
z.string().refine(
  (val) => val.length > 5,
  {
    error: "Too short",
    abort: true,     // Stop further refinements
    path: ["field"], // Custom error path
  }
)
```

### SuperRefine (Multiple Issues)

```typescript
z.string().superRefine((val, ctx) => {
  if (val.length < 5) {
    ctx.addIssue({
      code: "custom",
      message: "Too short",
    })
  }
  if (!val.includes("@")) {
    ctx.addIssue({
      code: "custom",
      message: "Must contain @",
    })
  }
})
```

### Refinements Inside Schemas (Zod 4)

Refinements can now be chained with other methods:

```typescript
z.string()
  .refine((val) => val.includes("@"))
  .min(5)  // This works in Zod 4!
```

---

## Transformations

```typescript
// Basic transform
z.string().transform((val) => val.length)
// Input: string, Output: number

// With pipe
z.string().pipe(z.transform((val) => parseInt(val)))

// Preprocess (before validation)
z.preprocess(
  (val) => String(val),
  z.string()
)
```

### Overwrite (Zod 4)

Transform value without changing inferred type:

```typescript
z.number()
  .overwrite((val) => Math.round(val))
  .max(100)
// Type stays number, but value is rounded
```

### Codecs (Zod 4)

Bidirectional transformations:

```typescript
const DateCodec = z.codec(z.string(), z.date(), {
  decode: (val) => new Date(val),
  encode: (val) => val.toISOString(),
})

z.decode(DateCodec, "2024-01-01")  // Date object
z.encode(DateCodec, new Date())    // ISO string
```

---

## Branded Types

Simulate nominal typing:

```typescript
const UserId = z.string().brand<"UserId">()
type UserId = z.infer<typeof UserId>

// userId is branded, can't be used as regular string
const userId = UserId.parse("abc123")
```

---

## Readonly

```typescript
z.object({ name: z.string() }).readonly()
// Type: Readonly<{ name: string }>
// Value: Object.freeze() applied
```

---

## Dates

```typescript
z.date()
  .min(new Date("2020-01-01"))
  .max(new Date("2030-01-01"))
```

---

## Files (Zod 4)

```typescript
z.file()
  .min(1024)              // Min bytes
  .max(5 * 1024 * 1024)   // Max bytes (5MB)
  .mime(["image/png", "image/jpeg"])
```

---

## instanceof

```typescript
z.instanceof(Date)
z.instanceof(Map)
z.instanceof(CustomClass)
```

---

## JSON

Validate JSON-encodable values:

```typescript
z.json()  // string | number | boolean | null | array | object
```

---

## Functions

```typescript
const myFunction = z.function({
  input: [z.string(), z.number()],
  output: z.boolean(),
})

// Implement with validation
const fn = myFunction.implement((str, num) => str.length > num)
const fnAsync = myFunction.implementAsync(async (str, num) => str.length > num)
```

---

## Custom Types

```typescript
z.custom<MyType>((val) => {
  return val instanceof MyType
})
```

---

## Error Handling

### Error Customization (Zod 4)

Unified `error` parameter replaces `message`, `required_error`, `invalid_type_error`:

```typescript
z.string({
  error: (issue) => {
    if (issue.input === undefined) return "Required"
    return "Must be a string"
  }
})

// Or simple message
z.string({ error: "Invalid value" })
```

### ZodError Structure

```typescript
const result = schema.safeParse(data)
if (!result.success) {
  result.error.issues.forEach(issue => {
    console.log(issue.code)     // Error code
    console.log(issue.message)  // Error message
    console.log(issue.path)     // Field path ["user", "email"]
  })
}
```

**Zod 4 Deprecated Methods**:
- `.format()` - deprecated
- `.flatten()` - deprecated
- `.formErrors` - deprecated
- `.addIssue()` / `.addIssues()` - deprecated

---

## Metadata and Registries (Zod 4)

```typescript
// Add description
z.string().describe("User's email address")

// Add metadata
z.string().meta({ example: "john@example.com" })

// Registry for typed metadata
const registry = z.registry<{ title: string; description: string }>()

const Email = z.email().register(registry, {
  title: "Email",
  description: "User email address",
})
```

---

## JSON Schema Conversion (Zod 4)

```typescript
import { z } from "zod"

const schema = z.object({
  name: z.string(),
  email: z.email(),
})

const jsonSchema = z.toJSONSchema(schema, {
  target: "draft-07",           // or "draft-04", "draft-2020-12", "openapi-3.0"
  io: "input",                  // or "output"
  unrepresentable: "any",       // or "throw"
  cycles: "ref",                // or "throw"
})

// From JSON Schema (experimental)
const zodSchema = z.fromJSONSchema(jsonSchema)
```

---

## Best Practices

### 1. Use Top-Level Format Functions (Zod 4)

```typescript
// Preferred
z.email()
z.url()
z.uuid()

// Deprecated (still works)
z.string().email()
z.string().url()
```

### 2. Use safeParse() for Error Handling

```typescript
const result = schema.safeParse(input)
if (!result.success) {
  // Handle errors
  return { errors: result.error.issues }
}
return result.data
```

### 3. Infer Types from Schemas

```typescript
// Define schema once, infer type
const UserSchema = z.object({...})
type User = z.infer<typeof UserSchema>
```

### 4. Use Discriminated Unions for Performance

```typescript
// Efficient - uses discriminator
z.discriminatedUnion("type", [...])

// Less efficient - tries each option
z.union([...])
```

### 5. Colocate Schemas with Related Code

```typescript
// src/lib/schemas/user.ts
export const userSchema = z.object({...})
export type User = z.infer<typeof userSchema>
```

### 6. Use Extend for Object Composition

```typescript
const BaseSchema = z.object({ id: z.string() })
const UserSchema = BaseSchema.extend({ name: z.string() })
```

### 7. Prefer Overwrite for Same-Type Transforms

```typescript
// Use overwrite when output type is same as input
z.number().overwrite((val) => Math.round(val))

// Use transform when output type differs
z.string().transform((val) => val.length)
```

### 8. Use Registries for Schema Documentation

```typescript
const registry = z.registry<{ title: string }>()
z.email().register(registry, { title: "Email Address" })
```

---

## Migration from Zod 3

### Key Changes

1. **Error customization**: Use `error` instead of `message`, `required_error`, `invalid_type_error`
2. **String formats**: Use `z.email()` instead of `z.string().email()`
3. **Object methods**: Use `.extend()` instead of `.merge()`
4. **Strict objects**: Use `z.strictObject()` instead of `.strict()`
5. **Record keys**: Enum keys are now exhaustive by default
6. **Numbers**: No longer accept Infinity

### Deprecated Features

- `message` parameter -> `error`
- `invalid_type_error` / `required_error` -> `error` function
- `errorMap` -> `error` function
- `.strict()`, `.passthrough()`, `.strip()` -> use object variants
- `.merge()` -> `.extend()`
- `.format()`, `.flatten()` on ZodError
