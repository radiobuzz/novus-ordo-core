import { el } from '../../ui/dom.js';

/** Retained report rows for the budget and acquisition comparisons. No data ownership. */
export class MetricTable {
    constructor() {
        this.head = el('tr');
        this.body = el('tbody');
        this.element = el('table', { class: 'game-table' }, el('thead', {}, this.head), this.body);
        this.headers = [];
        this.rows = new Map();
    }
    update(headers, rows) {
        while (this.headers.length < headers.length) {
            const cell = el('th', { scope: 'col' });
            this.headers.push(cell);
            this.head.append(cell);
        }
        this.headers.forEach((cell, i) => {
            cell.textContent = headers[i] ?? '';
        });
        const keys = new Set(rows.map((row) => row.key));
        for (const [key, row] of this.rows)
            if (!keys.has(key)) {
                row.element.remove();
                this.rows.delete(key);
            }
        for (const [index, { key, label, values }] of rows.entries()) {
            let row = this.rows.get(key);
            if (!row) {
                const title = el('th', { scope: 'row' });
                const cells = values.map(() => el('td'));
                row = { title, cells, element: el('tr', { 'data-metric': key }, title, ...cells) };
                this.rows.set(key, row);
            }
            if (this.body.children[index] !== row.element)
                this.body.insertBefore(row.element, this.body.children[index] ?? null);
            row.title.textContent = label;
            values.forEach((value, i) => {
                row.cells[i].textContent = value.text;
                row.cells[i].dataset.tone = value.tone ?? 'neutral';
            });
        }
    }
}
