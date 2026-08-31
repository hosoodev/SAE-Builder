import type { IntegrationConfig } from "../core/index.js";
/** Render deterministic production-only webmaster, analytics, and advertising tags. */
export declare function renderIntegrationHead(config: Readonly<IntegrationConfig>): string;
/** Generate the standard Google AdSense authorization record. */
export declare function generateGoogleAdsTxt(publisherId: string): string;
/** Render the Daum webmaster verification comment without accepting arbitrary directives. */
export declare function daumWebmasterComment(key: string): string;
//# sourceMappingURL=integrations.d.ts.map