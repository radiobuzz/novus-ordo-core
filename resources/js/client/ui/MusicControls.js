import { button, el } from './dom.js';
export function musicControls(scope, i18n, audio) {
    const toggle = button('', 'music-toggle');
    const volume = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: audio.volume });
    i18n.bind(scope, volume, 'audio.volume', {}, 'aria-label');
    const element = el('div', { class: 'music-controls' }, toggle, volume);
    const update = () => {
        element.hidden = !audio.eligible;
        toggle.textContent = i18n.t(audio.status === 'playing' ? 'audio.mute' : 'audio.play');
        toggle.setAttribute('aria-pressed', String(audio.status === 'playing'));
        toggle.title = i18n.t(`audio.${audio.status}`);
    };
    scope.listen(toggle, 'click', () => audio.toggle());
    scope.listen(volume, 'input', () => audio.setVolume(volume.value));
    audio.changed.subscribe(scope, update);
    i18n.changed.subscribe(scope, update);
    update();
    return element;
}
