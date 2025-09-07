// Simplified RUX Grammar for PEG.js
// Defines the syntax for .rux constraint files

{
  function makeNode(type, props) {
    return { type, ...props, location: location() };
  }
}

// ============ Main Structure ============

Module
  = _ annotations:Annotation* _ "module" _ name:Identifier _ "{" _ body:ModuleBody _ "}" _
    { return makeNode('Module', { name, annotations, body }); }

ModuleBody
  = items:( _ item:ModuleItem _ { return item; } )*
    { return items.filter(item => item !== null); }

ModuleItem
  = Annotation
  / TypeDeclaration
  / LocationDeclaration
  / VersionDeclaration
  / Interface
  / State
  / Imports
  / Constraints

// ============ Simple Declarations ============

Annotation
  = "@" _ text:AnnotationText
    { return makeNode('Annotation', { text: text.trim() }); }

AnnotationText
  = chars:(!LineTerminator !"@" char:. { return char; })*
    { return chars.join(''); }

TypeDeclaration
  = "type:" _ value:QuotedString
    { return makeNode('TypeDeclaration', { value }); }

LocationDeclaration
  = "location:" _ value:QuotedString
    { return makeNode('LocationDeclaration', { value }); }

VersionDeclaration
  = "version:" _ value:QuotedString
    { return makeNode('VersionDeclaration', { value }); }

// ============ Interface Block ============

Interface
  = "interface" _ "{" _ members:InterfaceMembers _ "}"
    { return makeNode('Interface', { members }); }

InterfaceMembers
  = members:( _ member:InterfaceMember _ { return member; } )*
    { return members.filter(m => m !== null); }

InterfaceMember
  = Annotation
  / FunctionDeclaration
  / PropertyDeclaration
  / InterfaceTypeDeclaration

FunctionDeclaration
  = visibility:Visibility? _ "function" _ name:Identifier _ "()" _ "->" _ returnType:Type
    {
      return makeNode('FunctionDeclaration', {
        visibility: visibility || 'public',
        name,
        returnType
      });
    }

PropertyDeclaration
  = visibility:Visibility? _ readonly:"readonly"? _ name:Identifier _ ":" _ type:Type
    {
      return makeNode('PropertyDeclaration', {
        visibility: visibility || 'public',
        readonly: !!readonly,
        name,
        type
      });
    }

InterfaceTypeDeclaration
  = visibility:Visibility? _ "type" _ name:Identifier
    {
      return makeNode('InterfaceTypeDeclaration', {
        visibility: visibility || 'public',
        name
      });
    }

// ============ State Block ============

State
  = "state" _ "{" _ members:StateMembers _ "}"
    { return makeNode('State', { members }); }

StateMembers
  = members:( _ member:StateMember _ { return member; } )*
    { return members.filter(m => m !== null); }

StateMember
  = Annotation
  / StateProperty

StateProperty
  = visibility:("private" / "protected")? _ isStatic:"static"? _ readonly:"readonly"? _ 
    name:Identifier _ ":" _ type:Type _ 
    initializer:("=" _ value:SimpleValue { return value; })?
    {
      return makeNode('StateProperty', {
        visibility: visibility || 'private',
        isStatic: !!isStatic,
        readonly: !!readonly,
        name,
        type,
        initializer
      });
    }

// ============ Imports Block ============

Imports
  = "imports" _ "{" _ rules:ImportRules _ "}"
    { return makeNode('Imports', { rules }); }

ImportRules
  = rules:( _ rule:ImportRule _ { return rule; } )*
    { return rules.filter(r => r !== null); }

ImportRule
  = AllowRule
  / DenyRule

AllowRule
  = "allow" _ path:ImportPath _ 
    alias:(_ "as" _ a:ImportAlias { return a; })? _
    exceptions:("except:" _ "[" _ e:PatternList _ "]" { return e; })?
    {
      return makeNode('AllowRule', {
        path,
        alias: alias || null,
        exceptions: exceptions || []
      });
    }

ImportAlias
  = "external" { return { type: 'external' }; }
  / "{" _ names:IdentifierList _ "}" { return { type: 'named', names }; }
  / name:Identifier { return { type: 'default', name }; }

DenyRule
  = "deny" _ "imports" _ "[" _ patterns:PatternList _ "]" _
    exceptions:("except:" _ "[" _ e:PatternList _ "]" { return e; })?
    { return makeNode('DenyRule', { patterns, exceptions: exceptions || [] }); }

// ============ Constraints Block ============

Constraints
  = "constraints" _ "{" _ rules:ConstraintRules _ "}"
    { return makeNode('Constraints', { rules }); }

ConstraintRules
  = rules:( _ rule:ConstraintRule _ { return rule; } )*
    { return rules.filter(r => r !== null); }

ConstraintRule
  = Annotation
  / DenyConstraintRule
  / RequireRule
  / WarnRule

DenyConstraintRule
  = "deny" _ pattern:Pattern _ 
    comparison:Comparison? _
    comment:Comment? _
    exceptions:("except:" _ "[" _ e:PatternList _ "]" { return e; })?
    {
      return makeNode('DenyConstraintRule', {
        pattern,
        comparison: comparison || null,
        comment: comment || null,
        exceptions: exceptions || []
      });
    }

RequireRule
  = "require" _ pattern:Pattern _ 
    comparison:Comparison? _
    comment:Comment? _
    exceptions:("except:" _ "[" _ e:PatternList _ "]" { return e; })?
    {
      return makeNode('RequireRule', {
        pattern,
        comparison: comparison || null,
        comment: comment || null,
        exceptions: exceptions || []
      });
    }

WarnRule
  = "warn" _ pattern:Pattern _ 
    comparison:Comparison? _
    comment:Comment? _
    exceptions:("except:" _ "[" _ e:PatternList _ "]" { return e; })?
    {
      return makeNode('WarnRule', {
        pattern,
        comparison: comparison || null,
        comment: comment || null,
        exceptions: exceptions || []
      });
    }

// ============ Common Patterns ============

PatternList
  = first:Pattern rest:( _ "," _ pattern:Pattern { return pattern; } )*
    { return [first, ...rest]; }

Pattern
  = parts:PatternPart+
    { return parts.join(''); }

PatternPart
  = Identifier
  / "." { return "."; }
  / "*" { return "*"; }
  / "?" { return "?"; }
  / "[" chars:(!"]" char:. { return char; })* "]" 
    { return "[" + chars.join('') + "]"; }

ImportPath
  = QuotedString
  / DottedPath

DottedPath
  = first:Identifier rest:( "." part:Identifier { return "." + part; } )*
    { return first + rest.join(''); }

Comment
  = "--" _ text:CommentText
    { return text.trim(); }

CommentText
  = chars:(!LineTerminator char:. { return char; })*
    { return chars.join(''); }

Comparison
  = op:ComparisonOperator _ value:ComparisonValue
    { return { op, value }; }

ComparisonOperator
  = ">=" / "<=" / ">" / "<" / "=="

ComparisonValue
  = Number
  / QuotedString

IdentifierList
  = first:Identifier rest:( _ "," _ name:Identifier { return name; } )*
    { return [first, ...rest]; }

// ============ Basic Types ============

Type
  = name:Identifier optional:"?"?
    { return optional ? name + "?" : name; }

SimpleValue
  = QuotedString
  / Number
  / Boolean
  / "null" { return null; }
  / "undefined" { return undefined; }

Visibility
  = "public" / "private" / "protected"

// ============ Lexical Elements ============

Identifier
  = first:[a-zA-Z_$] rest:[a-zA-Z0-9_$]*
    { return first + rest.join(''); }

QuotedString
  = '"' chars:DoubleStringCharacter* '"'
    { return chars.join(''); }
  / "'" chars:SingleStringCharacter* "'"
    { return chars.join(''); }

DoubleStringCharacter
  = !('"' / "\\" / LineTerminator) char:. { return char; }
  / "\\" sequence:EscapeSequence { return sequence; }

SingleStringCharacter
  = !("'" / "\\" / LineTerminator) char:. { return char; }
  / "\\" sequence:EscapeSequence { return sequence; }

EscapeSequence
  = "n" { return "\n"; }
  / "r" { return "\r"; }
  / "t" { return "\t"; }
  / "\\" { return "\\"; }
  / '"' { return '"'; }
  / "'" { return "'"; }

Number
  = digits:[0-9]+
    { return parseInt(digits.join(''), 10); }

Boolean
  = "true" { return true; }
  / "false" { return false; }

// ============ Whitespace and Comments ============

_
  = WhiteSpace*

WhiteSpace
  = [ \t\n\r]
  / "//" (!LineTerminator .)*
  / "/*" (!"*/" .)* "*/"

LineTerminator
  = [\n\r\u2028\u2029]
