import fs from 'fs';
import path from 'path';
import { parse } from '@typescript-eslint/typescript-estree';
import * as parser from './rux-parser-generated.js';

/**
 * Parse a .rux file into an AST (Abstract Syntax Tree)
 */
export function parseRuxFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  try {
    const ast = parser.parse(content);
    return { success: true, ast };
  } catch (error) {
    return { 
      success: false, 
      error: {
        message: error.message,
        location: error.location,
        found: error.found,
        expected: error.expected
      }
    };
  }
}

/**
 * Extract rules from the parsed AST
 */
export function extractRulesFromAST(ast) {
  const rules = {
    moduleName: '',
    type: '',
    location: '',
    allowedImports: [],
    deniedImports: [],
    deniedOperations: [],
    constraints: {
      require: [],
      deny: [],
      warn: []
    },
    interface: {},
    state: {}
  };

  // Extract module name
  rules.moduleName = ast.name;

  // Process module body
  for (const item of ast.body) {
    switch (item.type) {
      case 'TypeDeclaration':
        rules.type = item.value;
        break;

      case 'LocationDeclaration':
        rules.location = item.value;
        break;

      case 'Imports':
        processImports(item, rules);
        break;

      case 'Constraints':
        processConstraints(item, rules);
        break;

      case 'Interface':
        rules.interface = processInterface(item);
        break;

      case 'State':
        rules.state = processState(item);
        break;
    }
  }

  return rules;
}

function processImports(importsNode, rules) {
  for (const rule of importsNode.rules) {
    if (rule.type === 'AllowRule') {
      rules.allowedImports.push({
        path: rule.path,
        alias: rule.alias,
        exceptions: rule.exceptions || []
      });
    } else if (rule.type === 'DenyRule') {
      rules.deniedImports.push(...rule.patterns);
    }
  }
}

function processConstraints(constraintsNode, rules) {
  for (const rule of constraintsNode.rules) {
    if (rule.type === 'Annotation') continue;

    const constraintData = {
      pattern: rule.pattern,
      comparison: rule.comparison,
      comment: rule.comment,
      exceptions: rule.exceptions || []
    };

    switch (rule.type) {
      case 'RequireRule':
        rules.constraints.require.push(constraintData);
        break;
      
      case 'DenyConstraintRule':
        rules.constraints.deny.push(constraintData);
        // Also add to deniedOperations for backward compatibility
        if (rule.pattern && (rule.pattern.startsWith('io.') || rule.pattern.startsWith('pattern.'))) {
          rules.deniedOperations.push(rule.pattern);
        }
        break;
      
      case 'WarnRule':
        rules.constraints.warn.push(constraintData);
        break;

      case 'DenyExportsRule':
        rules.constraints.deny.push({
          pattern: 'exports',
          patterns: rule.patterns,
          exceptions: rule.exceptions || []
        });
        break;

      case 'DenyImportsRule':
        rules.deniedImports.push(...rule.patterns);
        break;
    }
  }
}

function processInterface(interfaceNode) {
  const methods = {};
  const properties = {};

  for (const member of interfaceNode.members) {
    if (member.type === 'FunctionDeclaration') {
      methods[member.name] = {
        returnType: member.returnType,
        visibility: member.visibility
      };
    } else if (member.type === 'PropertyDeclaration') {
      properties[member.name] = {
        type: member.type,
        readonly: member.readonly,
        visibility: member.visibility
      };
    }
  }

  return { methods, properties };
}

function processState(stateNode) {
  const properties = {};

  for (const member of stateNode.members) {
    if (member.type === 'StateProperty') {
      properties[member.name] = {
        type: member.type,
        visibility: member.visibility,
        isStatic: member.isStatic,
        readonly: member.readonly,
        initializer: member.initializer
      };
    }
  }

  return properties;
}

/**
 * Parse a .rux file with error recovery to find multiple syntax errors
 */
export function parseRuxFileWithRecovery(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const errors = [];
  
  // First, try to parse the whole file
  try {
    const ast = parser.parse(content);
    return { success: true, ast, errors: [] };
  } catch (error) {
    errors.push({
      message: error.message,
      location: error.location,
      found: error.found,
      expected: error.expected
    });
  }
  
  // If full parse failed, try to identify common syntax errors
  const syntaxErrors = findCommonSyntaxErrors(content, lines);
  errors.push(...syntaxErrors);
  
  // Try to extract what we can with regex fallback
  const fallbackRules = extractRulesWithRegex(content, lines);
  
  return { 
    success: false, 
    errors,
    fallbackRules 
  };
}

/**
 * Find common syntax errors in .rux files
 */
function findCommonSyntaxErrors(content, lines) {
  const errors = [];
  
  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();
    
    // Check for quoted annotations
    if (trimmed.startsWith('@ "') || trimmed.startsWith('@"')) {
      errors.push({
        message: 'Annotations should not be quoted',
        location: { start: { line: lineNum, column: line.indexOf('@') + 1 } }
      });
    }
    
    // Check for unquoted type/location/version values
    if (trimmed.startsWith('type:') && !trimmed.includes('"') && !trimmed.includes("'")) {
      errors.push({
        message: 'type value must be quoted',
        location: { start: { line: lineNum, column: line.indexOf(':') + 2 } }
      });
    }
    
    if (trimmed.startsWith('location:') && !trimmed.includes('"') && !trimmed.includes("'")) {
      errors.push({
        message: 'location value must be quoted',
        location: { start: { line: lineNum, column: line.indexOf(':') + 2 } }
      });
    }
    
    if (trimmed.startsWith('version:') && !trimmed.includes('"') && !trimmed.includes("'")) {
      errors.push({
        message: 'version value must be quoted',
        location: { start: { line: lineNum, column: line.indexOf(':') + 2 } }
      });
    }
    
    // Check for function parameters
    if (trimmed.includes('function') && trimmed.includes('(') && !trimmed.includes('()')) {
      const match = trimmed.match(/function\s+\w+\s*\([^)]+\)/);
      if (match) {
        errors.push({
          message: 'Functions in interface should not have parameters, use empty parentheses ()',
          location: { start: { line: lineNum, column: line.indexOf('(') + 1 } }
        });
      }
    }
    
    // Check for generic syntax
    if (trimmed.includes('<') && trimmed.includes('>') && !trimmed.includes('>=') && !trimmed.includes('<=')) {
      errors.push({
        message: 'Generic type syntax (e.g., Array<Type>) is not supported',
        location: { start: { line: lineNum, column: line.indexOf('<') + 1 } }
      });
    }
    
    // Check for state property initializers
    if (trimmed.match(/^\s*(private|protected|public)?\s*(static)?\s*(readonly)?\s*\w+\s*:\s*\w+\s*=\s*/)) {
      errors.push({
        message: 'State properties should not have initializers',
        location: { start: { line: lineNum, column: line.indexOf('=') + 1 } }
      });
    }
    
    // Check for union types
    if (trimmed.includes('|') && trimmed.includes(':') && !trimmed.includes('||')) {
      const colonIndex = trimmed.indexOf(':');
      const pipeIndex = trimmed.indexOf('|');
      if (pipeIndex > colonIndex) {
        errors.push({
          message: 'Union types are not supported',
          location: { start: { line: lineNum, column: line.indexOf('|') + 1 } }
        });
      }
    }
    
    // Check for 'allow' keyword in constraints block
    const inConstraints = isInBlock(lines, index, 'constraints');
    if (inConstraints && trimmed.startsWith('allow ')) {
      errors.push({
        message: "'allow' is not valid in constraints block",
        location: { start: { line: lineNum, column: line.indexOf('allow') + 1 } }
      });
    }
    
    // Check for incorrectly quoted 'external' keyword
    if (trimmed.includes('as "external"') || trimmed.includes("as 'external'")) {
      errors.push({
        message: "'external' is a keyword and should not be quoted",
        location: { start: { line: lineNum, column: line.indexOf('external') + 1 } }
      });
    }
    
    // Check for unquoted paths in import arrays
    const importsBlock = isInBlock(lines, index, 'imports');
    if (importsBlock && trimmed.includes('[')) {
      const arrayMatch = trimmed.match(/\[([^\]]+)\]/);
      if (arrayMatch) {
        const items = arrayMatch[1].split(',');
        items.forEach((item, idx) => {
          const cleanItem = item.trim();
          // Check if it starts with a path character but isn't quoted
          if ((cleanItem.startsWith('../') || cleanItem.startsWith('./') || cleanItem.startsWith('/')) 
              && !cleanItem.startsWith('"') && !cleanItem.startsWith("'")) {
            errors.push({
              message: 'Paths in arrays should be quoted',
              location: { start: { line: lineNum, column: line.indexOf(cleanItem) + 1 } }
            });
          }
        });
      }
    }
    
    // Check for missing types in state properties
    const stateBlock = isInBlock(lines, index, 'state');
    if (stateBlock && trimmed.match(/^\s*(private|protected|public)?\s*\w+\s*$/)) {
      errors.push({
        message: 'State property missing type declaration',
        location: { start: { line: lineNum, column: 1 } }
      });
    }
    
    // Check for 'when' conditional constraints
    if (trimmed.includes(' when ')) {
      errors.push({
        message: "Conditional constraints with 'when' are not supported",
        location: { start: { line: lineNum, column: line.indexOf('when') + 1 } }
      });
    }
    
    // Check for inline comments after annotations
    if (trimmed.startsWith('@') && trimmed.includes('"') && trimmed.lastIndexOf('"') < trimmed.length - 1) {
      const afterQuote = trimmed.substring(trimmed.lastIndexOf('"') + 1).trim();
      if (afterQuote && !afterQuote.startsWith('//')) {
        errors.push({
          message: 'Unexpected content after annotation',
          location: { start: { line: lineNum, column: trimmed.lastIndexOf('"') + 2 } }
        });
      }
    }
  });
  
  return errors;
}

/**
 * Helper to check if a line is within a specific block
 */
function isInBlock(lines, lineIndex, blockType) {
  let depth = 0;
  let inBlock = false;
  
  for (let i = 0; i <= lineIndex; i++) {
    const line = lines[i].trim();
    if (line.startsWith(blockType + ' ') || line === blockType) {
      inBlock = true;
    }
    if (line.includes('{')) depth++;
    if (line.includes('}')) {
      depth--;
      if (depth === 0) inBlock = false;
    }
  }
  
  return inBlock;
}

/**
 * Fallback regex-based extraction when parser fails
 */
function extractRulesWithRegex(content, lines) {
  const rules = {
    moduleName: '',
    type: '',
    location: '',
    allowedImports: [],
    deniedImports: [],
    deniedOperations: [],
    constraints: {
      require: [],
      deny: [],
      warn: []
    },
    interface: {},
    state: {}
  };
  
  // Extract module name
  const moduleMatch = content.match(/module\s+(\w+)\s*{/);
  if (moduleMatch) {
    rules.moduleName = moduleMatch[1];
  }
  
  // Extract type (try both quoted and unquoted)
  const typeMatch = content.match(/type:\s*["']?([^"'\n\s]+)["']?/);
  if (typeMatch) {
    rules.type = typeMatch[1].trim();
  }
  
  // Extract location (try both quoted and unquoted)
  const locationMatch = content.match(/location:\s*["']?([^"'\n\s]+)["']?/);
  if (locationMatch) {
    rules.location = locationMatch[1].trim();
  }
  
  // Extract constraints
  const constraintsMatch = content.match(/constraints\s*{([^}]+)}/);
  if (constraintsMatch) {
    const constraintLines = constraintsMatch[1].split('\n');
    constraintLines.forEach(line => {
      const trimmed = line.trim();
      
      // Skip comments and annotations
      if (trimmed.startsWith('@') || trimmed.startsWith('//')) return;
      
      // Deny rules (handle quoted and unquoted patterns)
      if (trimmed.startsWith('deny ')) {
        const rest = trimmed.substring(5);
        
        // Check for deny imports/exports with array
        if (rest.startsWith('imports ')) {
          const patterns = extractArrayPatterns(rest);
          rules.deniedImports.push(...patterns);
        } else if (rest.startsWith('exports ')) {
          const patterns = extractArrayPatterns(rest);
          rules.constraints.deny.push({ 
            pattern: 'exports',
            patterns: patterns 
          });
        } else {
          // Regular deny pattern (quoted or unquoted)
          const quotedMatch = rest.match(/^"([^"]+)"/);
          const unquotedMatch = rest.match(/^([\w\.\*]+)/);
          const pattern = quotedMatch ? quotedMatch[1] : (unquotedMatch ? unquotedMatch[1] : null);
          
          if (pattern) {
            rules.constraints.deny.push({ pattern });
          }
        }
      }
    });
  }
  
  return rules;
}

function extractPattern(str) {
  // Try to extract pattern before any operator or comment
  const match = str.match(/^([\w\.\*\[\]]+)/);
  return match ? match[1] : null;
}

function extractArrayPatterns(str) {
  const patterns = [];
  const match = str.match(/\[([^\]]+)\]/);
  if (match) {
    const items = match[1].split(',');
    items.forEach(item => {
      const cleaned = item.trim().replace(/["']/g, '');
      if (cleaned) patterns.push(cleaned);
    });
  }
  return patterns;
}

function extractFirstQuotedOrPath(str) {
  const quotedMatch = str.match(/["']([^"']+)["']/);
  if (quotedMatch) return quotedMatch[1];
  
  const pathMatch = str.match(/^([\w\.\-\/]+)/);
  return pathMatch ? pathMatch[1] : null;
}

/**
 * Validate a TypeScript/JavaScript file against parsed rules
 */
export function validateFileAgainstRules(filePath, rules) {
  const violations = [];
  
  if (!fs.existsSync(filePath)) {
    return [{
      type: 'missing',
      severity: 'error',
      message: 'File does not exist',
      line: 0
    }];
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  try {
    // Try AST-based validation first
    const ast = parse(content, {
      jsx: true,
      loc: true,
      range: true,
      comment: true,
      errorOnUnknownASTType: false,
      useJSXTextNode: true,
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: {
        jsx: true,
        modules: true,
        objectRestSpread: true,
        experimentalObjectRestSpread: true,
        globalReturn: false,
        impliedStrict: false
      },
      project: undefined,
      createDefaultProgram: false,
      extraFileExtensions: ['.tsx', '.jsx'],
      allowInvalidAST: true,
      suppressDeprecatedPropertyWarnings: true,
      tokens: false,
      debugLevel: new Set()
    });

    // Use AST-based validation
    const astViolations = validateWithAST(ast, content, rules);
    violations.push(...astViolations);

  } catch (parseError) {
    // Fallback to regex-based validation
    console.warn(`  AST parsing failed for TypeScript file, using regex fallback`);
    const regexViolations = validateWithRegex(content, lines, rules);
    violations.push(...regexViolations);
  }
  
  return violations;
}

/**
 * AST-based validation
 */
function validateWithAST(ast, content, rules) {
  const violations = [];
  const lines = content.split('\n');
  
  // Create violation context
  const context = {
    violations,
    content,
    lines,
    rules,
    ast
  };

  // Walk the AST and check constraints
  traverse(ast, {
    // Check deny constraints
    ...createDenyConstraintVisitors(context),
    // Check required constraints  
    ...createRequiredConstraintVisitors(context),
    // Check import constraints
    ...createImportConstraintVisitors(context)
  });

  return violations;
}

/**
 * Regex-based validation fallback
 */
function validateWithRegex(content, lines, rules) {
  const violations = [];
  
  // Check imports
  lines.forEach((line, index) => {
    if (line.includes('import ')) {
      const importMatch = line.match(/from\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        const importPath = importMatch[1];
        
        for (const deniedPattern of rules.deniedImports) {
          const regex = new RegExp(deniedPattern.replace(/\*/g, '.*'));
          if (regex.test(importPath)) {
            violations.push({
              type: 'import',
              severity: 'error',
              message: `Import from "${importPath}" is denied`,
              line: index + 1
            });
          }
        }
      }
    }
  });
  
  // Check denied operations
  for (const operation of rules.deniedOperations) {
    if (operation.includes('console')) {
      lines.forEach((line, index) => {
        if (line.includes('console.')) {
          violations.push({
            type: 'operation',
            severity: 'error',
            message: `Console operations are denied (${operation})`,
            line: index + 1
          });
        }
      });
    }
    
    if (operation.includes('localStorage')) {
      lines.forEach((line, index) => {
        if (line.includes('localStorage')) {
          violations.push({
            type: 'operation',
            severity: 'error',
            message: `localStorage operations are denied`,
            line: index + 1
          });
        }
      });
    }
  }
  
  // Check other constraints
  for (const constraint of rules.constraints.deny) {
    if (constraint.pattern === 'io.*') {
      // Check for various IO operations
      lines.forEach((line, index) => {
        if (line.includes('alert(') || line.includes('document.') || line.includes('window.')) {
          violations.push({
            type: 'constraint',
            severity: 'error',
            message: `IO operations are denied (${constraint.pattern})`,
            line: index + 1
          });
        }
      });
    }
    
    if (constraint.pattern === 'exports' && constraint.patterns) {
      // Check for denied exports
      lines.forEach((line, index) => {
        if (line.startsWith('export ')) {
          for (const pattern of constraint.patterns) {
            if (pattern === '_*' && line.includes('_')) {
              violations.push({
                type: 'export',
                severity: 'error',
                message: 'Exports starting with underscore are denied',
                line: index + 1
              });
            }
          }
        }
      });
    }
  }
  
  // Check line count warning
  for (const constraint of rules.constraints.warn) {
    if (constraint.pattern === 'file.lines' && constraint.comparison) {
      const limit = parseInt(constraint.comparison.value);
      if (lines.length > limit) {
        violations.push({
          type: 'constraint',
          severity: 'warning',
          message: `File exceeds ${limit} lines (has ${lines.length})`,
          line: lines.length
        });
      }
    }
  }
  
  // Check for required patterns
  for (const constraint of rules.constraints.require) {
    if (constraint.pattern === 'pattern.accessibility') {
      const hasAria = content.includes('aria-');
      if (!hasAria) {
        violations.push({
          type: 'constraint',
          severity: 'warning',
          message: 'Missing accessibility attributes (pattern.accessibility)',
          line: 1
        });
      }
    }
  }
  
  return violations;
}

/**
 * Simple AST traversal function
 */
function traverse(node, visitors) {
  if (!node || typeof node !== 'object') return;
  
  const nodeType = node.type;
  if (visitors[nodeType]) {
    visitors[nodeType](node);
  }
  
  // Traverse child nodes
  for (const key in node) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue;
    const child = node[key];
    
    if (Array.isArray(child)) {
      child.forEach(item => traverse(item, visitors));
    } else if (child && typeof child === 'object' && child.type) {
      traverse(child, visitors);
    }
  }
}

function createDenyConstraintVisitors(context) {
  const visitors = {};
  
  for (const constraint of context.rules.constraints.deny) {
    const { pattern } = constraint;
    
    if (pattern && pattern.startsWith('io.console')) {
      visitors.CallExpression = visitors.CallExpression || [];
      visitors.CallExpression.push((node) => {
        if (node.callee.type === 'MemberExpression' &&
            node.callee.object.name === 'console') {
          context.violations.push({
            type: 'constraint',
            severity: 'error',
            message: `Console operations are denied (${pattern})`,
            line: context.lines.slice(0, node.loc.start.line).length
          });
        }
      });
    }
  }
  
  // Merge multiple handlers for the same node type
  const mergedVisitors = {};
  for (const [nodeType, handlers] of Object.entries(visitors)) {
    if (Array.isArray(handlers)) {
      mergedVisitors[nodeType] = (node) => {
        handlers.forEach(handler => handler(node));
      };
    } else {
      mergedVisitors[nodeType] = handlers;
    }
  }
  
  return mergedVisitors;
}

function createRequiredConstraintVisitors(context) {
  const visitors = {};
  
  for (const constraint of context.rules.constraints.require) {
    if (constraint.pattern === 'pattern.accessibility') {
      // Check for aria attributes in JSX
      visitors.JSXOpeningElement = (node) => {
        const hasAria = node.attributes.some(attr => 
          attr.type === 'JSXAttribute' && 
          attr.name.name && 
          attr.name.name.startsWith('aria-')
        );
        
        if (!hasAria && node.name.name !== 'div') {
          context.violations.push({
            type: 'constraint',
            severity: 'warning',
            message: 'Missing accessibility attributes (pattern.accessibility)',
            line: node.loc.start.line
          });
        }
      };
    }
  }
  
  return visitors;
}

function createImportConstraintVisitors(context) {
  const visitors = {};
  
  visitors.ImportDeclaration = (node) => {
    const importPath = node.source.value;
    
    // Check denied imports
    for (const deniedPattern of context.rules.deniedImports) {
      const regex = new RegExp(deniedPattern.replace(/\*/g, '.*'));
      if (regex.test(importPath)) {
        context.violations.push({
          type: 'import',
          severity: 'error',
          message: `Import from "${importPath}" is denied`,
          line: node.loc.start.line
        });
      }
    }
  };
  
  return visitors;
}

function getLineNumber(content, index) {
  const lines = content.substring(0, index).split('\n');
  return lines.length;
}