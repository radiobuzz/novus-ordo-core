export function projectBattleMarkers(news, participantBattles) {
    const privateById = new Map(participantBattles.map((battle) => [battle.battle_id, battle]));
    const grouped = new Map();
    for (const item of news) {
        const battle = item.context;
        if (battle?.type !== 'battle' || !Number.isInteger(battle.territory_id)) continue;
        const marker = grouped.get(battle.territory_id) ?? {
            territoryId: battle.territory_id,
            count: 0,
            conquered: 0,
            repelled: 0,
            attackerLosses: 0,
            defenderLosses: 0,
            knownLosses: false,
        };
        marker.count++;
        marker[battle.outcome === 'conquered' ? 'conquered' : 'repelled']++;
        const detail = privateById.get(battle.battle_id);
        if (
            detail &&
            Number.isInteger(detail.attacker_formation_losses) &&
            Number.isInteger(detail.defender_formation_losses)
        ) {
            marker.attackerLosses += detail.attacker_formation_losses;
            marker.defenderLosses += detail.defender_formation_losses;
            marker.knownLosses = true;
        }
        grouped.set(battle.territory_id, marker);
    }
    return [...grouped.values()];
}

function swords(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const angle of [-Math.PI / 4, Math.PI / 4]) {
        ctx.save();
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(0, 7);
        ctx.moveTo(-4, 4);
        ctx.lineTo(4, 4);
        ctx.stroke();
        ctx.restore();
    }
    ctx.restore();
}

/** Public battle locations with participant-only casualty summaries. */
export function battleOverlay(markers) {
    return (ctx, renderer) => {
        const { camera, context } = renderer;
        const territories = new Map(
            context.territories.map((territory) => [territory.territory_id, territory]),
        );
        ctx.save();
        ctx.setTransform(
            renderer.canvas.width / camera.width,
            0,
            0,
            renderer.canvas.height / camera.height,
            0,
            0,
        );
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const marker of markers) {
            const territory = territories.get(marker.territoryId);
            if (!territory) continue;
            const world = context.picker.center?.(territory) ?? {
                x: (territory.x + 0.5) * context.definition.tileWidth,
                y: (territory.y + 0.5) * context.definition.tileHeight,
            };
            const { x, y } = camera.worldToScreen(world.x, world.y);
            if (x < -30 || y < -30 || x > camera.width + 30 || y > camera.height + 30) continue;
            ctx.fillStyle = marker.conquered ? '#a74343' : '#6d596f';
            ctx.beginPath();
            ctx.arc(x, y - 23, 13, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#f4d18a';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            swords(ctx, x, y - 23);
            if (marker.count > 1) {
                ctx.fillStyle = '#f4d18a';
                ctx.font = 'bold 9px system-ui';
                ctx.fillText(`×${marker.count}`, x + 15, y - 34);
            }
            if (marker.knownLosses) {
                const text = `A −${marker.attackerLosses}  D −${marker.defenderLosses}`;
                ctx.font = 'bold 9px system-ui';
                const width = ctx.measureText(text).width + 10;
                ctx.fillStyle = 'rgba(17, 25, 29, .92)';
                ctx.fillRect(x - width / 2, y - 7, width, 16);
                ctx.fillStyle = '#f4eee2';
                ctx.fillText(text, x, y + 1);
            }
        }
        ctx.restore();
    };
}
