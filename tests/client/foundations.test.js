// Presentation state contracts; native DOM/semantics are covered by the browser gallery.
import assert from 'node:assert/strict';
import { Button, actionLink, button } from '../../resources/js/client/ui/Button.js';
import { FieldShell } from '../../resources/js/client/ui/FieldShell.js';
import { MetricCard } from '../../resources/js/client/ui/MetricCard.js';
import { StatusBadge } from '../../resources/js/client/ui/StatusBadge.js';
import { panel } from '../../resources/js/client/ui/Panel.js';

class Element {
    dataset = {};
    style = { setProperty() {} };
    attributes = new Map();
    children = [];
    textContent = '';
    className = '';
    classList = {
        add: (value) => {
            this.className += ` ${value}`;
        },
    };
    constructor(tag) {
        this.tagName = tag;
    }
    setAttribute(key, value) {
        this.attributes.set(key, String(value));
    }
    getAttribute(key) {
        return this.attributes.get(key) ?? null;
    }
    removeAttribute(key) {
        this.attributes.delete(key);
    }
    get id() {
        return this.getAttribute('id');
    }
    set id(value) {
        this.setAttribute('id', value);
    }
    append(...children) {
        this.children.push(...children);
    }
}
globalThis.document = { createElement: (tag) => new Element(tag) };
const control = new Button({ disabled: true });
control.setPending(true);
control.setPending(false);
assert.equal(control.element.disabled, true, 'Ending pending must not clear business-disabled state');
control.setPending(true);
control.setDisabled(false);
assert.equal(control.element.disabled, true, 'Enabling while pending must not permit duplicate actions');
control.setPending(false);
assert.equal(control.element.disabled, false);
assert.equal(control.element.getAttribute('aria-busy'), 'false');
assert.equal(new Button().element.disabled, false, 'Instances do not share pending state');
assert.throws(() => new Button({ variant: 'delete-game' }), TypeError);
assert.equal(actionLink('Open', '/client').tagName, 'a');
assert.match(button('Continue', 'entry-primary').className, /ui-button--primary/);
const input = new Element('input');
input.setAttribute('aria-describedby', 'external-context');
const field = new FieldShell({ control: input, label: 'Quantity', help: 'Whole units' });
field.setError('Invalid amount');
assert.equal(input.getAttribute('aria-describedby'), `external-context ${input.id}-help ${input.id}-error`);
field.setHelp('');
field.setError('');
assert.equal(input.getAttribute('aria-describedby'), 'external-context');
assert.equal(input.getAttribute('aria-invalid'), 'false');
const other = new FieldShell({ control: new Element('input'), label: 'Other' });
assert.notEqual(input.id, other.input.id);
const metric = new MetricCard({ label: 'Orders', value: 0 });
assert.equal(metric.value.textContent, 0);
metric.update({ value: null });
assert.equal(metric.value.textContent, '—');
assert.throws(() => new StatusBadge({ label: 'Unknown', tone: 'invalid' }), TypeError);
assert.throws(() => panel({ headingLevel: 7 }), TypeError);
delete globalThis.document;
