# Changelog

All notable changes to Rubric will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-08-19

### Added
- Initial release of Rubric constraint-driven architecture language
- `.rux` file format for defining architectural constraints
- Regex-based validation engine (`validate.js`)
- Template system for common module types
- GlobalSpecs and DesignSystem constraints
- Integration with Cursor IDE via `.cursorrules`

### Features
- Module-level constraint definitions
- Import/export restrictions
- Operation denial patterns (console, DOM, etc.)
- File size and complexity constraints
- Style separation enforcement
- Business logic detection in presentation components
- Code duplication detection
- Multi-file validation with detailed error reporting

### Module Types Supported
- Container components
- Presentation components
- Services
- Data layers
- Guards
- Hooks
- Providers
- State management
- Utilities
