// Priority-Flood on an irregular graph (Barnes et al., 2014). The stable heap
// resolves flats in discovery order without artificial slopes or flow cycles.
class FloodQueue {
    items = [];
    earlier(a, b) {
        return (
            a.drainageElevation < b.drainageElevation ||
            (a.drainageElevation === b.drainageElevation && a.sequence < b.sequence)
        );
    }
    push(value) {
        const items = this.items;
        let i = items.length;
        items.push(value);
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (!this.earlier(value, items[p])) break;
            items[i] = items[p];
            i = p;
        }
        items[i] = value;
    }
    pop() {
        const items = this.items,
            first = items[0],
            last = items.pop();
        if (items.length) {
            let i = 0;
            while (i * 2 + 1 < items.length) {
                let child = i * 2 + 1;
                if (child + 1 < items.length && this.earlier(items[child + 1], items[child])) child++;
                if (!this.earlier(items[child], last)) break;
                items[i] = items[child];
                i = child;
            }
            items[i] = last;
        }
        return first;
    }
}

export function drainGraph(vertices) {
    const queue = new FloodQueue(),
        order = [];
    let sequence = 0;
    for (const point of vertices.values()) {
        point.downstream = null;
        point.sequence = undefined;
        point.flow = point.runoff;
        if (!point.terminal) continue;
        point.drainageElevation = Math.max(0, point.elevation);
        point.sequence = sequence++;
        point.outletId = point.id;
        queue.push(point);
    }
    while (queue.items.length) {
        const point = queue.pop();
        order.push(point);
        for (const { vertex: next, edge } of point.links) {
            if (next.sequence !== undefined) continue;
            next.drainageElevation = Math.max(next.elevation, point.drainageElevation);
            next.sequence = sequence++;
            next.downstream = { vertex: point, edge };
            next.outletId = point.outletId;
            queue.push(next);
        }
    }
    if (order.length !== vertices.size) throw new Error('Drainage graph has a component without an outlet');
    for (let i = order.length - 1; i >= 0; i--) {
        const point = order[i];
        if (point.downstream) point.downstream.vertex.flow += point.flow;
    }
    return order;
}

// Selective spillway breaching, not a time-stepped erosion simulation. Keep
// modest lakes, but lower outlets of oversized/deep basins instead of flooding
// whole continental interiors. Limits use region area, independent of density.
export function conditionBasins(vertices, cellsPerRegion) {
    let order = drainGraph(vertices);
    let breaches = 0;
    for (let pass = 0; pass < 8; pass++) {
        const visited = new Set();
        let changed = false;
        for (const start of order) {
            if (visited.has(start.id) || start.drainageElevation - start.elevation <= 12) continue;
            const basin = [start];
            visited.add(start.id);
            for (let head = 0; head < basin.length; head++)
                for (const { vertex: next } of basin[head].links) {
                    if (
                        visited.has(next.id) ||
                        next.drainageElevation - next.elevation <= 12 ||
                        Math.abs(next.drainageElevation - start.drainageElevation) > 0.001
                    )
                        continue;
                    visited.add(next.id);
                    basin.push(next);
                }
            // There are approximately two shared vertices per operational cell.
            const capacity = 4 * cellsPerRegion * 2;
            const sorted = [...basin].sort((a, b) => a.elevation - b.elevation);
            const pit = sorted[0];
            if (basin.length <= capacity && start.drainageElevation - pit.elevation <= 160) continue;
            // Leave a small residual lake around the basin bottom. Follow the
            // existing escape tree through its rim, lowering the actual edge bed.
            let level = Math.max(
                0,
                Math.min(
                    pit.elevation + 85,
                    sorted[Math.min(sorted.length - 1, Math.floor(capacity * 0.55))].elevation,
                ),
            );
            let point = pit;
            let reachedSpill = false;
            while (point) {
                if (point.elevation >= level) reachedSpill = true;
                const lowered = Math.min(point.elevation, level);
                if (point.elevation - lowered > 0.001) {
                    point.carvedDepth = (point.carvedDepth ?? 0) + point.elevation - lowered;
                    point.elevation = lowered;
                    changed = true;
                }
                if (reachedSpill) level = Math.max(0, lowered - 0.01 / Math.sqrt(cellsPerRegion));
                point = point.downstream?.vertex;
            }
            breaches++;
        }
        if (!changed) break;
        order = drainGraph(vertices);
    }
    return { order, breaches };
}
