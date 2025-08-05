# Rubric Architecture Guide

This project uses Rubric (.rux files) to enforce clean architecture. Rubric is a constraint-driven approach to writing code. Rubric is *NOT* a suggestion. Rubric is *NOT* documentation. Rubric is LAW that should precede and inform all code. 

## Process you must follow when writing any code for this code base

For each new module:
1. CREATE .rux file first (using template) if one does not already exist
2. Check for and resolve all conflicts within .rux files before continuing
3. PLAN code to fit constraints  
4. WRITE code following the spec
5. RUN `node rubric/validate.js` → must show "All constraints passed!"
6. If violations exist → fix code (not .rux files)
7. Repeat until clean validation

## IMPORTANT: Existing .rux files may only be appended, individual lines may not be modified

**You MUST validate all rux and code changes. And all validation must pass.**

## How Rubric Works

1. Every code file has a matching .rux file that defines its constraints
2. The .rux file location mirrors the code location: `rubric/app/components/Button.rux` → `src/components/Button.tsx`
3. The 'constraint' section of the .rux file trumps all others, no exceptions, no overrides

## Required Workflow

### Step 1: Before Writing ANY Code
1. Check if a .rux file exists for the module
2. Read the constraints in the .rux file
3. Plan your code to follow those constraints

### Step 2: For New Modules
1. FIRST: Create the .rux file in rubric/app/[matching-path]/
2. Use rubric/module.rux.template as your starting point
3. Replace placeholders and remove sections you don't need
4. Run `node rubric/rux-validate.js` and fix any conflicts
5. THEN: Write the code following the rubric file spec
6. FINALLY: Run `node rubric/validate.js` - must show "All constraints passed!"

### Step 3: For Existing Modules
1. **NEVER** modify .rux files to make your code work
2. Read the existing rubric spec
3. Write code that follows the corresponding rubric spec
4. Validate the code with rubric/validate.js

## Need Different Permissions?

If a constraint prevents you from doing something:
1. Create a NEW module with appropriate permissions
2. Create its .rux file with the permissions you need
3. Have your original module use this new module
4. Follow the architecture patterns of the existing modules

Example: Component needs console.log but it's denied?
```bash
# 1. Create new module with permission
rubric/app/utils/logger.rux  # with: allow io.console.*
src/utils/logger.ts

# 2. Import and use from your component
import { logger } from '../utils/logger';
```

## Component Relationships (IMPORTANT POINT)
Container components can import their related components. If a component's primary purpose is to orchestrate other components, it should be able to import them:

- A list component can import both item and item-edit components
- A page component can import all components it needs to compose
- A modal trigger can import the modal it triggers

This is different from breaking layer boundaries (like importing services or data layers).

## Common Bug Prevention Checklist
Run through this checklist for every module:
1. ✓ Immutability: Create new objects instead of mutating
2. ✓ Input validation: Validate all user inputs before processing
3. ✓ Async guards: Prevent race conditions in async operations  
4. ✓ Dead code: Remove unused exports and functions
5. ✓ Error handling: Implement proper error boundaries for containers
6. ✓ Prefer CSS: Use CSS for styling/animations over JavaScript when possible
7. ✓ Cleanup: Handle component unmounting, clear timers, remove listeners
8. ✓ State initialization: Ensure proper initial states and handle edge cases

## Directory Structure
```
src/                    # Your code
rubric/app/            # Constraints (mirrors src/)
validate.js            # Validation script (run after EVERY change)
```

## Remember

1. **Always run `node validate.js`** - no exceptions
2. **Never skip validation** - it ensures clean architecture
3. **Fix violations immediately** - don't accumulate technical debt
4. **Constraints are immutable** - change your code, not the rules

The validation scripts are your quality gates. Use them.