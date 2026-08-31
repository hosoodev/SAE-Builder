export type DiagnosticSeverity = "error" | "warning";
export type DiagnosticRuleSetting = DiagnosticSeverity | "off";
export interface SeoDiagnostic {
    readonly ruleId: string;
    readonly severity: DiagnosticSeverity;
    readonly message: string;
    readonly source?: string;
    readonly route?: string;
    readonly line?: number;
    readonly column?: number;
}
export interface SeoHtmlPage {
    readonly route: string;
    readonly source?: string;
    readonly html: string;
    readonly canonical?: string;
    readonly locale?: string;
    readonly updated?: string;
    readonly draft?: boolean;
    readonly noindex?: boolean;
}
export interface LengthGuidance {
    readonly min?: number;
    readonly max?: number;
}
export interface SeoDiagnosticOptions {
    readonly siteUrl: string | URL;
    readonly titleLength?: LengthGuidance;
    readonly descriptionLength?: LengthGuidance;
    readonly answerMinLength?: number;
    readonly knownPaths?: readonly string[];
    readonly entryRoutes?: readonly string[];
    readonly locales?: readonly string[];
    readonly forbiddenElements?: readonly string[];
    readonly forbiddenClasses?: readonly string[];
    readonly warningAsError?: boolean;
    readonly rules?: Readonly<Record<string, DiagnosticRuleSetting>>;
}
export declare function sortDiagnostics(diagnostics: readonly SeoDiagnostic[]): SeoDiagnostic[];
/** Diagnose one rendered page without assuming that linked pages are available. */
export declare function diagnoseHtmlPage(page: SeoHtmlPage, options: SeoDiagnosticOptions): SeoDiagnostic[];
/** Diagnose rendered HTML, cross-page canonical/route conflicts, links, fragments, and orphans. */
export declare function diagnoseSeoSite(pages: readonly SeoHtmlPage[], options: SeoDiagnosticOptions): SeoDiagnostic[];
//# sourceMappingURL=lint.d.ts.map