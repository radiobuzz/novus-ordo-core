import { el } from './element.js';
import { actionLink } from './Button.js';
import './destination-nav.scss';

/** Navigation values come from the server; this control owns presentation only. */
export function destinationNav(items = [], current = null, translate = (key) => key) {
    return el(
        'nav',
        { class: 'destination-nav', 'aria-label': translate('destinations.label') },
        items.map((item) => {
            const link = actionLink(translate(`destinations.${item.id}`), item.url, { variant: 'quiet' });
            if (item.id === current) link.setAttribute('aria-current', 'page');
            return link;
        }),
    );
}
