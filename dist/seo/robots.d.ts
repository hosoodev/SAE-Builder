export interface RobotsRule {
    readonly userAgent: string;
    readonly allow?: string | readonly string[];
    readonly disallow?: string | readonly string[];
}
export interface RobotsOptions {
    readonly siteUrl: string | URL;
    readonly rules?: readonly RobotsRule[];
    readonly preview?: boolean;
    readonly sitemapPath?: string;
    readonly sitemapUrls?: readonly string[];
    readonly comments?: readonly string[];
}
/** Generate robots.txt with merged user-agent groups and stable directive ordering. */
export declare function generateRobotsTxt(options: RobotsOptions): string;
//# sourceMappingURL=robots.d.ts.map