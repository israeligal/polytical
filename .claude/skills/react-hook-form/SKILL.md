---
name: react-hook-form
description: React Hook Form patterns and best practices with Zod validation. Use when building forms with useForm, Controller, useFieldArray, FormProvider, or zodResolver. Triggers on form validation, form state management, conditional fields, server data sync with react-query, Connected* field components, format validators, 5-year history coverage, or shadcn/ui form components.
---

# React Hook Form Skill Guide

**Stack:** react-hook-form v7.71+ | @hookform/resolvers v5.2+ | Zod v4

---

## Project Form Architecture

```
User Input -> Connected* component -> Controller -> useQuestionnaireForm -> React Query mutation (debounced) -> API -> Database
```

### Layer Overview

| Layer | Files | Purpose |
|-------|-------|---------|
| **Page** | `src/app/questionnaire/petitioner/[page]/pages/*.tsx` | Composes Connected* fields + FormSection |
| **Connected*** | `src/components/questionnaire/fields/Connected*.tsx` | RHF-aware field wrappers (Controller + useWatch) |
| **FormField** | `src/components/questionnaire/FormField.tsx` | Dumb renderer (no RHF awareness) |
| **Form Hook** | `src/hooks/useQuestionnaireForm.ts` | Generic useForm + server sync + progress tracking |
| **Section Wrappers** | `src/hooks/useQuestionnaireFormRHF.ts`, `useBeneficiaryQuestionnaireFormRHF.ts` | Pre-configured section hooks |
| **Providers** | `QuestionnaireFormProvider.tsx`, `FromReviewProvider.tsx` | FormProvider + progress + review context |

---

## Connected* Components (Preferred Pattern)

All form fields use Connected* components that auto-bind to RHF context via `Controller`. **Never use raw `<Controller>` or `register()` in page components.**

### ConnectedField (Generic)

```tsx
import { ConnectedField } from "@/components/questionnaire/fields/ConnectedField";

// Text input
<ConnectedField name="firstName" type="text" label="First Name" required />

// Date picker
<ConnectedField name="dateOfBirth" type="date" label="Date of Birth" required maxDate={new Date()} />

// Select dropdown
<ConnectedField name="country" type="select" label="Country" options={countryOptions} required />

// Radio group
<ConnectedField name="gender" type="radio" label="Gender" options={genderOptions} required />

// Checkbox group
<ConnectedField name="languages" type="checkbox-group" label="Languages" options={languageOptions} />

// With width constraint (max-width)
<ConnectedField name="zipCode" type="text" label="ZIP Code" width="xs" required />
```

**Width values (max-width):** `xs` (80px), `sm` (128px), `md` (256px), `lg` (384px), `xl` (672px), `full` (100%)

### ConnectedCheckbox

```tsx
<ConnectedCheckbox name="noOtherNames" label="I have no other names" />
<ConnectedCheckbox name="agreesToTerms" label="I agree" subtitle="Optional explanation text" />
```

### ConnectedYesNo

```tsx
<ConnectedYesNo name="isUSCitizen" label="Are you a U.S. citizen?" required />
<ConnectedYesNo name="hasAlias" label="Have you used other names?" yesLabel="Yes" noLabel="No" required />
```

### ConnectedNAField (Text + "Does not apply" checkbox)

```tsx
<ConnectedNAField
  name="aNumber"
  naName="aNumberDoesntApply"
  label="Alien Registration Number"
/>

// Date variant
<ConnectedNAField name="expirationDate" naName="noExpiration" type="date" label="Expiration Date" />
```

### ConnectedPhoneInput (International phone with country code)

```tsx
<ConnectedPhoneInput name="daytimePhone" label="Daytime Phone" required />

// With N/A checkbox
<ConnectedPhoneInput name="mobilePhone" label="Mobile Phone" naName="mobilePhoneDoesntApply" />
```

---

## Composite Field Components

### NameFields (First + Middle with N/A + Last)

```tsx
import { NameFields } from "@/components/questionnaire/fields/NameFields";

// Simple usage
<NameFields<QuestionnaireFormData> />

// With prefix for nested objects
<NameFields<QuestionnaireFormData> prefix="parent1" />
// Generates: "parent1.firstName", "parent1.middleName", "parent1.middleNameDoesntApply", "parent1.lastName"
```

### AddressFields (Country-aware address form)

```tsx
import { AddressFields } from "@/components/questionnaire/AddressFields";

<AddressFields prefix="currentAddress" required />
// Renders: country, street, apt/ste/flr, city, state/province, zip/postal code
// US: state dropdown + 5-digit ZIP | International: province text + postal code
```

---

## Typed Field Path Utilities

### useArrayItemFields (for array items)

```tsx
import { useArrayItemFields } from "@/components/questionnaire/fields/useArrayItemFields";

// Inside a field array map:
{fields.map((field, index) => {
  const f = useArrayItemFields<QuestionnaireFormData, PriorSpouse>({
    arrayPath: "priorSpouses",
    index,
  });

  return (
    <div key={field.id}>
      <ConnectedField name={f("firstName")} type="text" label="First Name" required />
      <ConnectedField name={f("dateOfMarriage")} type="date" label="Date of Marriage" required />
    </div>
  );
})}
```

### useKeyedObjectFields (for keyed objects like parent1, parent2)

```tsx
import { useKeyedObjectFields } from "@/components/questionnaire/fields/useKeyedObjectFields";

const f = useKeyedObjectFields<BeneficiaryQuestionnaireFormData, ParentInfo>({
  objectKey: "parent1",
});

<ConnectedField name={f("firstName")} type="text" label="First Name" required />
// Generates: "parent1.firstName"
```

---

## Form Page Structure

```tsx
// src/app/questionnaire/petitioner/[page]/pages/name.tsx
export default function NamePage() {
  const { form } = useQuestionnairePage<QuestionnaireFormData>({ pageId: "name" });
  const noOtherNames = form.watch("noOtherNames");
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "otherNames" });

  return (
    <FormLayout title="Your Legal Name" subtitle="Enter your name exactly as shown on documents.">
      <FormSection title="Current Legal Name">
        <ConnectedField name="firstName" type="text" label="First Name" required />
        <ConnectedField name="middleName" type="text" label="Middle Name" />
        <ConnectedField name="lastName" type="text" label="Last Name" required />
      </FormSection>

      <FormSection title="Other Names Used">
        <ConnectedCheckbox name="noOtherNames" label="I have not used other names" />

        {!noOtherNames && fields.map((field, index) => (
          <FormCard key={field.id} onRemove={() => remove(index)}>
            <NameFields prefix={`otherNames.${index}`} />
          </FormCard>
        ))}

        {!noOtherNames && (
          <Button variant="outline" onClick={() => append({ firstName: "", middleName: "", lastName: "" })}>
            Add Another Name
          </Button>
        )}
      </FormSection>

      <FormNavigation pageId="name" />
    </FormLayout>
  );
}
```

---

## 5-Year History Coverage Pattern

For address/employment history that must span 5 years:

```tsx
import { useHistoryCoverage } from "@/hooks/useHistoryCoverage";

const { isCovered, visibleEntryCount, getEndDateDisplay, getStartDateError } = useHistoryCoverage({
  currentStartDate: form.watch("currentAddress.startDate"),
  previousEntries: fields, // from useFieldArray
});

// Show previous entries up to visibleEntryCount
{fields.slice(0, visibleEntryCount).map((field, index) => (
  <FormCard key={field.id}>
    <ConnectedField name={f("startDate")} type="date" label="From" required />
    <p>To: {getEndDateDisplay(index)}</p>
    {getStartDateError(index) && <p className="text-destructive">{getStartDateError(index)}</p>}
  </FormCard>
))}

// Show "add more" only when not covered
{!isCovered && <Button onClick={() => append(emptyAddress)}>Add Previous Address</Button>}
```

---

## Format Validation (via Zod .check() + Error Classification)

Format validation flows through Zod `.check()` refinements on schemas, producing `fieldState.error` in RHF. Connected* components use `isRequiredError()` from `error-classification.ts` to classify errors:

- **Format errors** (type `"custom"`) — shown on blur
- **Required errors** (type `"too_small"` or `"invalid_type"`) — only shown on review page (when `highlightEmpty` is true)

```tsx
// Format checks are defined in validation-checks.ts and applied to page + main schemas:
// .check(aNumberValidationCheck())
// .check(ssnValidationCheck())
// .check(phoneValidationCheck({ daytimeField, mobileField, mobileNAField }))

// Connected* components display errors automatically — no formatValidator prop needed:
<ConnectedNAField name="aNumber" naName="aNumberDoesntApply" label="A-Number" />
<ConnectedPhoneInput name="daytimePhone" label="Daytime Phone" required />
```

**Available format validators (for review validation & partial schema):** `validateANumber`, `validateSSN`, `validateZipCode`, `validateEmail`, `validateUSCISNumber`, `validatePhoneNumber`

---

## Server Data Sync Pattern

```tsx
// useQuestionnaireForm.ts (simplified)
const { data: serverData } = useQuestionnaireQuery();

const form = useForm<FormData>({
  resolver: zodResolver(schema),
  defaultValues: deepMerge(emptyDefaults, serverData),
  mode: "onBlur",
  values: serverData ?? undefined,      // Reactively sync server -> form
  resetOptions: { keepDirtyValues: true }, // Preserve user's unsaved edits
});
```

**Key rules:**
- `values` prop reactively updates form when server data changes
- `keepDirtyValues: true` preserves fields user has modified locally
- Never use `undefined` in defaultValues (causes uncontrolled->controlled warnings)
- Section-aware: data stored as `{ petitioner: {...}, beneficiary: {...} }`, each saves independently

---

## Core RHF API Reference

### useForm Options

| Option | Purpose | Project Default |
|--------|---------|-----------------|
| `resolver` | External validation | `zodResolver(schema)` |
| `defaultValues` | Initial form state | Always provided, never undefined |
| `mode` | When to validate | `"onBlur"` |
| `values` | Reactive external data | Server data from React Query |
| `resetOptions.keepDirtyValues` | Preserve user edits | `true` |

### useForm Return Values

```typescript
const {
  control,       // For Controller/useController (pass to Connected* via context)
  handleSubmit,  // Form submission wrapper
  watch,         // Subscribe to field changes (triggers re-render)
  getValues,     // Get values without subscription (for event handlers)
  setValue,      // Programmatically set values
  reset,         // Reset form state
  trigger,       // Manually trigger validation
  formState: { errors, isDirty, isValid, isSubmitting }
} = useForm();
```

### watch vs useWatch vs getValues

| Method | Re-renders | Use Case |
|--------|-----------|----------|
| `watch("field")` | Parent component | Conditional rendering in same component |
| `useWatch({ name })` | Only consuming component | Connected* components (isolated re-renders) |
| `getValues("field")` | None | Event handlers, effects (one-time reads) |

### useFieldArray

```typescript
const { fields, append, remove, move, update, replace } = useFieldArray({
  control,
  name: "previousAddresses",
});
```

**Critical rules:**
1. Always use `field.id` as React key (never index)
2. `append`/`insert`/`update` require complete objects (all fields, not partials)
3. Don't use multiple `useFieldArray` with the same name

### setValue Options

```typescript
setValue("firstName", "John", {
  shouldValidate: true,  // Trigger validation
  shouldDirty: true,     // Mark as dirty
  shouldTouch: true,     // Mark as touched
});

// Nested paths
setValue("currentAddress.city", "New York");
setValue("previousAddresses.0.street", "123 Main St");
```

---

## Zod Schema Patterns

```typescript
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

// zodResolver supports both Zod v3 and v4
// Import from 'zod' or 'zod/v4' - resolver handles both

const schema = z.object({
  firstName: z.string().min(1, "Required"),
  email: z.email("Invalid email"),  // Zod v4 top-level format
  dateOfBirth: z.string().min(1, "Required"),
  currentAddress: addressSchema,
  previousAddresses: z.array(addressSchema).optional(),
});

type FormData = z.infer<typeof schema>;

const form = useForm<FormData>({
  resolver: zodResolver(schema),
  defaultValues: { firstName: "", email: "", ... },
});
```

### zodResolver Options

```typescript
// Synchronous validation (faster, use when schema has no async refinements)
resolver: zodResolver(schema, undefined, { mode: 'sync' })

// Raw mode (returns unprocessed form values, skips Zod transforms)
resolver: zodResolver(schema, undefined, { raw: true })
```

---

## Common Pitfalls

### 1. Using index as key in useFieldArray
```tsx
// BAD
{fields.map((field, index) => <div key={index}>...</div>)}
// GOOD
{fields.map((field, index) => <div key={field.id}>...</div>)}
```

### 2. Undefined in defaultValues
```tsx
// BAD - uncontrolled->controlled warning
defaultValues: { firstName: undefined }
// GOOD
defaultValues: { firstName: "" }
```

### 3. Using raw Controller in page components
```tsx
// BAD - bypass project patterns
<Controller name="firstName" render={({ field }) => <Input {...field} />} />
// GOOD - use Connected* components
<ConnectedField name="firstName" type="text" label="First Name" required />
```

### 4. Including methods object in useEffect deps
```tsx
// BAD - infinite loop (methods object changes each render)
useEffect(() => { ... }, [methods]);
// GOOD - destructure stable methods
const { setValue } = useForm();
useEffect(() => { ... }, [setValue]); // setValue is stable
```

### 5. Partial objects in append/update
```tsx
// BAD
append({ street: "123 Main" });
// GOOD - all fields required
append({ street: "123 Main", city: "", state: "", zipCode: "", country: "" });
```

### 6. Using watch() in Connected* components
```tsx
// BAD - re-renders entire form
const value = form.watch("field");
// GOOD - isolated re-render (what Connected* components do internally)
const value = useWatch({ name: "field", control });
```

### 7. Forgetting useRef for blur tracking
```tsx
// BAD - setState causes re-render on every blur
const [hasBlurred, setHasBlurred] = useState(false);
// GOOD - ref doesn't trigger re-render
const hasBlurred = useRef(false);
```

### 8. Casting away type safety for AOS extension fields
```tsx
// BAD - loses all type checking, typos compile silently
const d = data as Record<string, unknown>;
const value = (d.uscisOficeCity as string) ?? "";  // typo! no error

// GOOD - use the composed type from schema-composer.ts
import type { AosBeneficiaryFormData } from "@/lib/schemas/schema-composer";
function validate({ data }: { data: Partial<AosBeneficiaryFormData> }) {
  const value = data.uscisOfficeCity ?? "";  // typo caught at compile time
}
```

Section components use feature-specific types from `beneficiary-aos-extension.ts`:
`BackgroundExtensionsFormData`, `ImmigrationExtensionsFormData`, `FinancesQualificationsFormData`, etc.
Use `useFormContext<FeatureType>()` — never `as keyof` on static field names.

---

## Quick Reference

| Task | Pattern |
|------|---------|
| Text field | `<ConnectedField name="x" type="text" label="X" />` |
| Date field | `<ConnectedField name="x" type="date" label="X" />` |
| Select dropdown | `<ConnectedField name="x" type="select" options={opts} label="X" />` |
| Radio group | `<ConnectedField name="x" type="radio" options={opts} label="X" />` |
| Yes/No | `<ConnectedYesNo name="x" label="Question?" />` |
| Checkbox | `<ConnectedCheckbox name="x" label="Check this" />` |
| Text + N/A | `<ConnectedNAField name="x" naName="xNA" label="X" />` |
| Phone | `<ConnectedPhoneInput name="x" label="Phone" />` |
| Name group | `<NameFields prefix="parent1" />` |
| Address group | `<AddressFields prefix="currentAddress" />` |
| Array item paths | `useArrayItemFields({ arrayPath, index })` |
| Object key paths | `useKeyedObjectFields({ objectKey })` |
| Conditional fields | `const val = form.watch("field"); {val && <Section />}` |
| Format validation | Zod `.check()` on schema → `fieldState.error` (see above) |
| History coverage | `useHistoryCoverage({ currentStartDate, previousEntries, years? })` |
| Page initialization | `useQuestionnairePage({ pageId })` |
