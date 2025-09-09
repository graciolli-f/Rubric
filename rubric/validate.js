#!/usr/bin/env node
/**
 * Enhanced Rubric Validator with Multi-Error Detection
 * Finds multiple syntax errors and still validates TypeScript files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseRuxFileWithRecovery, extractRulesFromAST, validateFileAgainstRules } from './rux-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI color codes for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m'
};

class EnhancedRubricValidator {
  constructor() {
    this.syntaxErrors = [];
    this.violations = [];
    this.checkedFiles = 0;
    this.ruxFilesProcessed = 0;
  }

  // Parse a .rux file with error recovery
  parseAndExtractRules(ruxPath) {
    console.log(`${colors.cyan}Parsing ${path.basename(ruxPath)}...${colors.reset}`);
    
    const parseResult = parseRuxFileWithRecovery(ruxPath);
    this.ruxFilesProcessed++;
    
    if (!parseResult.success) {
      console.log(`${colors.red}✗ Found ${parseResult.errors.length} syntax errors${colors.reset}`);
      
      // Store all syntax errors
      parseResult.errors.forEach(error => {
        this.syntaxErrors.push({
          file: ruxPath,
          error
        });
      });
      
      // Show first few errors in console
      const errorsToShow = Math.min(3, parseResult.errors.length);
      for (let i = 0; i < errorsToShow; i++) {
        const error = parseResult.errors[i];
        if (error.location) {
          console.log(`  Line ${error.location.start.line}: ${error.message}`);
        } else {
          console.log(`  ${error.message}`);
        }
      }
      if (parseResult.errors.length > errorsToShow) {
        console.log(`  ... and ${parseResult.errors.length - errorsToShow} more errors`);
      }
      
      // Return fallback rules if available
      if (parseResult.fallbackRules) {
        console.log(`${colors.yellow}⚠ Using fallback extraction for validation${colors.reset}`);
        return parseResult.fallbackRules;
      }
      
      return null;
    }
    
    console.log(`${colors.green}✓ Successfully parsed${colors.reset}`);
    
    // Extract rules from AST
    const rules = extractRulesFromAST(parseResult.ast);
    
    // Debug output
    console.log(`  Module: ${rules.moduleName}`);
    console.log(`  Type: ${rules.type || 'not specified'}`);
    console.log(`  Location: ${rules.location || 'not specified'}`);
    console.log(`  Constraints: ${rules.constraints.require.length} require, ${rules.constraints.deny.length} deny, ${rules.constraints.warn.length} warn`);
    
    return rules;
  }

  // Validate a TypeScript/JavaScript file against rules
  validateFile(filePath, rules, moduleName) {
    if (!fs.existsSync(filePath)) {
      this.violations.push({
        file: filePath,
        module: moduleName,
        type: 'missing',
        severity: 'error',
        message: 'File specified in .rux does not exist'
      });
      return;
    }

    this.checkedFiles++;
    
    // Use the validation function
    const fileViolations = validateFileAgainstRules(filePath, rules);
    
    // Add module name and file path to violations
    fileViolations.forEach(violation => {
      this.violations.push({
        ...violation,
        module: moduleName,
        file: path.relative(process.cwd(), filePath)
      });
    });
    
    console.log(`  Found ${fileViolations.length} violations in TypeScript file`);
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
    console.log(`${colors.blue}🔍 Enhanced Rubric Validator${colors.reset}`);
    console.log('=' .repeat(50));

    const ruxFiles = this.findRuxFiles(process.cwd());
    console.log(`Found ${ruxFiles.length} .rux files\n`);

    // Separate meta files from component files
    const metaFiles = ['base.rux', 'rubric.rux', 'design-system.rux', 'globalspecs.rux', 'designsystem.rux'];
    const componentRuxFiles = ruxFiles.filter(f => !metaFiles.some(meta => path.basename(f).toLowerCase() === meta.toLowerCase()));
    const foundMetaFiles = ruxFiles.filter(f => metaFiles.some(meta => path.basename(f).toLowerCase() === meta.toLowerCase()));

    // Parse base/global files first if they exist
    let baseRules = null;
    const baseRuxPath = foundMetaFiles.find(f => path.basename(f).toLowerCase() === 'base.rux');
    const globalSpecsPath = foundMetaFiles.find(f => path.basename(f).toLowerCase() === 'globalspecs.rux');
    
    if (baseRuxPath) {
      baseRules = this.parseAndExtractRules(baseRuxPath);
      console.log();
    }
    
    if (globalSpecsPath) {
      const globalRules = this.parseAndExtractRules(globalSpecsPath);
      if (globalRules && baseRules) {
        // Merge global rules into base rules
        baseRules.constraints.require.push(...globalRules.constraints.require);
        baseRules.constraints.deny.push(...globalRules.constraints.deny);
        baseRules.constraints.warn.push(...globalRules.constraints.warn);
        baseRules.deniedImports.push(...globalRules.deniedImports);
        baseRules.deniedOperations.push(...globalRules.deniedOperations);
      } else if (globalRules) {
        baseRules = globalRules;
      }
      console.log();
    }

    // Parse and validate component files
    for (const ruxFile of componentRuxFiles) {
      const rules = this.parseAndExtractRules(ruxFile);
      
      if (!rules) {
        console.log(`${colors.red}⚠ Skipping validation due to parse failures${colors.reset}\n`);
        continue;
      }
      
      // Merge with base rules if they exist
      if (baseRules) {
        rules.constraints.require.push(...baseRules.constraints.require);
        rules.constraints.deny.push(...baseRules.constraints.deny);
        rules.constraints.warn.push(...baseRules.constraints.warn);
        rules.deniedImports.push(...baseRules.deniedImports);
        rules.deniedOperations.push(...baseRules.deniedOperations);
      }
      
      if (rules.location) {
        const targetFile = path.join(process.cwd(), rules.location);
        console.log(`${colors.magenta}Validating TypeScript:${colors.reset} ${rules.location}`);
        this.validateFile(targetFile, rules, rules.moduleName);
      } else {
        console.log(`${colors.yellow}⚠ ${rules.moduleName}${colors.reset} has no location specified`);
      }
      console.log();
    }

    console.log('='.repeat(50));
    this.printResults();
  }

  printResults() {
    const syntaxErrorCount = this.syntaxErrors.reduce((sum, item) => sum + item.error.length || 1, 0);
    const violationErrors = this.violations.filter(v => v.severity === 'error');
    const violationWarnings = this.violations.filter(v => v.severity === 'warning');

    console.log(`${colors.cyan}📊 Validation Summary${colors.reset}\n`);
    console.log(`  .rux files processed: ${this.ruxFilesProcessed}`);
    console.log(`  TypeScript files validated: ${this.checkedFiles}`);
    console.log(`  Total syntax errors: ${this.syntaxErrors.length}`);
    console.log(`  Total constraint violations: ${this.violations.length}`);
    console.log();

    // Print syntax errors
    if (this.syntaxErrors.length > 0) {
      console.log(`${colors.red}❌ Syntax Errors in .rux Files:${colors.reset}\n`);
      
      const byFile = {};
      for (const item of this.syntaxErrors) {
        const fileName = path.relative(process.cwd(), item.file);
        if (!byFile[fileName]) byFile[fileName] = [];
        
        if (Array.isArray(item.error)) {
          byFile[fileName].push(...item.error);
        } else {
          byFile[fileName].push(item.error);
        }
      }
      
      for (const [file, errors] of Object.entries(byFile)) {
        console.log(`${colors.yellow}${file}:${colors.reset}`);
        errors.forEach((error, index) => {
          if (index >= 10) {
            if (index === 10) {
              console.log(`  ${colors.cyan}... ${errors.length - 10} more errors${colors.reset}`);
            }
            return;
          }
          
          const lineInfo = error.location ? `:${error.location.start.line}` : '';
          console.log(`  ${colors.red}✗${colors.reset} ${error.message}${lineInfo}`);
        });
        console.log();
      }
    }

    // Print constraint violations
    if (this.violations.length > 0) {
      console.log(`${colors.red}❌ Constraint Violations:${colors.reset}`);
      console.log(`  ${violationErrors.length} errors, ${violationWarnings.length} warnings\n`);
      
      // Group violations by file
      const byFile = {};
      for (const violation of this.violations) {
        if (!byFile[violation.file]) byFile[violation.file] = [];
        byFile[violation.file].push(violation);
      }

      // Print violations
      for (const [file, violations] of Object.entries(byFile)) {
        console.log(`${colors.yellow}${file}:${colors.reset}`);
        
        // Sort by line number
        violations.sort((a, b) => (a.line || 0) - (b.line || 0));
        
        violations.forEach((v, index) => {
          if (index >= 15) {
            if (index === 15) {
              console.log(`  ${colors.cyan}... ${violations.length - 15} more violations${colors.reset}`);
            }
            return;
          }
          
          const lineInfo = v.line ? `:${v.line}` : '';
          const icon = v.severity === 'error' ? '✗' : '⚠';
          const color = v.severity === 'error' ? colors.red : colors.yellow;
          const methodLabel = v.validationMethod === 'ast' 
            ? `${colors.green}[AST]${colors.reset}` 
            : v.validationMethod === 'regex-fallback'
            ? `${colors.yellow}[REG]${colors.reset}`
            : '';
          console.log(`  ${color}${icon}${colors.reset} ${methodLabel} [${v.module}] ${v.message}${lineInfo}`);
        });
        console.log();
      }
    }

    // Final status
    if (this.syntaxErrors.length === 0 && this.violations.length === 0) {
      console.log(`${colors.green}✅ All checks passed!${colors.reset}`);
      console.log(`No syntax errors or constraint violations found.`);
      process.exit(0);
    } else {
      const totalIssues = syntaxErrorCount + this.violations.length;
      console.log(`${colors.red}❌ Found ${totalIssues} total issues${colors.reset}`);
      console.log(`Fix the syntax errors and constraint violations above.`);
      process.exit(1);
    }
  }
}

// Run validator
const validator = new EnhancedRubricValidator();
validator.run().catch(console.error);