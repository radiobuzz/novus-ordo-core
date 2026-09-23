const installations = new WeakMap();

export function installTrait(target, trait) {
    const installed = installations.get(target) ?? new Set();
    if (installed.has(trait.name)) throw new Error(`Duplicate trait: ${trait.name}`);
    for (const requirement of trait.requires ?? []) {
        if (!(requirement in target)) throw new Error(`Missing trait requirement: ${requirement}`);
    }
    for (const name of trait.exports) {
        if (name in target) throw new Error(`Trait capability collision: ${name}`);
    }
    if (target.scope.closed) throw new Error('Cannot install a trait after destruction.');
    const { capabilities, cleanup = () => {} } = trait.install(target);
    if (
        Object.keys(capabilities).length !== trait.exports.length ||
        trait.exports.some((name) => !(name in capabilities))
    ) {
        cleanup();
        throw new Error(`Trait exports do not match: ${trait.name}`);
    }
    for (const name of trait.exports)
        Object.defineProperty(target, name, { value: capabilities[name], configurable: true });
    installed.add(trait.name);
    installations.set(target, installed);
    target.scope.own(() => {
        for (const name of trait.exports) delete target[name];
        installed.delete(trait.name);
        return cleanup();
    });
}
