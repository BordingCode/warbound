// Tiny DOM builder. el('button.btn#go', {onclick}, [kids]). From gamedev-kb recipe.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function el(tag, props = {}, children = []) {
  const parts = tag.split(/(?=[.#])/);
  // If the string starts with '.' or '#' there is no leading tag name -> default to div.
  const hasTag = parts[0] && parts[0][0] !== '.' && parts[0][0] !== '#';
  const node = document.createElement(hasTag ? parts[0] : 'div');
  for (const p of (hasTag ? parts.slice(1) : parts)) {
    if (p[0] === '.') p.slice(1).split(/\s+/).filter(Boolean).forEach((c) => node.classList.add(c));
    else if (p[0] === '#') node.id = p.split(/\s+/)[0].slice(1);
  }
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className += ' ' + v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}
