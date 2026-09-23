/** Text-safe DOM construction; no feature, lifecycle or theme knowledge. */
export function el(tag, attributes = {}, ...children) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
        if (value === false || value === null || value === undefined) continue;
        if (name === 'class') node.className = value;
        else if (name === 'text') node.textContent = value;
        else node.setAttribute(name, value === true ? '' : String(value));
    }
    for (const child of children.flat()) if (child != null) node.append(child);
    return node;
}
