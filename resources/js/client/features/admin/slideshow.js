import { el } from '../../ui/dom.js';
import { panel } from '../../ui/Panel.js';
import { FieldShell } from '../../ui/FieldShell.js';
import { confirmDialog } from '../../ui/ConfirmDialog.js';
import { Scope } from '../../runtime/Scope.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const seconds = (milliseconds) => (milliseconds / 1000).toFixed(milliseconds % 1000 ? 1 : 0);
const clock = (milliseconds) => {
    const total = Math.max(0, milliseconds) / 1000;
    return `${Math.floor(total / 60)}:${String(Math.floor(total % 60)).padStart(2, '0')}`;
};
const slideLength = (slide) => Number(slide.duration_ms) + Number(slide.transition_ms);
const timelineLength = (configuration) =>
    configuration.slides.reduce((sum, slide) => sum + slideLength(slide), 0);
const safeId = () =>
    globalThis.crypto?.randomUUID?.() ?? `slide-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function serializable(configuration) {
    return {
        version: 1,
        fallback: configuration.fallback,
        audio: {
            src: configuration.audio.src,
            name: configuration.audio.name,
            loop: Boolean(configuration.audio.loop),
        },
        slides: configuration.slides.map((slide) => ({
            id: slide.id,
            src: slide.src,
            name: slide.name,
            duration_ms: Number(slide.duration_ms),
            transition: slide.transition,
            transition_ms: Number(slide.transition_ms),
            effect: slide.effect,
            focus_x: Number(slide.focus_x),
            focus_y: Number(slide.focus_y),
        })),
    };
}

function transformFor(effect, progress) {
    const p = Math.max(0, Math.min(1, progress));
    if (effect === 'zoom-in') return `scale(${1 + 0.12 * p})`;
    if (effect === 'zoom-out') return `scale(${1.12 - 0.12 * p})`;
    if (effect === 'pan-left') return `scale(1.1) translateX(${4 - 8 * p}%)`;
    if (effect === 'pan-right') return `scale(1.1) translateX(${-4 + 8 * p}%)`;
    if (effect === 'drift-up') return `scale(1.1) translateY(${4 - 8 * p}%)`;
    if (effect === 'drift-down') return `scale(1.1) translateY(${-4 + 8 * p}%)`;
    return 'scale(1)';
}

function field(control, label, help = '') {
    return new FieldShell({ control, label, help }).element;
}

export async function slideshow(app, scope) {
    let state = await app.service.read('/slideshow', scope);
    let configuration = clone(state.draft);
    let selected = 0;
    let dirty = false;
    let previewTime = 0;
    let frame = null;
    let lastFrame = null;
    let previewSlideId = null;
    let previewPlaying = false;
    let releaseTimelineScope = null;
    let releaseSlideListScope = null;
    let releaseInspectorScope = null;
    let slidePanelTitle = null;

    const status = el('span', { class: 'slideshow-save-status', role: 'status' });
    const preview = el('div', { class: 'slideshow-preview' });
    const previewImage = el('img', { alt: '' });
    const previewShade = el('div', { class: 'slideshow-preview-shade' });
    const previewCaption = el('div', { class: 'slideshow-preview-caption' });
    preview.append(previewImage, previewShade, previewCaption);
    const audio = el('audio', { preload: 'metadata' });
    audio.volume = 0.35;
    const scrubber = el('input', {
        type: 'range',
        min: 0,
        max: timelineLength(configuration),
        value: 0,
        step: 50,
        'aria-label': 'Slideshow timeline position',
    });
    const clockLabel = el('span', { class: 'slideshow-clock' });
    const durationNote = el('p', { class: 'admin-muted slideshow-duration-note' });
    const timeline = el('div', { class: 'slideshow-timeline', 'aria-label': 'Slide timeline' });
    const slideList = el('div', { class: 'slideshow-slide-list' });
    const inspector = el('div', { class: 'slideshow-inspector' });
    const audioName = el('strong');
    const publication = el('p', { class: 'admin-muted' });

    const updateStatus = () => {
        status.textContent = dirty ? 'Unsaved draft changes' : 'Draft saved';
        status.dataset.dirty = String(dirty);
        publication.textContent = state.published_at
            ? `Published ${new Date(state.published_at).toLocaleString()}. Changes remain private until you publish again.`
            : 'The bundled presentation is live. This draft has not been published from the editor yet.';
    };

    const locate = (milliseconds) => {
        const total = timelineLength(configuration);
        let cursor = total ? ((milliseconds % total) + total) % total : 0;
        for (let index = 0; index < configuration.slides.length; index++) {
            const length = slideLength(configuration.slides[index]);
            if (cursor < length || index === configuration.slides.length - 1)
                return { index, local: cursor, length };
            cursor -= length;
        }
        return { index: 0, local: 0, length: 1 };
    };

    const showPreview = () => {
        const total = timelineLength(configuration);
        const position = total ? previewTime % total : 0;
        const { index, local, length } = locate(position);
        const slide = configuration.slides[index];
        if (!slide) return;
        if (previewSlideId !== slide.id) {
            previewSlideId = slide.id;
            previewImage.src = slide.url;
        }
        const progress = length ? local / length : 0;
        previewImage.style.objectPosition = `${slide.focus_x}% ${slide.focus_y}%`;
        previewImage.style.transform = transformFor(slide.effect, progress);
        previewImage.style.opacity =
            previewPlaying && slide.transition === 'fade' && slide.transition_ms > 0
                ? String(Math.min(1, local / slide.transition_ms))
                : '1';
        previewCaption.textContent = `${index + 1}. ${slide.name} · ${clock(position)} / ${clock(total)}`;
        scrubber.max = String(Math.max(1, total));
        scrubber.value = String(Math.min(position, total));
        clockLabel.textContent = `${clock(position)} / ${clock(total)}`;
    };

    const tick = (timestamp) => {
        if (previewPlaying && !audio.paused && Number.isFinite(audio.currentTime))
            previewTime = audio.currentTime * 1000;
        else if (previewPlaying && lastFrame != null) previewTime += timestamp - lastFrame;
        lastFrame = timestamp;
        const total = timelineLength(configuration);
        if (audio.paused && total && previewTime >= total) previewTime %= total;
        showPreview();
        frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    scope.own(() => cancelAnimationFrame(frame));
    scope.own(() => {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
    });

    const setDirty = () => {
        dirty = true;
        updateStatus();
    };

    const selectSlide = (index) => {
        selected = Math.max(0, Math.min(configuration.slides.length - 1, index));
        renderSlides();
        renderInspector();
    };

    const jumpToSlide = (index) => {
        previewTime = configuration.slides
            .slice(0, index)
            .reduce((sum, slide) => sum + slideLength(slide), 0);
        if (Number.isFinite(audio.duration)) audio.currentTime = Math.min(audio.duration, previewTime / 1000);
        showPreview();
    };

    const renderTimeline = () => {
        releaseTimelineScope?.();
        const timelineScope = new Scope();
        releaseTimelineScope = scope.own(() => timelineScope.dispose());
        const total = timelineLength(configuration) || 1;
        timeline.replaceChildren(
            ...configuration.slides.map((slide, index) => {
                const segment = el(
                    'button',
                    {
                        type: 'button',
                        class: 'slideshow-timeline-segment',
                        title: `${index + 1}. ${slide.name} · ${seconds(slideLength(slide))} seconds`,
                        'aria-label': `Select slide ${index + 1}: ${slide.name}`,
                    },
                    el('img', { src: slide.url, alt: '' }),
                    el('span', { text: String(index + 1) }),
                );
                segment.style.flexGrow = String(slideLength(slide) / total);
                timelineScope.listen(segment, 'click', () => {
                    selectSlide(index);
                    jumpToSlide(index);
                });
                return segment;
            }),
        );
    };

    const renderSlides = () => {
        releaseSlideListScope?.();
        const listScope = new Scope();
        releaseSlideListScope = scope.own(() => listScope.dispose());
        slideList.replaceChildren(
            ...configuration.slides.map((slide, index) => {
                const choose = el(
                    'button',
                    {
                        type: 'button',
                        class: `slideshow-slide-card${index === selected ? ' is-selected' : ''}`,
                        'aria-pressed': String(index === selected),
                    },
                    el('img', { src: slide.url, alt: '' }),
                    el(
                        'span',
                        {},
                        el('strong', { text: `${index + 1}. ${slide.name}` }),
                        el('small', {
                            text: `${seconds(slide.duration_ms)}s hold · ${slide.effect.replaceAll('-', ' ')}`,
                        }),
                    ),
                );
                listScope.listen(choose, 'click', () => {
                    selectSlide(index);
                    jumpToSlide(index);
                });
                return choose;
            }),
        );
        if (slidePanelTitle) slidePanelTitle.textContent = `Slides · ${configuration.slides.length}`;
        renderTimeline();
    };

    const renderInspector = () => {
        releaseInspectorScope?.();
        const inspectorScope = new Scope();
        releaseInspectorScope = scope.own(() => inspectorScope.dispose());
        const slide = configuration.slides[selected];
        if (!slide) return inspector.replaceChildren(el('p', { text: 'Add an image to begin.' }));
        const name = el('input', { type: 'text', maxlength: 180, value: slide.name });
        const hold = el('input', {
            type: 'number',
            min: 0.5,
            max: 120,
            step: 0.1,
            value: seconds(slide.duration_ms),
        });
        const transition = el(
            'select',
            {},
            ...state.transitions.map((value) =>
                el('option', {
                    value,
                    text: value[0].toUpperCase() + value.slice(1),
                    selected: value === slide.transition,
                }),
            ),
        );
        const transitionTime = el('input', {
            type: 'number',
            min: 0,
            max: 10,
            step: 0.1,
            value: seconds(slide.transition_ms),
        });
        const effect = el(
            'select',
            {},
            ...state.effects.map((value) =>
                el('option', {
                    value,
                    text: value === 'none' ? 'Still image' : value.replaceAll('-', ' '),
                    selected: value === slide.effect,
                }),
            ),
        );
        const focusX = el('input', { type: 'range', min: 0, max: 100, step: 1, value: slide.focus_x });
        const focusY = el('input', { type: 'range', min: 0, max: 100, step: 1, value: slide.focus_y });
        const bind = (control, key, parse = (value) => value) =>
            inspectorScope.listen(control, 'input', () => {
                slide[key] = parse(control.value);
                setDirty();
                renderSlides();
                showPreview();
            });
        bind(name, 'name');
        bind(hold, 'duration_ms', (value) => Math.round(Number(value) * 1000));
        bind(transition, 'transition');
        bind(transitionTime, 'transition_ms', (value) => Math.round(Number(value) * 1000));
        bind(effect, 'effect');
        bind(focusX, 'focus_x', Number);
        bind(focusY, 'focus_y', Number);

        const move = (direction) => {
            const target = selected + direction;
            if (target < 0 || target >= configuration.slides.length) return;
            [configuration.slides[selected], configuration.slides[target]] = [
                configuration.slides[target],
                configuration.slides[selected],
            ];
            selected = target;
            setDirty();
            renderSlides();
            renderInspector();
            jumpToSlide(selected);
        };
        const remove = async () => {
            if (configuration.slides.length === 1) {
                app.notify('A slideshow needs at least one image.', true);
                return;
            }
            if (
                !(await confirmDialog(scope, {
                    title: 'Remove this slide?',
                    message: `${slide.name} will be removed from the draft. The uploaded image remains available to the published version.`,
                    confirmLabel: 'Remove slide',
                }))
            )
                return;
            configuration.slides.splice(selected, 1);
            selected = Math.min(selected, configuration.slides.length - 1);
            setDirty();
            renderSlides();
            renderInspector();
            jumpToSlide(selected);
        };
        inspector.replaceChildren(
            el('div', { class: 'slideshow-selected-image' }, el('img', { src: slide.url, alt: '' })),
            el(
                'div',
                { class: 'slideshow-field-grid' },
                field(name, 'Slide name'),
                field(hold, 'Hold time (seconds)', 'Time at full visibility, after its transition.'),
                field(transition, 'Transition'),
                field(transitionTime, 'Transition time (seconds)'),
                field(effect, 'Camera movement', 'Movement runs for this slide’s complete timeline segment.'),
                field(focusX, 'Horizontal focal point'),
                field(focusY, 'Vertical focal point'),
            ),
            el(
                'div',
                { class: 'admin-actions' },
                app.button(inspectorScope, 'Move earlier', () => move(-1), { variant: 'quiet' }),
                app.button(inspectorScope, 'Move later', () => move(1), { variant: 'quiet' }),
                app.button(inspectorScope, 'Remove slide', remove, { variant: 'danger' }),
            ),
        );
    };

    const loadAudio = () => {
        audio.pause();
        audio.src = configuration.audio.url;
        audio.loop = configuration.audio.loop;
        audio.load();
        audioName.textContent = configuration.audio.name;
        previewTime = 0;
        showPreview();
    };

    const imageUpload = el('input', {
        type: 'file',
        accept: 'image/png,image/jpeg,image/webp',
        multiple: true,
    });
    const audioUpload = el('input', {
        type: 'file',
        accept: 'audio/mpeg,audio/ogg,audio/wav,audio/mp4,.mp3,.ogg,.wav,.m4a',
    });
    scope.listen(imageUpload, 'change', async () => {
        const files = [...imageUpload.files];
        if (!files.length) return;
        await app.run(async () => {
            for (const file of files) {
                const body = new FormData();
                body.append('asset', file);
                const asset = await app.service.write('/slideshow/assets/image', body);
                configuration.slides.push({
                    id: safeId(),
                    ...asset,
                    duration_ms: 5000,
                    transition: 'fade',
                    transition_ms: 1800,
                    effect: 'zoom-in',
                    focus_x: 50,
                    focus_y: 50,
                });
            }
            selected = configuration.slides.length - 1;
            setDirty();
            renderSlides();
            renderInspector();
            jumpToSlide(selected);
            app.notify(`${files.length} image${files.length === 1 ? '' : 's'} added to the draft.`);
        });
        imageUpload.value = '';
    });
    scope.listen(audioUpload, 'change', async () => {
        const file = audioUpload.files[0];
        if (!file) return;
        await app.run(async () => {
            const body = new FormData();
            body.append('asset', file);
            const asset = await app.service.write('/slideshow/assets/audio', body);
            configuration.audio = { ...asset, loop: configuration.audio.loop };
            setDirty();
            loadAudio();
            app.notify('Music added to the draft. Adjust the slide timings, then save or publish.');
        });
        audioUpload.value = '';
    });

    const play = app.button(scope, 'Play preview', async () => {
        if (!audio.paused) {
            audio.pause();
            previewPlaying = false;
            play.textContent = 'Play preview';
            return;
        }
        if (Number.isFinite(audio.duration)) audio.currentTime = Math.min(audio.duration, previewTime / 1000);
        previewPlaying = true;
        await audio.play();
        play.textContent = 'Pause preview';
    });
    scope.listen(audio, 'pause', () => {
        previewPlaying = false;
        play.textContent = 'Play preview';
    });
    scope.listen(audio, 'play', () => {
        previewPlaying = true;
        play.textContent = 'Pause preview';
    });
    scope.listen(audio, 'loadedmetadata', () => {
        const timeline = timelineLength(configuration);
        durationNote.textContent = `Music ${clock(audio.duration * 1000)} · visual timeline ${clock(timeline)} · ${
            Math.abs(audio.duration * 1000 - timeline) < 500
                ? 'timings aligned'
                : 'adjust slide timing to align their endings'
        }.`;
    });
    scope.listen(scrubber, 'input', () => {
        audio.pause();
        previewTime = Number(scrubber.value);
        if (Number.isFinite(audio.duration)) audio.currentTime = Math.min(audio.duration, previewTime / 1000);
        const { index } = locate(previewTime);
        if (index !== selected) selectSlide(index);
        showPreview();
    });
    const volume = el('input', {
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        value: audio.volume,
        'aria-label': 'Preview volume',
    });
    scope.listen(volume, 'input', () => (audio.volume = Number(volume.value)));
    const loop = el('input', { type: 'checkbox', checked: configuration.audio.loop });
    scope.listen(loop, 'change', () => {
        configuration.audio.loop = loop.checked;
        audio.loop = loop.checked;
        setDirty();
    });

    const save = async () => {
        await app.run(async () => {
            state = await app.service.write('/slideshow', {
                revision: state.revision,
                configuration: serializable(configuration),
            });
            configuration = clone(state.draft);
            dirty = false;
            updateStatus();
            app.notify('Slideshow draft saved. The homepage is unchanged until you publish.');
        });
    };
    const publish = async () => {
        if (
            !(await confirmDialog(scope, {
                title: 'Publish this homepage presentation?',
                message:
                    'The current images, timing, movement effects and music will become visible to visitors immediately.',
                confirmLabel: 'Publish slideshow',
                danger: false,
            }))
        )
            return;
        await app.run(async () => {
            if (dirty) {
                state = await app.service.write('/slideshow', {
                    revision: state.revision,
                    configuration: serializable(configuration),
                });
                configuration = clone(state.draft);
            }
            state = await app.service.write('/slideshow/publish', { revision: state.revision });
            configuration = clone(state.draft);
            dirty = false;
            updateStatus();
            app.notify('Homepage slideshow published. New visitors will receive this presentation.');
        });
    };
    const restore = async () => {
        if (
            !(await confirmDialog(scope, {
                title: 'Restore the published version?',
                message:
                    'Your current draft changes will be replaced in the editor. The homepage itself will not change.',
                confirmLabel: 'Restore published version',
            }))
        )
            return;
        configuration = clone(state.published);
        selected = 0;
        dirty = true;
        loadAudio();
        loop.checked = configuration.audio.loop;
        renderSlides();
        renderInspector();
        updateStatus();
    };

    loadAudio();
    renderSlides();
    renderInspector();
    updateStatus();

    const slidePanel = panel({ title: `Slides · ${configuration.slides.length}` }, slideList);
    slidePanelTitle = slidePanel.querySelector('.ui-panel-title');

    return el(
        'div',
        { class: 'admin-stack slideshow-editor' },
        el(
            'div',
            { class: 'admin-page-heading' },
            el(
                'div',
                {},
                el('p', { class: 'admin-eyebrow', text: 'Entry presentation' }),
                el('h1', { text: 'Homepage slideshow' }),
            ),
            el(
                'div',
                { class: 'admin-actions' },
                status,
                app.button(scope, 'Save draft', save),
                app.button(scope, 'Publish', publish, { variant: 'primary' }),
            ),
        ),
        publication,
        el(
            'div',
            { class: 'slideshow-workspace' },
            panel(
                { title: 'Live preview', tone: 'accent', className: 'slideshow-preview-panel' },
                preview,
                el('div', { class: 'slideshow-transport' }, play, scrubber, clockLabel, volume),
                durationNote,
                timeline,
            ),
            panel(
                { title: 'Presentation assets' },
                el('p', { class: 'admin-muted' }, 'Music: ', audioName),
                field(
                    audioUpload,
                    'Replace music',
                    `MP3, OGG, WAV or M4A · maximum ${state.limits.audio_mb} MB`,
                ),
                el(
                    'label',
                    { class: 'slideshow-check' },
                    loop,
                    el('span', { text: 'Loop music and presentation' }),
                ),
                field(
                    imageUpload,
                    'Add slideshow images',
                    `PNG, JPEG or WebP · maximum ${state.limits.image_mb} MB each`,
                ),
                el(
                    'div',
                    { class: 'admin-actions' },
                    app.button(scope, 'Restore published', restore, { variant: 'quiet' }),
                ),
            ),
        ),
        el(
            'div',
            { class: 'slideshow-edit-grid' },
            slidePanel,
            panel({ title: 'Selected slide' }, inspector),
        ),
    );
}
