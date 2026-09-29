import { TerrainV2 as SharedTerrainV2 } from '../map/terrain-v2.js';
import { DevelopmentLandscape, developmentSurfaceKey } from './development-landscape.js';

/** The laboratory alone supplies its synthetic development artwork. */
export class TerrainV2 extends SharedTerrainV2 {
    constructor(invalidate) {
        super(invalidate, { createLandscape: (data, layers) => new DevelopmentLandscape(data, layers), surfaceKey: developmentSurfaceKey });
    }
}
