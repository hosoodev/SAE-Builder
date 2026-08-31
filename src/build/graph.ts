export interface SerializedDependencyGraph {
  fingerprints: Record<string, string>;
  dependencies: Record<string, string[]>;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export class DependencyGraph {
  readonly #fingerprints = new Map<string, string>();
  readonly #dependencies = new Map<string, Set<string>>();

  setFingerprint(node: string, fingerprint: string): void {
    this.#fingerprints.set(node, fingerprint);
    if (!this.#dependencies.has(node)) {
      this.#dependencies.set(node, new Set());
    }
  }

  addDependency(node: string, dependency: string): void {
    const dependencies = this.#dependencies.get(node) ?? new Set<string>();
    dependencies.add(dependency);
    this.#dependencies.set(node, dependencies);
    if (!this.#dependencies.has(dependency)) {
      this.#dependencies.set(dependency, new Set());
    }
  }

  fingerprint(node: string): string | undefined {
    return this.#fingerprints.get(node);
  }

  nodes(): readonly string[] {
    return [...new Set([...this.#dependencies.keys(), ...this.#fingerprints.keys()])].sort(compareText);
  }

  affectedBy(changedNodes: Iterable<string>): Set<string> {
    const reverse = new Map<string, Set<string>>();
    for (const [node, dependencies] of this.#dependencies) {
      for (const dependency of dependencies) {
        const dependents = reverse.get(dependency) ?? new Set<string>();
        dependents.add(node);
        reverse.set(dependency, dependents);
      }
    }

    const affected = new Set<string>();
    const queue = [...changedNodes].sort(compareText);
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (affected.has(current)) continue;
      affected.add(current);
      for (const dependent of [...(reverse.get(current) ?? [])].sort(compareText)) {
        queue.push(dependent);
      }
    }
    return affected;
  }

  serialize(): SerializedDependencyGraph {
    return {
      fingerprints: Object.fromEntries(
        [...this.#fingerprints.entries()].sort(([a], [b]) => compareText(a, b)),
      ),
      dependencies: Object.fromEntries(
        [...this.#dependencies.entries()]
          .sort(([a], [b]) => compareText(a, b))
          .map(([node, dependencies]) => [node, [...dependencies].sort(compareText)]),
      ),
    };
  }

  static from(serialized: SerializedDependencyGraph): DependencyGraph {
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
