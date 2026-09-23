import { nations } from './model.js';
import { activeFormations } from './military.js';
import { axialKey, hexCorners, neighborCoordinates } from './hex.js';
import { isWater } from './water.js';

export function flagMarkup(id) {
    const patterns = {
        aurelia:
            '<rect width="30" height="20" fill="#943e3d"/><rect y="14" width="30" height="6" fill="#e4bd62"/><circle cx="15" cy="8" r="4" fill="#ffe5a0"/>',
        sable: '<rect width="30" height="20" fill="#245c88"/><path d="M0 0L30 20M30 0L0 20" stroke="#e3edf3" stroke-width="3"/><circle cx="15" cy="10" r="3" fill="#153750"/>',
        verdant:
            '<rect width="30" height="20" fill="#286345"/><rect y="7" width="30" height="6" fill="#e0e6bf"/><path d="M15 3L21 10L15 17L9 10Z" fill="#a2b963"/>',
    };
    return `<svg class="faction-flag" viewBox="0 0 30 20" role="img" aria-label="${nations[id]?.name ?? 'Unclaimed'} flag">${patterns[id] ?? ''}</svg>`;
}

function drawFlag(ctx, id, x, y, width = 27) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(width / 30, width / 30);
    ctx.fillStyle = { aurelia: '#943e3d', sable: '#245c88', verdant: '#286345' }[id];
    ctx.fillRect(0, 0, 30, 20);
    if (id === 'aurelia') {
        ctx.fillStyle = '#e4bd62';
        ctx.fillRect(0, 14, 30, 6);
        ctx.fillStyle = '#ffe5a0';
        ctx.beginPath();
        ctx.arc(15, 8, 4, 0, Math.PI * 2);
        ctx.fill();
    } else if (id === 'sable') {
        ctx.strokeStyle = '#e3edf3';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(30, 20);
        ctx.moveTo(30, 0);
        ctx.lineTo(0, 20);
        ctx.stroke();
        ctx.fillStyle = '#153750';
        ctx.beginPath();
        ctx.arc(15, 10, 3, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.fillStyle = '#e0e6bf';
        ctx.fillRect(0, 7, 30, 6);
        ctx.fillStyle = '#a2b963';
        ctx.beginPath();
        ctx.moveTo(15, 3);
        ctx.lineTo(21, 10);
        ctx.lineTo(15, 17);
        ctx.lineTo(9, 10);
        ctx.fill();
    }
    ctx.strokeStyle = '#ece6cf';
    ctx.lineWidth = 0.7;
    ctx.strokeRect(0, 0, 30, 20);
    ctx.restore();
}

function unitIcon(ctx, type) {
    ctx.strokeStyle = '#eff0df';
    ctx.fillStyle = '#eff0df';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (type === 'Armored') {
        ctx.roundRect(-9, -1, 18, 7, 3);
        ctx.fill();
        ctx.fillRect(-4, -5, 9, 5);
        ctx.fillRect(3, -5, 10, 2);
    } else if (type === 'Infantry') {
        ctx.arc(0, -7, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -4);
        ctx.lineTo(0, 3);
        ctx.lineTo(-5, 8);
        ctx.moveTo(0, 3);
        ctx.lineTo(5, 8);
        ctx.moveTo(-5, 1);
        ctx.lineTo(0, -2);
        ctx.lineTo(6, 1);
        ctx.moveTo(3, 5);
        ctx.lineTo(8, -5);
        ctx.stroke();
    } else if (type === 'Artillery') {
        ctx.arc(-3, 4, 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-3, 1);
        ctx.lineTo(10, -7);
        ctx.moveTo(-1, 4);
        ctx.lineTo(10, 8);
        ctx.stroke();
    } else {
        ctx.moveTo(0, -10);
        ctx.lineTo(3, -2);
        ctx.lineTo(11, 3);
        ctx.lineTo(11, 6);
        ctx.lineTo(3, 3);
        ctx.lineTo(2, 7);
        ctx.lineTo(5, 10);
        ctx.lineTo(-5, 10);
        ctx.lineTo(-2, 7);
        ctx.lineTo(-3, 3);
        ctx.lineTo(-11, 6);
        ctx.lineTo(-11, 3);
        ctx.lineTo(-3, -2);
        ctx.closePath();
        ctx.fill();
        if (type === 'Bomber') {
            ctx.fillRect(-10, 5, 2, 4);
            ctx.fillRect(8, 5, 2, 4);
        }
    }
}

export class MilitaryOverlay {
    cache = new WeakMap();
    markers = [];
    flagsDrawn = 0;
    markerAt(x, y) {
        return [...this.markers]
            .reverse()
            .find((marker) => Math.abs(marker.x - x) <= 25 && Math.abs(marker.y - y) <= 21);
    }

    politicalGeometry(model) {
        if (this.cache.has(model)) return this.cache.get(model);
        const anchors = model.regions
            .filter((region) => region.ownerId)
            .map((region) => {
                const cell = region.cellIds
                    .map((id) => model.cellById.get(id))
                    .filter((cell) => !isWater(cell))
                    .sort(
                        (a, b) =>
                            Math.hypot(a.x - region.x, a.y - region.y) -
                            Math.hypot(b.x - region.x, b.y - region.y),
                    )[0];
                return { region, cell };
            });
        const borders = new Path2D(),
            edgeCorners = [
                [0, 1],
                [5, 0],
                [4, 5],
                [3, 4],
                [2, 3],
                [1, 2],
            ];
        for (const cell of model.cells) {
            if (isWater(cell)) continue;
            const corners = hexCorners(cell.x, cell.y, model.cellSize);
            neighborCoordinates(cell.q, cell.r).forEach(({ q, r }, i) => {
                const next = model.cellById.get(axialKey(q, r));
                if (next && !isWater(next) && next.politicalOwnerId === cell.politicalOwnerId) return;
                const [a, b] = edgeCorners[i];
                borders.moveTo(corners[a].x, corners[a].y);
                borders.lineTo(corners[b].x, corners[b].y);
            });
        }
        const geometry = { anchors, borders };
        this.cache.set(model, geometry);
        return geometry;
    }

    draw(ctx, state, camera) {
        const { model, military, layers } = state;
        ctx.textBaseline = 'alphabetic';
        this.markers = [];
        this.flagsDrawn = 0;
        if (state.view !== 'terrain') return;
        const screen = (id) => {
            const cell = model.cellById.get(id);
            return camera.worldToScreen(cell.x, cell.y);
        };
        if (layers.flags) {
            const geometry = this.politicalGeometry(model);
            ctx.save();
            ctx.translate(
                camera.width / 2 - camera.x * camera.zoom,
                camera.height / 2 - camera.y * camera.zoom,
            );
            ctx.scale(camera.zoom, camera.zoom);
            ctx.strokeStyle = '#edd9a8aa';
            ctx.lineWidth = 1.2 / camera.zoom;
            ctx.stroke(geometry.borders);
            ctx.restore();
            const occupied = [];
            for (const { region, cell } of geometry.anchors) {
                const p = screen(cell.id);
                if (p.x < 15 || p.y < 15 || p.x > camera.width - 30 || p.y > camera.height - 20) continue;
                if (occupied.some((other) => Math.hypot(other.x - p.x, other.y - p.y) < 64)) continue;
                occupied.push(p);
                drawFlag(ctx, region.ownerId, p.x - 12, p.y - 8, 24);
                this.flagsDrawn++;
            }
        }
        if (!layers.formations || !military) return;
        if (layers.orders) {
            for (const group of activeFormations(military)) {
                const selected = group.id === state.selectedFormationId;
                if (group.order) this.drawOrder(ctx, group.order, screen, selected, false);
            }
            if (state.orderPreview && !state.orderPreview.error)
                this.drawOrder(ctx, state.orderPreview, screen, true, true);
        }
        const buckets = new Map();
        for (const group of activeFormations(military)) {
            const p = screen(group.cellId);
            if (p.x < -40 || p.y < -40 || p.x > camera.width + 40 || p.y > camera.height + 40) continue;
            const key = `${group.nationId}:${Math.round(p.x / 52)},${Math.round(p.y / 42)}`;
            if (!buckets.has(key)) buckets.set(key, { ...p, groups: [] });
            buckets.get(key).groups.push(group);
        }
        const labels = [];
        const orderedBuckets = [...buckets.values()].sort(
            (a, b) =>
                Number(b.groups.some((group) => group.id === state.selectedFormationId)) -
                Number(a.groups.some((group) => group.id === state.selectedFormationId)),
        );
        for (const bucket of orderedBuckets) {
            const selected = bucket.groups.find((group) => group.id === state.selectedFormationId);
            const group = selected ?? bucket.groups[0];
            let { x, y } = bucket;
            // Separate collocated enemy counters; the connector retains their true position.
            while (this.markers.some((marker) => Math.abs(marker.x - x) < 49 && Math.abs(marker.y - y) < 40))
                y += 42;
            ctx.strokeStyle = '#e7dec380';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(bucket.x, bucket.y);
            ctx.lineTo(x, y);
            ctx.stroke();
            this.markers.push({ x, y, ids: bucket.groups.map((entry) => entry.id), cellId: group.cellId });
            ctx.save();
            ctx.translate(x, y);
            ctx.fillStyle = '#10202cf5';
            ctx.strokeStyle = selected ? '#ffe2a1' : nations[group.nationId].color;
            ctx.lineWidth = selected ? 2.5 : 1.5;
            ctx.beginPath();
            ctx.roundRect(-24, -19, 48, 38, 5);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = nations[group.nationId].color;
            ctx.fillRect(-22, -16, 3, 29);
            unitIcon(ctx, group.type);
            drawFlag(ctx, group.nationId, 9, -16, 12);
            ctx.font = 'bold 9px system-ui';
            ctx.textAlign = 'right';
            ctx.fillStyle = '#f4e6bf';
            ctx.fillText(
                bucket.groups.length > 1
                    ? `×${bucket.groups.length}`
                    : String(group.units.reduce((sum, unit) => sum + unit.count, 0)),
                20,
                9,
            );
            for (const [offset, value, color] of [
                [12, group.strength, '#a3c886'],
                [16, group.morale, '#7ab9db'],
            ]) {
                ctx.fillStyle = '#071015';
                ctx.fillRect(-17, offset, 34, 2);
                ctx.fillStyle = color;
                ctx.fillRect(-17, offset, (34 * value) / 100, 2);
            }
            if (selected || model.cellSize * camera.zoom > 9) {
                ctx.font = '11px system-ui';
                const width = ctx.measureText(group.name).width + 12;
                const box = { x: x - width / 2, y: y - 39, width };
                if (
                    !labels.some(
                        (other) =>
                            box.x < other.x + other.width + 5 &&
                            box.x + box.width + 5 > other.x &&
                            Math.abs(box.y - other.y) < 21,
                    )
                ) {
                    labels.push(box);
                    ctx.fillStyle = '#0c1825ee';
                    ctx.fillRect(-width / 2, -39, width, 16);
                    ctx.textAlign = 'center';
                    ctx.fillStyle = '#eee6d0';
                    ctx.fillText(group.name, 0, -27);
                }
            }
            ctx.restore();
        }
    }

    drawOrder(ctx, order, screen, selected, preview) {
        let points = order.path.map(screen);
        if (points.length < 2) return;
        // Adjacent orders need room outside the counters, otherwise both ends
        // disappear underneath them. Ground/air arrows bow on opposite sides.
        if (points.length === 2 && Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) < 130) {
            const [start, end] = points,
                side = order.type === 'strike' ? -1 : 1;
            const distance = Math.max(0.001, Math.hypot(end.x - start.x, end.y - start.y));
            const nx = (-(end.y - start.y) / distance) * side;
            const ny = ((end.x - start.x) / distance) * side;
            points = [
                { x: start.x + nx * 27, y: start.y + ny * 27 },
                { x: start.x + nx * 55, y: start.y + ny * 55 },
                { x: end.x + nx * 55, y: end.y + ny * 55 },
                { x: end.x + nx * 27, y: end.y + ny * 27 },
            ];
        } else {
            const end = points.at(-1),
                previous = points.at(-2);
            const distance = Math.hypot(end.x - previous.x, end.y - previous.y);
            const inset = Math.min(26, distance * 0.4);
            points[points.length - 1] = {
                x: end.x - ((end.x - previous.x) / distance) * inset,
                y: end.y - ((end.y - previous.y) / distance) * inset,
            };
        }
        const color = preview ? '#ffe4a6' : order.type === 'move' ? '#9cdbdf' : '#ff9a80';
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.globalAlpha = selected ? 1 : 0.45;
        ctx.strokeStyle = '#07111b';
        ctx.lineWidth = selected ? 6 : 4;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.strokeStyle = color;
        ctx.lineWidth = selected ? 2.5 : 1.5;
        ctx.setLineDash(preview ? [6, 5] : order.type === 'strike' ? [3, 4] : []);
        ctx.stroke();
        ctx.setLineDash([]);
        const end = points.at(-1),
            previous = points.at(-2),
            angle = Math.atan2(end.y - previous.y, end.x - previous.x);
        ctx.translate(end.x, end.y);
        ctx.rotate(angle);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-13, -6);
        ctx.lineTo(-10, 0);
        ctx.lineTo(-13, 6);
        ctx.closePath();
        ctx.fill();
        ctx.rotate(-angle);
        if (selected) {
            ctx.font = 'bold 10px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText(`${preview ? 'PREVIEW ' : ''}${order.type.toUpperCase()}`, 0, -13);
        }
        ctx.restore();
    }
}
