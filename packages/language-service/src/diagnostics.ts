/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {NgAnalyzedModules, StaticSymbol} from '@angular/compiler';
import {DiagnosticTemplateInfo, getTemplateExpressionDiagnostics} from '@angular/compiler-cli/src/language_services';
import * as ts from 'typescript';

import {AstResult} from './common';
import {Declarations, Diagnostic, DiagnosticKind, DiagnosticMessageChain, Diagnostics, Span, TemplateSource} from './types';
import {offsetSpan, spanOf} from './utils';

export interface AstProvider {
  getTemplateAst(template: TemplateSource, fileName: string): AstResult;
}

export function getTemplateDiagnostics(template: TemplateSource, ast: AstResult): Diagnostics {
  const results: Diagnostics = [];

  if (ast.parseErrors && ast.parseErrors.length) {
    results.push(...ast.parseErrors.map<Diagnostic>(e => {
      return {
        kind: DiagnosticKind.Error,
        span: offsetSpan(spanOf(e.span), template.span.start),
        message: e.msg,
      };
    }));
  } else if (ast.templateAst && ast.htmlAst) {
    const info: DiagnosticTemplateInfo = {
      templateAst: ast.templateAst,
      htmlAst: ast.htmlAst,
      offset: template.span.start,
      query: template.query,
      members: template.members,
    };
    const expressionDiagnostics = getTemplateExpressionDiagnostics(info);
    results.push(...expressionDiagnostics);
  }
  if (ast.errors) {
    results.push(...ast.errors.map<Diagnostic>(e => {
      return {
        kind: e.kind,
        span: e.span || template.span,
        message: e.message,
      };
    }));
  }

  return results;
}

export function getDeclarationDiagnostics(
    declarations: Declarations, modules: NgAnalyzedModules): Diagnostics {
  const results: Diagnostics = [];

  let directives: Set<StaticSymbol>|undefined = undefined;
  for (const declaration of declarations) {
    const report = (message: string | DiagnosticMessageChain, span?: Span) => {
      results.push(<Diagnostic>{
        kind: DiagnosticKind.Error,
        span: span || declaration.declarationSpan, message
      });
    };
    for (const error of declaration.errors) {
      report(error.message, error.span);
    }
    if (declaration.metadata) {
      if (declaration.metadata.isComponent) {
        if (!modules.ngModuleByPipeOrDirective.has(declaration.type)) {
          report(
              `Component '${declaration.type.name}' is not included in a module and will not be available inside a template. Consider adding it to a NgModule declaration`);
        }
        const {template, templateUrl} = declaration.metadata.template !;
        if (template === null && !templateUrl) {
          report(`Component '${declaration.type.name}' must have a template or templateUrl`);
        } else if (template && templateUrl) {
          report(
              `Component '${declaration.type.name}' must not have both template and templateUrl`);
        }
      } else {
        if (!directives) {
          directives = new Set();
          modules.ngModules.forEach(module => {
            module.declaredDirectives.forEach(
                directive => { directives !.add(directive.reference); });
          });
        }
        if (!directives.has(declaration.type)) {
          report(
              `Directive '${declaration.type.name}' is not included in a module and will not be available inside a template. Consider adding it to a NgModule declaration`);
        }
      }
    }
  }

  return results;
}

function diagnosticChainToDiagnosticChain(chain: DiagnosticMessageChain):
    ts.DiagnosticMessageChain {
  return {
    messageText: chain.message,
    category: ts.DiagnosticCategory.Error,
    code: 0,
    next: chain.next ? diagnosticChainToDiagnosticChain(chain.next) : undefined
  };
}

function diagnosticMessageToDiagnosticMessageText(message: string | DiagnosticMessageChain): string|
    ts.DiagnosticMessageChain {
  if (typeof message === 'string') {
    return message;
  }
  return diagnosticChainToDiagnosticChain(message);
}

export function ngDiagnosticToTsDiagnostic(
    d: Diagnostic, file: ts.SourceFile | undefined): ts.Diagnostic {
  return {
    file,
    start: d.span.start,
    length: d.span.end - d.span.start,
    messageText: diagnosticMessageToDiagnosticMessageText(d.message),
    category: ts.DiagnosticCategory.Error,
    code: 0,
    source: 'ng',
  };
}
