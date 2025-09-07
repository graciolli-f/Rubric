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
        if (rule.pattern.startsWith('io.') || rule.pattern.startsWith('pattern.')) {
          rules.deniedOperations.push(rule.pattern);
        }
        break;
      
      case 'WarnRule':
        rules.constraints.warn.push(constraintData);
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
 * Validate a TypeScript/JavaScript file against parsed rules
 */
export function validateFileAgainstRules(filePath, rules) {
  const violations = [];
  const content = fs.readFileSync(filePath, 'utf8');

  try {
    // Parse TypeScript/JavaScript file into AST
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
    // Fallback to regex-based validation for problematic files
    console.warn(`AST parsing failed for ${filePath}, falling back to regex`);
    
    // Check constraints with regex fallback
    for (const constraint of rules.constraints.deny) {
      const violation = checkConstraintViolationRegex(content, constraint, 'error');
      if (violation) {
        violations.push(violation);
      }
    }

    for (const constraint of rules.constraints.warn) {
      const violation = checkConstraintViolationRegex(content, constraint, 'warning');
      if (violation) {
        violations.push(violation);
      }
    }

    for (const constraint of rules.constraints.require) {
      const violation = checkRequiredPatternRegex(content, constraint, filePath);
      if (violation) {
        violations.push(violation);
      }
    }
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
    
    if (pattern.startsWith('io.console')) {
      visitors.CallExpression = visitors.CallExpression || [];
      visitors.CallExpression.push((node) => {
        if (node.callee.type === 'MemberExpression' &&
            node.callee.object.name === 'console') {
          const line = context.lines[node.loc.start.line - 1];
          context.violations.push({
            type: 'constraint',
            severity: 'error',
            message: `Console operations are denied (${pattern})`,
            line: node.loc.start.line
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
  // Check for required patterns
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

// Regex fallback functions
function checkConstraintViolationRegex(content, constraint, severity) {
  const { pattern, comment } = constraint;
  
  if (pattern.startsWith('io.console')) {
    const consoleRegex = /console\.\w+\(/g;
    const match = consoleRegex.exec(content);
    if (match) {
      return {
        type: 'constraint',
        severity,
        message: comment || `Console operations are denied (${pattern})`,
        line: getLineNumber(content, match.index)
      };
    }
  }
  
  return null;
}

function checkRequiredPatternRegex(content, constraint, filePath) {
  const { pattern, comment } = constraint;
  
  if (pattern === 'pattern.accessibility') {
    const hasAria = /aria-\w+=/g.test(content);
    if (!hasAria) {
      return {
        type: 'constraint',
        severity: 'warning',
        message: comment || 'Missing accessibility attributes (pattern.accessibility)',
        line: 1
      };
    }
  }
  
  return null;
}

function getLineNumber(content, index) {
  const lines = content.substring(0, index).split('\n');
  return lines.length;
}
