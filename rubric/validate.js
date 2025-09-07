#!/usr/bin/env node
/**
 * Rubric Validation Script with Proper Parser
 * Uses PEG.js grammar to parse .rux files instead of regex
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseRuxFile, extractRulesFromAST, validateFileAgainstRules } from './rux-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI color codes for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

class RubricValidator {
  constructor() {
    this.violations = [];
    this.checkedFiles = 0;
    this.parseErrors = [];
  }

  // Parse a .rux file using the grammar-based parser
  parseAndExtractRules(ruxPath) {
    console.log(`${colors.cyan}Parsing ${path.basename(ruxPath)}...${colors.reset}`);
    
    const parseResult = parseRuxFile(ruxPath);
    
    if (!parseResult.success) {
      this.parseErrors.push({
        file: ruxPath,
        error: parseResult.error
      });
      console.log(`${colors.red}✗ Parse error in ${path.basename(ruxPath)}:${colors.reset}`);
      console.log(`  ${parseResult.error.message}`);
      if (parseResult.error.location) {
        console.log(`  at line ${parseResult.error.location.start.line}, column ${parseResult.error.location.start.column}`);
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
  validateFile(filePath, rules) {
    if (!fs.existsSync(filePath)) {
      this.violations.push({
        file: filePath,
        module: rules.moduleName,
        type: 'missing',
        severity: 'error',
        message: 'File specified in .rux does not exist'
      });
      return;
    }

    this.checkedFiles++;
    
    // Use the new parser-based validation
    const fileViolations = validateFileAgainstRules(filePath, rules);
    
    // Add module name to violations
    fileViolations.forEach(violation => {
      this.violations.push({
        ...violation,
        module: rules.moduleName,
        file: path.relative(process.cwd(), filePath)
      });
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
    console.log(`${colors.blue}🔍 Rubric Validator (Grammar-Based Parser)${colors.reset}`);
    console.log('=' .repeat(50));

    const ruxFiles = this.findRuxFiles(process.cwd());
    console.log(`Found ${ruxFiles.length} .rux files\n`);

    // Separate meta files from component files
    const metaFiles = ['base.rux', 'rubric.rux', 'design-system.rux', 'GlobalSpecs.rux', 'DesignSystem.rux'];
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
      } else if (globalRules) {
        baseRules = globalRules;
      }
      console.log();
    }

    if (componentRuxFiles.length === 0) {
      console.log(`${colors.yellow}⚠️  No component .rux files found!${colors.reset}\n`);
      console.log('To use the validator, create .rux files for your components.');
      console.log('Example: rubric/app/components/Button.rux\n');
      process.exit(0);
    }

    // Parse and validate component files
    for (const ruxFile of componentRuxFiles) {
      const rules = this.parseAndExtractRules(ruxFile);
      
      if (!rules) {
        continue; // Skip if parsing failed
      }
      
      // Merge with base rules if they exist
      if (baseRules) {
        rules.constraints.require.push(...baseRules.constraints.require);
        rules.constraints.deny.push(...baseRules.constraints.deny);
        rules.constraints.warn.push(...baseRules.constraints.warn);
        rules.deniedOperations.push(...baseRules.deniedOperations);
      }
      
      if (rules.location) {
        const targetFile = path.join(process.cwd(), rules.location);
        console.log(`\nValidating ${colors.yellow}${rules.moduleName}${colors.reset} → ${rules.location}`);
        this.validateFile(targetFile, rules);
      } else {
        console.log(`\n${colors.yellow}⚠️  ${rules.moduleName}${colors.reset} has no location specified`);
      }
    }

    console.log('\n' + '='.repeat(50));
    this.printResults();
  }

  printResults() {
    const errors = this.violations.filter(v => v.severity === 'error');
    const warnings = this.violations.filter(v => v.severity === 'warning');

    if (this.parseErrors.length > 0) {
      console.log(`${colors.red}❌ Parse Errors:${colors.reset}\n`);
      for (const parseError of this.parseErrors) {
        console.log(`${colors.red}${path.relative(process.cwd(), parseError.file)}:${colors.reset}`);
        console.log(`  ${parseError.error.message}\n`);
      }
    }

    if (this.violations.length === 0 && this.parseErrors.length === 0) {
      console.log(`${colors.green}✅ All constraints passed!${colors.reset}`);
      console.log(`Validated ${this.checkedFiles} files with 0 violations.`);
      process.exit(0);
    } else if (this.violations.length > 0) {
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
          console.log(`  ${color}${icon}${colors.reset} [${v.module}] ${v.message}${lineInfo}`);
        }
        console.log();
      }

      process.exit(1);
    } else {
      // Only parse errors
      process.exit(1);
    }
  }
}

// Run validator
const validator = new RubricValidator();
validator.run().catch(console.error);