import { restoreMap } from '../../../map/snapshot.js';
import { axialKey, pixelToAxial } from '../../../map/hex.js';

export function mapDefinitionFor(snapshot, territories) {
    if (!snapshot) throw new Error('This game has no generated geography.');
    const model = restoreMap(snapshot, territories);
    return { width: model.width, height: model.height, model };
}

export class HexMapPicker {
    constructor(territories, definition) {
        this.model = definition.model;
        this.update(territories);
    }
    update(territories) {
        this.territories = new Map(territories.map((territory) => [territory.territory_id, territory]));
        for (const region of this.model.regions) {
            const territory = this.territories.get(region.territoryId);
            region.name = territory?.name ?? region.name;
            region.ownerId = territory?.owner_nation_id ?? null;
            for (const id of region.cellIds) {
                const cell = this.model.cellById.get(id);
                cell.politicalOwnerId = region.ownerId;
                cell.controllerId = region.ownerId;
            }
        }
    }
    atWorld(x, y) {
        const model = this.model;
        const point = pixelToAxial(x - model.offsetX, y - model.offsetY, model.cellSize);
        const cell = model.cellById.get(axialKey(point.q, point.r));
        if (!cell) return null;
        return this.territories.get(model.regionById.get(cell.regionId).territoryId) ?? null;
    }
    atScreen(camera, x, y) {
        const point = camera.screenToWorld(x, y);
        return this.atWorld(point.x, point.y);
    }
    center(territory) {
        return this.model.regions.find((region) => region.territoryId === territory.territory_id);
    }
}
