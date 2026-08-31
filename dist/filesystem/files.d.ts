export declare function pathExists(target: string): Promise<boolean>;
export declare function canonicalizeRoot(root: string): Promise<string>;
/** Reject a symlink or junction at the root or at any existing descendant. */
export declare function assertNoSymlinkPath(root: string, target: string, allowMissingLeaf?: boolean): Promise<string>;
/** Resolve a user/config supplied project-relative entry and verify ancestors. */
export declare function resolveFileInsideRoot(root: string, entry: string, label?: string): Promise<string>;
export declare function readTextFile(root: string, relativePath: string): Promise<string>;
export declare const readTextInside: typeof readTextFile;
export interface DiscoverFilesOptions {
    readonly extensions?: readonly string[];
    readonly optional?: boolean;
}
export declare function discoverFiles(root: string, options?: DiscoverFilesOptions): Promise<string[]>;
export declare function discoverFiles(root: string, directory: string, options?: DiscoverFilesOptions): Promise<string[]>;
export declare function writeFileAtomic(root: string, target: string, contents: string | Uint8Array): Promise<void>;
export declare function writeTextInside(root: string, relativePath: string, value: string): Promise<void>;
export declare function copyDirectory(sourceRoot: string, outputRoot: string): Promise<void>;
//# sourceMappingURL=files.d.ts.map