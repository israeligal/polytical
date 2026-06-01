---
name: storybook-stories
description: Storybook 10 story writing patterns and best practices. Use when creating stories for React components, writing play functions for interaction testing, mocking Next.js navigation/React context/React Hook Form in stories, setting up decorators, configuring CSF meta/args/argTypes, or testing accessibility in Storybook. Triggers on .stories.tsx files or Storybook configuration.
---

# Writing Storybook Stories

> Based on Storybook 10 best practices. See [Storybook 10 release](https://storybook.js.org/blog/storybook-10/).

## Core Principle: Test Real Components

**Never duplicate component UI in stories.** Always use the real component with mock providers/context.

### Bad Pattern (Don't Do This)
```tsx
// Duplicates the entire component UI
function FormNavigationPresenter({ isSaving, onBack }) {
  return (
    <div className="flex items-center justify-between">
      <Button onClick={onBack}>Back</Button>
      {isSaving && <Loader2 />}
      <Button>Save & Continue</Button>
    </div>
  );
}

const meta = {
  component: FormNavigationPresenter, // Testing fake component!
};
```

### Good Pattern (Do This)
```tsx
// Uses real component with mock providers
import { FormNavigation } from './FormNavigation';

const meta = {
  component: FormNavigation,
  decorators: [withMockProviders],
};
```

## Story Organization

Each component should have **three types of stories**:

### 1. Default Story
Shows component with only required props - the visual baseline:
```tsx
export const Default: Story = {
  args: {
    label: 'Submit',
    // Only required props
  },
};
```

### 2. Playground Story (Optional)
Lets consumers try different prop combinations:
```tsx
export const Playground: Story = {
  args: {
    label: 'Submit',
    variant: 'primary',
    size: 'medium',
    disabled: false,
  },
  // All props exposed via Controls
};
```

### 3. State-Specific Stories
Capture specific component states:
```tsx
export const Loading: Story = {
  args: { isLoading: true },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const WithError: Story = {
  args: { error: 'Something went wrong' },
};
```

## File Structure & Naming

- **Co-locate** stories with components: `Button.tsx` + `Button.stories.tsx`
- **Naming convention**: `[ComponentName].stories.tsx`
- **Mirror codebase structure** in Storybook sidebar:
  ```
  src/components/
    ui/Button.stories.tsx         -> UI/Button
    questionnaire/FormField.stories.tsx -> Questionnaire/FormField
  ```

## Mocking Dependencies

### 1. Next.js Navigation (`useParams`, `useRouter`)

Use `parameters.nextjs.navigation`:

```tsx
const meta = {
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        // Mock useParams({ page: 'name' })
        segments: [['page', 'name']],
        // Mock usePathname()
        pathname: '/dashboard',
      },
    },
  },
};

// Override per-story
export const LastPage: Story = {
  parameters: {
    nextjs: {
      navigation: {
        segments: [['page', 'interpreter']],
      },
    },
  },
};
```

### 2. React Context

Export context from provider file, then wrap in decorator:

```tsx
// In provider file
export const MyContext = createContext<MyContextType | null>(null);
export type MyContextType = { ... };

// In stories file
import { MyContext, type MyContextType } from './MyProvider';

function withMockContext(Story: React.ComponentType, { args }) {
  const mockValue: MyContextType = {
    isLoading: false,
    isSaving: args.isSaving ?? false,
    // ... other values from args
  };

  return (
    <MyContext.Provider value={mockValue}>
      <Story />
    </MyContext.Provider>
  );
}
```

### 3. React Hook Form (`useFormContext`)

Wrap with `FormProvider`:

```tsx
import { useForm, FormProvider } from 'react-hook-form';

function withFormProvider(Story: React.ComponentType) {
  const form = useForm({ defaultValues: {} });

  return (
    <FormProvider {...form}>
      <Story />
    </FormProvider>
  );
}
```

### 4. Multiple Providers

Combine in a single decorator:

```tsx
function withMockProviders(Story: React.ComponentType, { args }) {
  const form = useForm({ defaultValues: {} });

  const mockContextValue = {
    isSaving: args.isSaving ?? false,
    saveSuccess: args.saveSuccess ?? false,
  };

  return (
    <FormProvider {...form}>
      <MyContext.Provider value={mockContextValue}>
        <Story />
      </MyContext.Provider>
    </FormProvider>
  );
}
```

## Mock Functions with `fn()`

Use `fn()` from `storybook/test` for callbacks and spies:

```tsx
import { fn } from 'storybook/test';

const mockContextValue = {
  onSave: fn(),
  markPageCompleted: fn(),
  saveImmediate: fn().mockResolvedValue(undefined), // Async
  getPageStatus: () => 'not_started', // Simple return value
};

// In meta for action logging
const meta = {
  args: {
    onClick: fn(),
    onSubmit: fn(),
  },
};
```

## Mock Data Factories

Create reusable mock data to prevent object mutations:

```tsx
// mocks/user.ts
export const createMockUser = (overrides = {}) => ({
  id: '1',
  name: 'John Doe',
  email: 'john@example.com',
  ...overrides,
});

// In stories
export const WithUser: Story = {
  args: {
    user: createMockUser({ name: 'Jane Doe' }),
  },
};
```

## Play Functions & Interaction Testing

Test user interactions directly in stories:

```tsx
import { expect, fn, userEvent, within } from 'storybook/test';

export const FilledForm: Story = {
  args: {
    onSubmit: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    // Find elements (prefer accessible queries)
    const emailInput = canvas.getByLabelText('Email');
    const submitButton = canvas.getByRole('button', { name: 'Submit' });

    // Simulate user interactions
    await userEvent.type(emailInput, 'test@example.com', { delay: 50 });
    await userEvent.click(submitButton);

    // Assert on behavior
    await expect(args.onSubmit).toHaveBeenCalledWith({
      email: 'test@example.com',
    });
  },
};
```

### Query Priority (Accessibility First)

Use queries in this order for accessibility:
1. `getByRole` - Best, uses ARIA roles
2. `getByLabelText` - Form fields
3. `getByPlaceholderText` - If no label
4. `getByText` - Non-interactive elements
5. `getByDisplayValue` - Current input values
6. `getByAltText` - Images
7. `getByTitle` - Tooltips
8. `getByTestId` - **Last resort only**

### Composing Play Functions

Reuse interactions across stories:

```tsx
export const EmptyForm: Story = {
  play: async ({ canvasElement }) => {
    // Setup interactions
  },
};

export const FilledForm: Story = {
  play: async (context) => {
    // Run previous story's play function first
    await EmptyForm.play?.(context);

    // Then add more interactions
    const canvas = within(context.canvasElement);
    await userEvent.type(canvas.getByLabelText('Name'), 'John');
  },
};
```

### Querying Portaled Elements (Modals, Dropdowns)

Use `screen` instead of `canvas` for elements outside component root:

```tsx
import { screen, userEvent, within } from 'storybook/test';

export const OpenModal: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Click trigger inside component
    await userEvent.click(canvas.getByRole('button', { name: 'Open' }));

    // Query modal content from document (portaled)
    const modal = await screen.findByRole('dialog');
    await expect(modal).toBeInTheDocument();
  },
};
```

## Shared Setup with `beforeEach`

Run code before each story in a file:

```tsx
const meta = {
  component: MyComponent,
  beforeEach: async () => {
    // Setup - runs before each story
    localStorage.setItem('theme', 'dark');

    // Return cleanup function
    return () => {
      localStorage.clear();
    };
  },
};
```

## Accessibility Testing

### Enable a11y Addon

```tsx
// .storybook/preview.ts
export const parameters = {
  a11y: {
    // Fail CI on violations
    test: 'error',
  },
};
```

### Override Rules Per-Story

```tsx
export const KnownIssue: Story = {
  parameters: {
    a11y: {
      // Temporarily allow (document why!)
      test: 'todo', // Shows warning instead of error
      config: {
        rules: [
          { id: 'color-contrast', enabled: false }, // Reason: design requirement
        ],
      },
    },
  },
};
```

## Storybook Controls

Expose mock values as args for interactive testing:

```tsx
interface MockContextArgs {
  isSaving?: boolean;
  saveSuccess?: boolean;
  syncError?: string | null;
}

const meta = {
  argTypes: {
    isSaving: { control: 'boolean' },
    saveSuccess: { control: 'boolean' },
    syncError: { control: 'text' },
  },
  decorators: [withMockProviders],
} satisfies Meta<typeof MyComponent & MockContextArgs>;

export const Default: Story = {
  args: {
    isSaving: false,
    saveSuccess: false,
    syncError: null,
  },
};
```

## UI Wrapper Decorators

Add visual context without duplicating component logic:

```tsx
const meta = {
  decorators: [
    // Visual wrapper (runs first, outermost)
    (Story) => (
      <div className="w-full max-w-2xl mx-auto p-4 border rounded-lg">
        <div className="mb-8 p-8 bg-muted/30 rounded text-center">
          [Form fields would appear here]
        </div>
        <Story />
      </div>
    ),
    // Provider wrapper (runs second, wraps Story)
    withMockProviders,
  ],
};
```

## CSF Factories (Storybook 10 Preview)

New typesafe pattern with less boilerplate:

```tsx
// Traditional CSF 3
const meta = { component: Button } satisfies Meta<typeof Button>;
type Story = StoryObj<typeof meta>;
export const Primary: Story = { args: { label: 'Button', primary: true } };

// CSF Factories (preview - React only for now)
const meta = preview.meta({ component: Button });
export const Primary = meta.story({ args: { label: 'Button', primary: true } });
```

## Complete Example

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { useForm, FormProvider } from 'react-hook-form';
import { FormNavigation } from './FormNavigation';
import { QuestionnaireContext, type QuestionnaireContextType } from './QuestionnaireFormProvider';
import { QUESTIONNAIRE_PAGES } from '@/hooks/useQuestionnaireFormRHF';

interface MockContextArgs {
  isSaving?: boolean;
  saveSuccess?: boolean;
  syncError?: string | null;
}

function withMockProviders(Story: React.ComponentType, { args }: { args: MockContextArgs }) {
  const form = useForm({ defaultValues: {} });

  const mockContextValue: QuestionnaireContextType = {
    isLoading: false,
    isSaving: args.isSaving ?? false,
    syncError: args.syncError ?? null,
    saveSuccess: args.saveSuccess ?? false,
    sectionId: 'petitioner',
    pages: QUESTIONNAIRE_PAGES,
    markPageVisited: fn(),
    markPageCompleted: fn(),
    getPageStatus: () => 'not_started',
    saveImmediate: fn().mockResolvedValue(undefined),
    saveDraft: fn().mockResolvedValue(undefined),
    clearSaveStatus: fn(),
    fromReview: false,
    setFromReview: fn(),
  };

  return (
    <FormProvider {...form}>
      <QuestionnaireContext.Provider value={mockContextValue}>
        <Story />
      </QuestionnaireContext.Provider>
    </FormProvider>
  );
}

const meta = {
  title: 'Questionnaire/FormNavigation',
  component: FormNavigation,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    nextjs: {
      appDirectory: true,
      navigation: {
        segments: [['page', 'name']],
      },
    },
  },
  decorators: [withMockProviders],
  argTypes: {
    isSaving: { control: 'boolean' },
    saveSuccess: { control: 'boolean' },
    syncError: { control: 'text' },
  },
} satisfies Meta<typeof FormNavigation & MockContextArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { isSaving: false, saveSuccess: false, syncError: null },
};

export const SaveSuccess: Story = {
  args: { saveSuccess: true },
};

export const LastPage: Story = {
  parameters: {
    nextjs: {
      navigation: {
        segments: [['page', QUESTIONNAIRE_PAGES[QUESTIONNAIRE_PAGES.length - 1].id]],
      },
    },
  },
};

// With interaction test
export const ClickBack: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const backButton = canvas.getByRole('button', { name: /back/i });
    await userEvent.click(backButton);
  },
};
```

## Maintenance Best Practices

1. **Assign ownership** - Each component's stories should have a maintainer
2. **Fix broken stories immediately** - Treat like failing tests
3. **Require stories in PRs** - New components must include stories
4. **Refactor regularly** - Keep stories in sync with component changes
5. **Use tags** to organize large Storybooks:
   ```tsx
   export default {
     tags: ['autodocs', 'experimental'], // or 'deprecated'
   };
   ```

## Checklist

Before creating a story:

- [ ] Import and use the **real component**
- [ ] Identify all hooks/context the component uses
- [ ] Create mock providers for each dependency
- [ ] Export context from provider files if not already exported
- [ ] Use `parameters.nextjs.navigation` for Next.js hooks
- [ ] Expose key state as `args` for Controls panel
- [ ] Use `fn()` for callback props
- [ ] Add visual wrapper decorator if needed for context
- [ ] Include Default story (required props only)
- [ ] Add state-specific stories (loading, error, empty, etc.)
- [ ] Consider adding play functions for interaction tests
- [ ] Use accessible queries (`getByRole` first)
- [ ] Check a11y panel for violations

## Sources

- [Storybook 10 Release](https://storybook.js.org/blog/storybook-10/)
- [10 Storybook Best Practices](https://dev.to/rafaelrozon/10-storybook-best-practices-5a97)
- [Interaction Testing](https://storybook.js.org/docs/writing-tests/interaction-testing)
- [Play Functions](https://storybook.js.org/docs/writing-stories/play-function)
- [Accessibility Testing](https://storybook.js.org/docs/8/writing-tests/accessibility-testing)
