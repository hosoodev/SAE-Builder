function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
export class DependencyGraph {
    #fingerprints = new Map();
    #dependencies = new Map();
    setFingerprint(node, fingerprint) {
        this.#fingerprints.set(node, fingerprint);
        if (!this.#dependencies.has(node)) {
            this.#dependencies.set(node, new Set());
        }
    }
    addDependency(node, dependency) {
        const dependencies = this.#dependencies.get(node) ?? new Set();
        dependencies.add(dependency);
        this.#dependencies.set(node, dependencies);
        if (!this.#dependencies.has(dependency)) {
            this.#dependencies.set(dependency, new Set());
        }
    }
    fingerprint(node) {
        return this.#fingerprints.get(node);
    }
    nodes() {
        return [...new Set([...this.#dependencies.keys(), ...this.#fingerprints.keys()])].sort(compareText);
    }
    affectedBy(changedNodes) {
        const reverse = new Map();
        for (const [node, dependencies] of this.#dependencies) {
            for (const dependency of dependencies) {
                const dependents = reverse.get(dependency) ?? new Set();
                dependents.add(node);
                reverse.set(dependency, dependents);
            }
        }
        const affected = new Set();
        const queue = [...changedNodes].sort(compareText);
        while (queue.length > 0) {
            const current = queue.shift();
            if (affected.has(current))
                continue;
            affected.add(current);
            for (const dependent of [...(reverse.get(current) ?? [])].sort(compareText)) {
                queue.push(dependent);
            }
        }
        return affected;
    }
    serialize() {
        return {
            fingerprints: Object.fromEntries([...this.#fingerprints.entries()].sort(([a], [b]) => compareText(a, b))),
            dependencies: Object.fromEntries([...this.#dependencies.entries()]
                .sort(([a], [b]) => compareText(a, b))
                .map(([node, dependencies]) => [node, [...dependencies].sort(compareText)])),
        };
    }
    static from(serialized) {
        const graph = new DependencyGraph();
        for (const [node, fingerprint] of Object.entries(serialized.fingerprints)) {
            graph.setFingerprint(node, fingerprint);
        }
        for (const [node, dependencies] of Object.entries(serialized.dependencies)) {
            for (const dependency of dependencies) {
                graph.addDependency(node, dependency);
            }
        }
        return graph;
    }
}
//# sourceMappingURL=graph.js.map