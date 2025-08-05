#!/usr/bin/env node
/**
 * Rubric Validation Script
 * Validates code against architectural constraints defined in .rux files
 * Enhanced with business logic detection in presentation components
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI color codes for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

class RubricValidator {
  constructor() {
    this.violations = [];
    this.checkedFiles = 0;
  }

  // Parse a .rux file and extract rules
  parseRuxFile(ruxPath) {
    const content = fs.readFileSync(ruxPath, 'utf8');
    const rules = {
      moduleName: '',
      location: '',
      allowedImports: [],
      deniedImports: [],
      deniedOperations: [],
      deniedExports: [],
      fileConstraints: {},
      isComponent: false,
      componentType: 'container' // 'presentation' or 'container'
    };

    // Extract module name
    const moduleMatch = content.match(/module\s+(\w+)\s*{/);
    if (moduleMatch) rules.moduleName = moduleMatch[1];

    // Extract location
    const locationMatch = content.match(/location:\s*"([^"]+)"/);
    if (locationMatch) {
      rules.location = locationMatch[1];
      // Determine if this is a component based on path and extension
      if (rules.location.includes('/components/') && 
          (rules.location.endsWith('.tsx') || rules.location.endsWith('.jsx'))) {
        rules.isComponent = true;
      }
    }

    // Check if it's explicitly marked as a presentation component
    if (content.includes('@ "Pure presentation component"') || 
        content.includes('@ "Presentation component"') ||
        content.includes('type: "presentation"')) {
      rules.componentType = 'presentation';
    }

    // Extract allowed imports
    const allowMatches = content.matchAll(/allow\s+"([^"]+)"(?:\s+as\s+(?:{[^}]+}|\w+))?/g);
    for (const match of allowMatches) {
      rules.allowedImports.push(match[1]);
    }

    // Extract denied imports
    const denyImportMatches = content.matchAll(/deny\s+imports\s+\["([^"]+)"\]/g);
    for (const match of denyImportMatches) {
      rules.deniedImports.push(match[1]);
    }

    // Extract denied operations
    const denyOpMatches = content.matchAll(/deny\s+([\w.*]+)(?:\s+@|$)/g);
    for (const match of denyOpMatches) {
      const op = match[1];
      if (!op.includes('imports') && !op.includes('exports') && !op.includes('file.')) {
        rules.deniedOperations.push(op);
      }
    }

    // Extract file constraints
    const fileLinesMatch = content.match(/deny\s+file\.lines\s*>\s*(\d+)/);
    if (fileLinesMatch) {
      rules.fileConstraints.maxLines = parseInt(fileLinesMatch[1]);
    }

    return rules;
  }

  // Validate a TypeScript/JavaScript file against rules
  validateFile(filePath, rules) {
    if (!fs.existsSync(filePath)) {
      this.violations.push({
        file: filePath,
        module: rules.moduleName,
        type: 'missing',
        message: 'File specified in .rux does not exist'
      });
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    this.checkedFiles++;

    // Check file constraints
    if (rules.fileConstraints.maxLines && lines.length > rules.fileConstraints.maxLines) {
      this.addViolation(filePath, rules.moduleName, 'file-size', 
        `File has ${lines.length} lines (max: ${rules.fileConstraints.maxLines})`);
    }

    // Check imports
    this.validateImports(filePath, content, rules);

    // Check operations
    this.validateOperations(filePath, content, rules);

    // Check exports
    this.validateExports(filePath, content, rules);
    this.validateUnusedExports(filePath, content, rules);

    // NEW: Check for business logic in presentation components
    if (rules.isComponent) {
      this.validateBusinessLogic(filePath, content, rules);
    }
  }

  // NEW: Validate business logic in components
  validateBusinessLogic(filePath, content, rules) {
    // Skip validation for certain files
    if (filePath.includes('validate.js') || filePath.includes('.test.') || filePath.includes('.spec.')) {
      return;
    }

    // Determine component type more accurately
    const isPresentationComponent = rules.componentType === 'presentation' ||
      // Check for explicit type in file
      content.includes('Pure presentation component') ||
      content.includes('type: "presentation"') ||
      // Infer from imports - if it doesn't import stores/services, likely presentation
      (!content.includes('useStore') && !content.includes('Service') && 
       rules.deniedImports.some(denied => denied.includes('stores') || denied.includes('services')));

    // For container components (like App.tsx), be more lenient
    const isRootOrContainer = rules.moduleName === 'App' || 
                             rules.location.includes('App.tsx') ||
                             rules.location.includes('Page.tsx') ||
                             content.includes('type: "container"');

    if (!isPresentationComponent && !isRootOrContainer) return;
    if (isRootOrContainer) return; // Skip business logic validation for root/container components
    // Check for error boundaries in container components
    if (rules.componentType === 'container' && !content.includes('componentDidCatch') && !content.includes('ErrorBoundary')) {
      this.addViolation(filePath, rules.moduleName, 'pattern',
        'Container components must implement error boundaries', null, 'error');
    }

    // Check for useEffect hooks in container components
    if (rules.componentType === 'container' && content.includes('useEffect')) {
      this.addViolation(filePath, rules.moduleName, 'pattern',
        'Container components should not use useEffect', null, 'error');
    }
    // UI-specific patterns that are ALLOWED
    const allowedUIPatterns = [
      // Form validation
      /validate\w*(?:Email|Phone|Password|Field|Input|Form)/i,
      // Input formatting
      /format\w*(?:Phone|Date|Currency|Input|Display)/i,
      // UI state
      /(?:is|has|show|hide|toggle)\w*(?:Open|Visible|Active|Disabled|Loading|Submitting)/i,
      // Simple display logic
      /(?:truncate|ellipsis|excerpt|preview)/i,
      // CSS/Style calculations
      /(?:className|cssClass|style|variant)/i,
      // Event handlers
      /handle(?:Click|Change|Submit|Focus|Blur|Key)/i,
      // Simple length/count checks
      /\.\s*length\s*[<>]=?\s*\d+/g,
    ];

    // Check if a code snippet is UI-specific
    const isUISpecific = (codeSnippet) => {
      return allowedUIPatterns.some(pattern => pattern.test(codeSnippet));
    };

    // Business logic patterns to detect
    const businessLogicPatterns = [
      {
        pattern: /async\s+(?:function|\()/g,
        message: 'Async operations should be in services or custom hooks',
        severity: 'error',
        excludeIf: (match, context) => {
          // Allow async form submit handlers and save handlers
          return context.includes('handleSubmit') || 
                 context.includes('onSubmit') ||
                 context.includes('handleSave') ||
                 context.includes('handleLogin') ||
                 context.includes('handleSignup') ||
                 context.includes('handleBudgetUpdate');
        }
      },
      {
        pattern: /\.then\s*\(/g,
        message: 'Promise handling should be in services or custom hooks',
        severity: 'error'
      },
      {
        pattern: /await\s+/g,
        message: 'Await operations should be in services or custom hooks',
        severity: 'error',
        excludeIf: (match, context) => {
          // Allow await in form handlers
          return context.includes('handleSubmit') || 
                 context.includes('onSubmit') ||
                 context.includes('handleSave') ||
                 context.includes('handleLogin') ||
                 context.includes('handleSignup') ||
                 context.includes('handleBudgetUpdate') ||
                 context.includes('handle') && context.includes('submit');
        }
      },
      {
        pattern: /try\s*{\s*[\s\S]*?}\s*catch/g,
        message: 'Complex error handling should be in services or custom hooks',
        severity: 'warning',
        excludeIf: (match, context) => {
          // Allow simple try-catch for form submission
          const lines = match[0].split('\n').length;
          return lines < 5 && context.includes('submit');
        }
      },
      {
        pattern: /fetch\s*\(/g,
        message: 'API calls must not be in presentation components',
        severity: 'error'
      },
      {
        pattern: /localStorage\.|sessionStorage\./g,
        message: 'Storage operations must not be in presentation components',
        severity: 'error'
      },
      {
        pattern: /\.reduce\s*\(\s*\([^)]*\)\s*=>\s*{[\s\S]*?}\s*,/g,
        message: 'Complex data transformations should be in utilities or services',
        severity: 'warning',
        excludeIf: (match) => {
          // Allow simple reduces for UI calculations
          const lines = match[0].split('\n').length;
          return lines < 3;
        }
      },
      {
        pattern: /function\s+(\w+)\s*\([^)]*\)\s*{\s*(?:(?!return)[^}]){50,}/g,
        message: 'Complex functions should be extracted to hooks or services',
        severity: 'warning',
        excludeIf: (match, context, funcName) => {
          // Allow if it's a UI-specific function
          return isUISpecific(funcName);
        }
      }
    ];

    // Domain-specific business logic patterns
    const domainPatterns = [
      {
        pattern: /(?:convert|exchange|transform)(?:Currency|Amount|Rate)/gi,
        message: 'Currency business logic should be in services',
        severity: 'error'
      },
      {
        pattern: /(?:calculate|compute)(?:Tax|Total|Discount|Price|Cost|Budget)/gi,
        message: 'Financial calculations should be in utilities or services',
        severity: 'error'
      },
      {
        pattern: /(?:validate|verify)(?:Budget|Expense|Transaction|Approval)/gi,
        message: 'Domain validation should be in services',
        severity: 'error'
      },
      {
        pattern: /(?:process|parse|extract)(?:Receipt|Invoice|Document|Data)/gi,
        message: 'Document processing should be in services',
        severity: 'error'
      },
      {
        pattern: /(?:generate|create)(?:Report|Export|PDF|CSV)/gi,
        message: 'Report generation should be in services',
        severity: 'error'
      }
    ];

    // Combine patterns
    const allPatterns = [...businessLogicPatterns, ...domainPatterns];

    // Detect business logic
    allPatterns.forEach(({ pattern, message, severity, excludeIf }) => {
      const matches = [...content.matchAll(pattern)];
      if (matches.length > 0) {
        matches.forEach(match => {
          const lineNum = this.getLineNumber(content, match.index);
          const contextStart = Math.max(0, match.index - 50);
          const contextEnd = Math.min(content.length, match.index + match[0].length + 50);
          const context = content.slice(contextStart, contextEnd).replace(/\n/g, ' ').trim();
          
          // Check if this should be excluded
          if (excludeIf) {
            const funcNameMatch = match[1]; // For function name captures
            if (excludeIf(match, context, funcNameMatch)) {
              return; // Skip this match
            }
          }
          
          // Check if it's UI-specific logic (for certain patterns)
          if (severity === 'warning' && isUISpecific(context)) {
            return; // Skip UI-specific logic
          }
          
          this.addViolation(filePath, rules.moduleName, 'business-logic',
            `${message}. Found: "${match[0].substring(0, 50)}..."`, lineNum, severity);
        });
      }
    });

    // Check for state management that's too complex
    const stateHookPattern = /useState\s*(?:<[^>]+>)?\s*\(/g;
    const stateHooks = [...content.matchAll(stateHookPattern)];
    if (stateHooks.length > 5) {
      this.addViolation(filePath, rules.moduleName, 'business-logic',
        `Too many state hooks (${stateHooks.length}). Consider extracting complex state logic to a custom hook`, 
        null, 'warning');
    }

    // Check for multiple useEffect hooks (often indicates business logic)
    const effectHookPattern = /useEffect\s*\(/g;
    const effectHooks = [...content.matchAll(effectHookPattern)];
    if (effectHooks.length > 2) {
      this.addViolation(filePath, rules.moduleName, 'business-logic',
        `Multiple useEffect hooks (${effectHooks.length}) suggest business logic. Consider extracting to custom hooks`, 
        null, 'warning');
    }
  }

  validateImports(filePath, content, rules) {
    // Find all import statements
    const importRegex = /import\s+(?:{[^}]+}|[\w\s,*]+)\s+from\s+['"]([^'"]+)['"]/g;
    const matches = [...content.matchAll(importRegex)];

    for (const match of matches) {
      const importPath = match[1];
      const lineNum = this.getLineNumber(content, match.index);

      // Check denied imports
      for (const denied of rules.deniedImports) {
        if (this.matchesPattern(importPath, denied)) {
          this.addViolation(filePath, rules.moduleName, 'import',
            `Forbidden import '${importPath}' matches pattern '${denied}'`, lineNum);
        }
      }

      // If there are allowed imports specified, check if this import is allowed
      if (rules.allowedImports.length > 0) {
        const isAllowed = rules.allowedImports.some(allowed => 
          this.matchesPattern(importPath, allowed));
        
        if (!isAllowed) {
          this.addViolation(filePath, rules.moduleName, 'import',
            `Import '${importPath}' is not in allowed list`, lineNum);
        }
      }
    }
  }

  validateOperations(filePath, content, rules) {
    for (const operation of rules.deniedOperations) {
      // Handle different operation types
      if (operation === 'io.console.*') {
        const consoleRegex = /console\.(log|warn|error|info|debug|trace)/g;
        const matches = [...content.matchAll(consoleRegex)];
        for (const match of matches) {
          const lineNum = this.getLineNumber(content, match.index);
          this.addViolation(filePath, rules.moduleName, 'operation',
            `Forbidden console operation: ${match[0]}`, lineNum);
        }
      }

      if (operation === 'io.network.*') {
        const networkPatterns = [
          /fetch\s*\(/g,
          /axios\./g,
          /XMLHttpRequest/g,
          /\.get\s*\(/g,
          /\.post\s*\(/g
        ];
        
        for (const pattern of networkPatterns) {
          const matches = [...content.matchAll(pattern)];
          for (const match of matches) {
            const lineNum = this.getLineNumber(content, match.index);
            this.addViolation(filePath, rules.moduleName, 'operation',
              `Forbidden network operation: ${match[0]}`, lineNum);
          }
        }
      }

      if (operation === 'io.localStorage.*') {
        const storageRegex = /localStorage\.(getItem|setItem|removeItem|clear)/g;
        const matches = [...content.matchAll(storageRegex)];
        for (const match of matches) {
          const lineNum = this.getLineNumber(content, match.index);
          this.addViolation(filePath, rules.moduleName, 'operation',
            `Forbidden localStorage operation: ${match[0]}`, lineNum);
        }
      }
    }
  }

  validateExports(filePath, content, rules) {
    // This is simplified - in production you'd use an AST parser
    const exportRegex = /export\s+(?:const|let|var|function|class)\s+(\w+)/g;
    const matches = [...content.matchAll(exportRegex)];

    for (const match of matches) {
      const exportName = match[1];
      const lineNum = this.getLineNumber(content, match.index);

      // Check if exporting private members
      if (exportName.startsWith('_')) {
        this.addViolation(filePath, rules.moduleName, 'export',
          `Exporting private member: ${exportName}`, lineNum);
      }
    }
  }

  validateUnusedExports(filePath, content, rules) {
    // Only check utility modules
    if (!filePath.includes('/utils/')) return;
    
    const exportRegex = /export\s+(?:const|function|class)\s+(\w+)/g;
    const exports = [...content.matchAll(exportRegex)].map(m => m[1]);
    
    // For each export, check if it's imported anywhere
    exports.forEach(exportName => {
      // This is a simple check - could be enhanced
      const importPattern = new RegExp(`import.*{[^}]*${exportName}[^}]*}.*from.*${path.basename(filePath, '.ts')}`);
      
      // Would need to scan all files - for now just add warning
      this.addViolation(filePath, rules.moduleName, 'unused-export',
        `Exported function '${exportName}' may be unused - verify it's imported elsewhere`, 
        null, 'warning');
    });
  }  

  matchesPattern(path, pattern) {
    // Handle wildcards in patterns
    if (pattern.includes('*')) {
      const regexPattern = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      return new RegExp(regexPattern).test(path);
    }
    return path.includes(pattern);
  }

  getLineNumber(content, index) {
    return content.substring(0, index).split('\n').length;
  }

  addViolation(file, module, type, message, line = null, severity = 'error') {
    this.violations.push({
      file: path.relative(process.cwd(), file),
      module,
      type,
      message,
      line,
      severity
    });
  }

  // Find all .rux files in project
  findRuxFiles(dir, files = []) {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        this.findRuxFiles(fullPath, files);
      } else if (item.endsWith('.rux')) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  // Main validation runner
  async run() {
    console.log(`${colors.blue}🔍 Rubric Validator (Enhanced)${colors.reset}`);
    console.log('=' .repeat(50));

    const ruxFiles = this.findRuxFiles(process.cwd());
    console.log(`Found ${ruxFiles.length} .rux files\n`);

    for (const ruxFile of ruxFiles) {
      const rules = this.parseRuxFile(ruxFile);
      if (rules.location) {
        const targetFile = path.join(process.cwd(), rules.location);
        console.log(`Checking ${colors.yellow}${rules.moduleName}${colors.reset} → ${rules.location}`);
        this.validateFile(targetFile, rules);
      }
    }

    console.log('\n' + '='.repeat(50));
    this.printResults();
  }

  printResults() {
    const errors = this.violations.filter(v => v.severity === 'error');
    const warnings = this.violations.filter(v => v.severity === 'warning');

    if (this.violations.length === 0) {
      console.log(`${colors.green}✅ All constraints passed!${colors.reset}`);
      console.log(`Validated ${this.checkedFiles} files with 0 violations.`);
      process.exit(0);
    } else {
      console.log(`${colors.red}❌ Found ${errors.length} errors and ${warnings.length} warnings:${colors.reset}\n`);
      
      // Group violations by file
      const byFile = {};
      for (const violation of this.violations) {
        if (!byFile[violation.file]) byFile[violation.file] = [];
        byFile[violation.file].push(violation);
      }

      // Print violations
      for (const [file, violations] of Object.entries(byFile)) {
        console.log(`${colors.yellow}${file}:${colors.reset}`);
        for (const v of violations) {
          const lineInfo = v.line ? `:${v.line}` : '';
          const icon = v.severity === 'error' ? '✗' : '⚠';
          const color = v.severity === 'error' ? colors.red : colors.yellow;
          console.log(`  ${color}${icon}${colors.reset} [${v.type}] ${v.message}${lineInfo}`);
        }
        console.log();
      }

      // Business logic refactoring suggestions
      const businessLogicViolations = this.violations.filter(v => v.type === 'business-logic');
      if (businessLogicViolations.length > 0) {
        console.log(`${colors.blue}💡 Refactoring Suggestions:${colors.reset}`);
        console.log('Consider extracting business logic to:');
        console.log('  - Custom hooks (src/hooks/) for reusable logic');
        console.log('  - Services (src/services/) for API and data processing');
        console.log('  - Utilities (src/utils/) for pure functions');
        console.log('  - Store actions for state management logic\n');
      }

      // Only fail on errors, not warnings
      process.exit(errors.length > 0 ? 1 : 0);
    }
  }
}

// Run validator if called directly
const validator = new RubricValidator();
validator.run().catch(err => {
  console.error(`${colors.red}Error:${colors.reset}`, err);
  process.exit(2);
});