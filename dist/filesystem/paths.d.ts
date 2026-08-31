export declare function isPathInsideRoot(root: string, target: string): boolean;
export declare function assertPathInsideRoot(root: string, target: string, label?: string): string;
export declare function resolveInsideRoot(root: string, ...segments: string[]): string;
export declare function relativeInsideRoot(root: string, target: string): string;
export declare function toPosixPath(value: string): string;
export declare function assertSafeRelativePath(value: string, label?: string): string;
export declare const isInsideRoot: typeof isPathInsideRoot;
export declare const assertInsideRoot: typeof assertPathInsideRoot;
//# sourceMappingURL=paths.d.ts.map