# Rubric (.rux) Language Specification

## Overview
Rubric uses `.rux` files to define architectural constraints for JavaScript/TypeScript modules. Each `.rux` file describes a single module's interface, dependencies, and constraints.

## File Structure
Every `.rux` file must follow this exact structure:

```rux
module ModuleName {
  @ Optional annotations
  type: "module-type"
  location: "path/to/file.ts"
  
  interface { ... }     # Optional
  state { ... }         # Optional
  imports { ... }       # Optional
  constraints { ... }   # Optional
}
```

## Complete Syntax Reference

### 1. Module Declaration
```rux
module ModuleName {   # ModuleName must be a valid identifier
  ...
}
```
- Module names: Letters, numbers, underscores, dollar signs
- Must start with letter, underscore, or dollar sign

### 2. Annotations
```rux
✅ CORRECT:
@ This is an annotation without quotes
@ Multiple annotations are allowed
@ They can appear before declarations or at block start

❌ WRONG:
@ "No quotes allowed in annotations"
@"No space required but recommended"
```

### 3. Type Declaration
```rux
✅ CORRECT:
type: "component"
type: "service"
type: "utility"
type: "store"
type: "hook"
type: "provider"
type: "guard"
type: "data"
type: "presentation"
type: "container"
type: "specification"

❌ WRONG:
type: component        # Missing quotes
type: 'component'      # Wrong quote style
```

### 4. Location Declaration
```rux
✅ CORRECT:
location: "src/components/Button.tsx"
location: "src/services/api-service.ts"

❌ WRONG:
location: src/components/Button.tsx    # Missing quotes
location: 'src/components/Button.tsx'  # Wrong quote style
```

### 5. Interface Block
```rux
interface {
  @ Annotations allowed here
  
  # Function declarations (NO parameters in parentheses)
  function functionName() -> ReturnType
  public function publicFunc() -> Type
  private function privateFunc() -> Type
  protected function protectedFunc() -> Type
  
  # Type declarations
  type TypeName
  public type PublicType
  private type PrivateType
  
  # Property declarations
  propertyName: TypeName
  public propertyName: TypeName
  private propertyName: TypeName
  protected propertyName: TypeName
  readonly propertyName: TypeName
  public readonly CONSTANT: TypeName
  
  # Optional properties
  optionalProp?: TypeName
  propertyName: TypeName?    # Alternative syntax
}
```

#### Interface Examples:
```rux
✅ CORRECT:
interface {
  function getData() -> Promise
  function render() -> JSXElement
  public type UserData
  private cache: Map
  readonly VERSION: string
}

❌ WRONG:
interface {
  function getData(id: string) -> Promise    # No parameters allowed
  getData(): Promise                         # Missing 'function' keyword
  function getData() : Promise               # Wrong arrow syntax
}
```

### 6. State Block
```rux
state {
  @ State properties with visibility modifiers
  private propertyName: TypeName
  protected propertyName: TypeName
  public propertyName: TypeName
  
  # Readonly state
  private readonly CONFIG: Object
  
  # Static properties
  private static instance: Instance
  static count: number
  
  # Optional state
  private currentUser?: User
}
```

#### State Examples:
```rux
✅ CORRECT:
state {
  private isLoading: boolean
  private cache: Map
  private readonly CONFIG: Object
  protected static instance: Singleton
}

❌ WRONG:
state {
  private isLoading: boolean = false    # No initializers
  isLoading                              # Missing type
  private cache: Map<string, any>       # No generics syntax
}
```

### 7. Imports Block
```rux
imports {
  @ Allow imports
  allow "package-name" as external
  allow "./relative/path"
  allow "../parent/path"
  allow "package" as {Component, helper}
  allow "./file" as DefaultName
  
  @ Deny imports (array items MUST be quoted)
  deny imports ["pattern/*", "another/*"]
  
  @ Except clause (optional)
  deny imports ["../services/*"] except: ["../services/auth"]
}
```

#### Import Rules:
1. **Package imports**: Must be quoted strings
2. **'external' keyword**: NEVER quoted (it's a keyword)
3. **Deny arrays**: ALL items must be quoted
4. **Except arrays**: ALL items must be quoted

#### Import Examples:
```rux
✅ CORRECT:
imports {
  allow "react" as external
  allow "lodash" as external
  allow "./Button" as {Button}
  allow "../utils/format" as formatUtils
  allow "../types"
  deny imports ["../services/*", "../data/*"]
  deny imports ["../stores/*"] except: ["../stores/auth"]
}

❌ WRONG:
imports {
  allow react as external                    # Missing quotes on package
  allow "react" as "external"                # 'external' shouldn't be quoted
  deny imports [../services/*, ../data/*]    # Missing quotes in array
  deny imports ["../stores/*"] except: [../stores/auth]  # Missing quotes in except
}
```

### 8. Constraints Block
```rux
constraints {
  @ Constraint types: require, deny, warn
  
  # Pattern constraints (no quotes on patterns)
  require pattern.accessibility
  deny pattern.mutations
  warn pattern.complexity
  
  # IO constraints (no quotes on patterns)
  deny io.console.*
  deny io.network.*
  deny io.localStorage.*
  
  # File constraints with comparisons
  warn file.lines > 200
  deny file.lines > 500
  warn file.complexity > 10
  
  # Import constraints (items must be quoted)
  deny imports ["react", "vue", "@angular/*"]
  
  # Export constraints (items must be quoted)
  deny exports ["_*", "private*", "internal*"]
  require exports ["publicAPI", "default"]
  
  # With exceptions (items must be quoted)
  deny pattern.console except: ["logger", "debug"]
}
```

#### Constraint Patterns:
```rux
# Available prefixes:
pattern.*        # Code patterns
io.*            # Input/output operations
file.*          # File metrics
style.*         # Style rules
security.*      # Security patterns

# Comparison operators:
>   # Greater than
<   # Less than
>=  # Greater than or equal
<=  # Less than or equal
==  # Equal to
```

#### Constraint Examples:
```rux
✅ CORRECT:
constraints {
  require pattern.error_boundary
  deny io.console.*
  deny imports ["axios", "fetch"]
  deny exports ["_*", "test*"]
  warn file.lines > 300
  deny style.inline_styles
  require security.input_validation
}

❌ WRONG:
constraints {
  allow pattern.something           # 'allow' not valid in constraints
  deny "pattern.mutations"          # Pattern shouldn't be quoted
  deny imports [axios, fetch]       # Array items must be quoted
  deny exports without quotes       # Not valid syntax
  warn file.lines > "300"           # Number shouldn't be quoted
}
```

## Common Patterns Reference

### Module Types and Their Typical Patterns

#### Component (Presentation)
```rux
module Button {
  type: "presentation"
  location: "src/components/Button.tsx"
  
  imports {
    allow "react" as external
    allow "../types"
    deny imports ["../services/*", "../stores/*"]
  }
  
  constraints {
    deny io.*
    deny pattern.async_operations
    require pattern.accessibility
    warn file.lines > 150
  }
}
```

#### Service
```rux
module UserService {
  type: "service"
  location: "src/services/user-service.ts"
  
  imports {
    allow "../data/user-data"
    allow "../types"
    deny imports ["../components/*", "../stores/*"]
  }
  
  constraints {
    require pattern.error_handling
    require pattern.input_validation
    deny pattern.jsx_elements
    warn file.lines > 300
  }
}
```

#### Store
```rux
module AppStore {
  type: "store"
  location: "src/stores/app-store.ts"
  
  imports {
    allow "zustand" as external
    allow "../services/api-service"
    deny imports ["../components/*", "../data/*"]
  }
  
  constraints {
    require pattern.immutable_updates
    deny io.network.*
    deny pattern.business_logic
  }
}
```

## Validation Checklist

Before saving any `.rux` file, verify:

### ✅ Quotes Check
- [ ] All type values are quoted: `type: "service"`
- [ ] All location values are quoted: `location: "path/file.ts"`
- [ ] All package names are quoted: `allow "react"`
- [ ] All array items are quoted: `["item1", "item2"]`
- [ ] NO quotes on 'external' keyword: `as external`
- [ ] NO quotes on patterns: `pattern.name`
- [ ] NO quotes on annotations: `@ Text here`

### ✅ Syntax Check
- [ ] Functions use arrow syntax: `function name() -> Type`
- [ ] No function parameters in parentheses
- [ ] All blocks use curly braces `{ }`
- [ ] Each statement on its own line
- [ ] Comparison operators have spaces: `> 200` not `>200`

### ✅ Keywords Check
- [ ] Only `require`, `deny`, `warn` in constraints (no `allow`)
- [ ] `allow` only in imports block
- [ ] `external` is a keyword, not a string
- [ ] Visibility modifiers: `public`, `private`, `protected`

## Error Recovery Guide

### Parse Error: Expected "/*", "//", or [ \t\n\r] but "X" found
**Cause**: Usually means quotes are missing or in wrong place
**Fix**: Check if strings in arrays are quoted

### Parse Error: Expected "*", ".", "/*", "//", "?", "[", or [a-zA-Z_$] but "\"" found
**Cause**: Quotes where they shouldn't be (like on patterns)
**Fix**: Remove quotes from pattern names

### Parse Error: but "@" found
**Cause**: Annotation in wrong place or previous statement incomplete
**Fix**: Ensure previous line is complete, move annotation to valid location

## Quick Reference Card

```rux
# ALWAYS QUOTED
type: "quoted"
location: "quoted"
allow "package-name"
["array", "items", "always", "quoted"]

# NEVER QUOTED
as external              # keyword
pattern.something        # patterns
io.console.*            # io patterns
file.lines > 200        # comparisons
@ annotation text        # annotations

# VALID CONSTRAINT KEYWORDS
require
deny
warn
# (no 'allow' in constraints)

# VALID IMPORT CONSTRUCTS
allow "package" as external
allow "./file" as {Named}
allow "../path" as Default
deny imports ["path/*"]
```