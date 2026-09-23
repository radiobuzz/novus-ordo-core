import { MapRenderer } from '../map/renderer.js';
import { nations, reachableCells } from './model.js';
import { traceHex } from './hex.js';
import { MilitaryOverlay } from './military-renderer.js';
import { ExperimentOverlay } from './experiment-renderer.js';
import { AtlasOverlay } from './atlas-renderer.js';
import { TerrainV2 } from './terrain-v2.js';
import { administrationActive } from './administration.js';
import { AdministrationOverlay } from './administration-renderer.js';
export { terrainLabel } from '../map/renderer.js';

/** Optional sandbox simulation layered on the shared geographic renderer. */
export class MapLabRenderer extends MapRenderer {
    militaryOverlay = new MilitaryOverlay();
    experimentOverlay = new ExperimentOverlay();
    atlasOverlay = new AtlasOverlay();
    administrationOverlay = new AdministrationOverlay();
    terrainV2 = new TerrainV2(() => this.invalidate());

    constructor(canvas, camera, getState, onDraw) {
        super(
            canvas,
            camera,
            () => {
                const state = getState();
                const adminActive = administrationActive(state);
                const span = state.model.cellSize * Math.sqrt(state.model.cellCount) * 1.4;
                const bounds = camera.worldBounds();
                const chunks =
                    (Math.ceil((bounds.right - bounds.left) / span) + 2) *
                    (Math.ceil((bounds.bottom - bounds.top) / span) + 2);
                const activeTerrainV2 =
                    state.layers.terrainV2 &&
                    state.view === 'terrain' &&
                    state.layers.terrain &&
                    state.layers.tiles &&
                    span * camera.zoom >= 96 &&
                    chunks <= 96;
                return {
                    ...state,
                    nations,
                    activeTerrainV2,
                    layers: {
                        ...state.layers,
                        ...(adminActive
                            ? {
                                  political: false,
                                  control: false,
                                  damage: false,
                                  formations: false,
                                  flags: false,
                                  economy: false,
                                  naval: false,
                                  resources: false,
                              }
                            : {}),
                        tiles: activeTerrainV2 ? false : state.layers.tiles,
                        names: state.layers.borders,
                    },
                };
            },
            onDraw,
        );
    }
    drawUnderlay(ctx, state) {
        this.terrainV2.draw(ctx, state, this.camera);
        if (state.activeTerrainV2) this.drawV2Tints(ctx, state);
        this.experimentOverlay.drawEconomy(ctx, state);
        if (this.atlasOverlay.drawWorld(ctx, state)) this.invalidate();
        this.administrationOverlay.drawFill(ctx, state);
    }
    drawCell(ctx, cell, state) {
        return super.drawCell(
            ctx,
            cell,
            state.activeTerrainV2
                ? { ...state, layers: { ...state.layers, political: false, control: false, damage: false } }
                : state,
        );
    }
    drawOverviewCells(ctx, state, visibleCells) {
        return super.drawOverviewCells(
            ctx,
            state.activeTerrainV2
                ? { ...state, layers: { ...state.layers, political: false, control: false, damage: false } }
                : state,
            visibleCells,
        );
    }
    drawWater(ctx, state, blendedShore) {
        if (!state.activeTerrainV2) return super.drawWater(ctx, state, blendedShore);
        if (state.layers.rivers) this.terrainV2.drawRivers(ctx, state.model, this.camera);
    }
    drawV2Tints(ctx, state) {
        const { model, layers } = state;
        if (!layers.political && !layers.control && !layers.damage) return;
        ctx.save();
        for (const cell of this.visibleCells(model)) {
            if (['ocean', 'lake'].includes(cell.terrain)) continue;
            ctx.beginPath();
            traceHex(ctx, cell.x, cell.y, model.cellSize);
            if (layers.political && cell.politicalOwnerId) {
                ctx.fillStyle = this.nationColor(cell.politicalOwnerId);
                ctx.globalAlpha = 0.23;
                ctx.fill();
            }
            if (layers.control && cell.controllerId && cell.controllerId !== cell.politicalOwnerId) {
                ctx.fillStyle = this.nationColor(cell.controllerId);
                ctx.globalAlpha = 0.72;
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            if (layers.damage && cell.damage) {
                ctx.strokeStyle = `rgba(46,25,20,${0.28 + cell.damage * 0.14})`;
                ctx.lineWidth = 1.2;
                const spread = model.cellSize * 0.42;
                for (let i = -cell.damage; i <= cell.damage; i += 2) {
                    ctx.beginPath();
                    ctx.moveTo(cell.x - spread, cell.y + i * 2 - spread / 2);
                    ctx.lineTo(cell.x + spread, cell.y + i * 2 + spread / 2);
                    ctx.stroke();
                }
            }
        }
        ctx.restore();
    }
    destroy() {
        this.terrainV2.destroy();
        super.destroy();
    }
    drawWorldOverlays(ctx, state) {
        this.atlasOverlay.drawHighlights(ctx, state);
        this.administrationOverlay.drawBorders(ctx, state, this.camera);
        if (administrationActive(state)) return;
        if (state.armySelected && !state.layers.formations) this.drawReachable(ctx, state);
        if (!state.layers.formations) this.drawArmy(ctx, state);
    }
    drawScreenOverlays(ctx, state, camera) {
        this.atlasOverlay.drawScreen(ctx, state, camera);
        this.militaryOverlay.draw(ctx, state, camera);
        this.experimentOverlay.drawScreen(ctx, state, camera);
        this.administrationOverlay.drawLabels(ctx, state, camera);
    }

    drawFeatures(ctx, state, cells) {
        if (!administrationActive(state)) super.drawFeatures(ctx, state, cells);
    }

    drawReachable(ctx, { model }) {
        ctx.fillStyle = 'rgba(255, 218, 134, 0.19)';
        ctx.strokeStyle = 'rgba(255, 224, 157, 0.9)';
        ctx.lineWidth = 2;
        for (const cell of reachableCells(model)) {
            ctx.beginPath();
            traceHex(ctx, cell.x, cell.y, model.cellSize * 0.79);
            ctx.fill();
            ctx.stroke();
        }
    }

    drawArmy(ctx, { model, armySelected }) {
        const cell = model.cellById.get(model.army.cellId);
        const radius = model.cellSize * 0.28;
        ctx.fillStyle = nations[model.army.nationId].color;
        ctx.strokeStyle = armySelected ? '#fff2c9' : '#d9e9f6';
        ctx.lineWidth = armySelected ? 3 : 1.8;
        ctx.beginPath();
        ctx.moveTo(cell.x, cell.y - radius);
        ctx.lineTo(cell.x + radius, cell.y);
        ctx.lineTo(cell.x, cell.y + radius);
        ctx.lineTo(cell.x - radius, cell.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#f7fbff';
        ctx.font = `600 ${Math.max(8, model.cellSize * 0.23)}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(model.army.strength), cell.x, cell.y + 0.5);
    }
}
