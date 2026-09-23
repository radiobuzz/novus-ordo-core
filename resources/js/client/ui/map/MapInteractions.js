/** Shared gesture arbitration. The active tool decides what a click means. */
export class MapInteractions {
    constructor(canvas, camera, renderer, picker, scope, tool) {
        const pointers = new Map();
        let dragged = false;
        let origin;
        let pinch;
        let gesture = 'pan';
        let primary = true;
        const cancel = () => {
            tool.previewBox?.(null);
            pointers.clear();
            dragged = true;
            canvas.classList.remove('is-panning');
        };
        scope.listen(canvas, 'contextmenu', (event) => event.preventDefault());
        scope.listen(window, 'blur', cancel);
        const position = (event) => {
            const r = canvas.getBoundingClientRect();
            return { x: event.clientX - r.left, y: event.clientY - r.top };
        };
        const pair = () => {
            const [a, b] = [...pointers.values()];
            return {
                x: (a.x + b.x) / 2,
                y: (a.y + b.y) / 2,
                distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
            };
        };
        scope.listen(canvas, 'pointerdown', (event) => {
            if (![0, 2].includes(event.button)) return;
            event.preventDefault();
            canvas.focus({ preventScroll: true });
            const p = position(event);
            pointers.set(event.pointerId, p);
            canvas.setPointerCapture(event.pointerId);
            if (pointers.size === 1) {
                origin = p;
                dragged = false;
                primary = event.button === 0;
                gesture = primary && event.pointerType !== 'touch' && tool.boxEnabled?.() ? 'box' : 'pan';
            } else {
                dragged = true;
                gesture = 'pan';
                tool.previewBox?.(null);
                pinch = pair();
            }
            canvas.classList.toggle('is-panning', gesture === 'pan');
        });
        scope.listen(canvas, 'pointermove', (event) => {
            const p = position(event),
                previous = pointers.get(event.pointerId);
            if (!previous) {
                const t = picker.atScreen(camera, p.x, p.y);
                canvas.title = t?.name ?? '';
                return;
            }
            pointers.set(event.pointerId, p);
            if (pointers.size > 1) {
                const next = pair();
                camera.pan(next.x - pinch.x, next.y - pinch.y);
                camera.zoomAt(next.distance / pinch.distance, next.x, next.y);
                pinch = next;
            } else {
                if (Math.hypot(p.x - origin.x, p.y - origin.y) > 5) dragged = true;
                if (dragged && gesture === 'box') tool.previewBox?.({ a: origin, b: p });
                else if (dragged) camera.pan(p.x - previous.x, p.y - previous.y);
            }
            renderer.invalidate();
        });
        const end = (event) => {
            if (!pointers.has(event.pointerId)) return;
            const p = position(event);
            if (event.type === 'pointerup' && pointers.size === 1 && primary) {
                if (dragged && gesture === 'box') tool.selectBox?.({ a: origin, b: p }, event);
                else if (!dragged) tool.select(picker.atScreen(camera, p.x, p.y), p, event);
            }
            tool.previewBox?.(null);
            pointers.delete(event.pointerId);
            if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
            if (!pointers.size) canvas.classList.remove('is-panning');
            else {
                origin = [...pointers.values()][0];
                dragged = true;
                gesture = 'pan';
            }
        };
        for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
            scope.listen(canvas, event, end);
        scope.listen(
            canvas,
            'wheel',
            (event) => {
                event.preventDefault();
                if (pointers.size) cancel();
                const p = position(event);
                camera.zoomAt(Math.exp(-Math.max(-200, Math.min(200, event.deltaY)) * 0.003), p.x, p.y);
                renderer.invalidate();
            },
            { passive: false },
        );
        scope.listen(canvas, 'keydown', (event) => {
            if (event.key === 'Escape') {
                cancel();
                return;
            }
            const arrows = {
                ArrowLeft: [70, 0],
                ArrowRight: [-70, 0],
                ArrowUp: [0, 70],
                ArrowDown: [0, -70],
            };
            if (arrows[event.key]) camera.pan(...arrows[event.key]);
            else if (['+', '='].includes(event.key)) camera.zoomAt(1.3);
            else if (event.key === '-') camera.zoomAt(1 / 1.3);
            else if (event.key === 'Home') camera.fit();
            else return;
            event.preventDefault();
            if (pointers.size) cancel();
            renderer.invalidate();
        });
    }
}
