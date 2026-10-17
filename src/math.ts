/**
 * Мини-разметка для формул в разборах: `z_{n+1} = z_n^2 + c`. Нижний индекс
 * `_x` или `_{…}`, верхний `^x` или `^{…}`. Этого хватает для наших формул и
 * не тянет в сборку KaTeX.
 */
export interface MathToken {
  kind: 'text' | 'sub' | 'sup';
  text: string;
}

export function parseMath(src: string): MathToken[] {
  const tokens: MathToken[] = [];
  let text = '';
  const flush = (): void => {
    if (text) tokens.push({ kind: 'text', text });
    text = '';
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if ((ch === '_' || ch === '^') && i + 1 < src.length) {
      flush();
      let body: string;
      if (src[i + 1] === '{') {
        const close = src.indexOf('}', i + 2);
        const end = close === -1 ? src.length : close;
        body = src.slice(i + 2, end);
        i = end;
      } else {
        body = src[i + 1]!;
        i += 1;
      }
      tokens.push({ kind: ch === '_' ? 'sub' : 'sup', text: body });
    } else {
      text += ch;
    }
  }
  flush();
  return tokens;
}

export function mathEl(src: string, className = 'math'): HTMLElement {
  const el = document.createElement('span');
  el.className = className;
  for (const token of parseMath(src)) {
    if (token.kind === 'text') {
      el.append(token.text);
    } else {
      const part = document.createElement(token.kind);
      part.textContent = token.text;
      el.append(part);
    }
  }
  return el;
}
