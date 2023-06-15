import {
  X_CHAR,
  VOID_ELEMENTS,
  EventFlag,
  StyleAttributeFlag,
  SvgAttributeFlag,
  AttributeFlag,
  ChildFlag,
  BlockFlag,
  SetHas$,
} from './constants';
import { AbstractBlock } from './types';
import type { Edit, VNode, EditBase } from './types';

function pushEdits(edits: any[], { t, n = null, v = null, h = null, i = null, l = null, p = null, b = null } : EditBase ){
  edits.push({ t, n, v, h, i, l, p, b })
}

export const renderToTemplate = (
  vnode: VNode,
  edits: Edit[] = [],
  path: number[] = [],
): string => {
  if (
    typeof vnode === 'string' ||
    typeof vnode === 'number' ||
    typeof vnode === 'bigint' ||
    vnode === true
  ) {
    return String(vnode);
  }
  if(!vnode) return '';
  let props = '';
  let children = '';
  const current: Edit = {
    p: path, // The location of the edit in in the virtual node tree
    e: [], // Occur on mount + patch
    i: [], // Occur before mount
  };

  for (let name in vnode.props) {
    if (name === 'key' || name === 'ref' || name === 'children') {
      continue;
    }
    
    const value = vnode.props[name]
    
    if (name === 'className') name = 'class';
    if (name === 'htmlFor') name = 'for';
    
    if (name.startsWith('on')) {
      const isValueHole = '$' in value;
      // Make edits monomorphic
      if (isValueHole) {
        pushEdits(current.e, {
          /* type */ t: EventFlag,
          /* name */ n: name.slice(2),
          /* hole */ h: value.$
        });
      } else {
        pushEdits(current.i, {
          /* type */ t: EventFlag,
          /* name */ n: name.slice(2),
          /* listener */ l: value,
        });
      }

      continue;
    }

    if (value) {
      if (typeof value === 'object' && '$' in value) {
        if (name === 'style' || name.charCodeAt(0) === X_CHAR) {
          pushEdits(current.e, {
            /* type */ t: name === 'style' ? StyleAttributeFlag : SvgAttributeFlag,
            /* name */ n: name,
            /* hole */ h: value.$
          });
        } else {
          pushEdits(current.e, {
            /* type */ t: AttributeFlag,
            /* name */ n: name,
            /* hole */ h: value.$
          });
        }
        continue;
      }
      if (name === 'style') {
        let style = '';
        for (const key in value) {
          style += `${key}:${String(value[key])};`;
        }
        props += ` style="${style}"`;
        continue;
      }
      props += ` ${name}="${String(value)}"`;
    }
  }

  if (SetHas$.call(VOID_ELEMENTS, vnode.type)) {
    if (current.e.length) edits.push(current);
    return `<${vnode.type}${props} />`;
  }

  // 👎: 'foo' + Block + 'bar' => 'foobaz'.
  //                                      ↕️ Block edit here
  // 👍: 'foo' + Block + 'bar'   => 'foo', 'bar'
  let canMergeString = false;
  for (let i = 0, j = vnode.props.children?.length || 0, k = 0; i < j; ++i) {
    const child = vnode.props.children?.[i];
    if (child === null || child === undefined || child === false) continue;

    if (typeof child === 'object' && '$' in child) {
      pushEdits(current.e, {
        /* type */ t: ChildFlag,
        /* hole */ h: child.$,
        /* index */ i,
      });
      continue;
    }

    if (child instanceof AbstractBlock) {
      pushEdits(current.e, {
        /* type */ t: BlockFlag,
        /* index */ i,
        /* block */ b: child,
      });

      continue;
    }

    if (
      typeof child === 'string' ||
      typeof child === 'number' ||
      typeof child === 'bigint'
    ) {
      const value = String(child)
      if (canMergeString) {
        pushEdits(current.i, {
          /* type */ t: ChildFlag,
          /* value */ v: value,
          /* index */ i
        });
        continue;
      }
      canMergeString = true;
      children += value;
      k++;
      continue;
    }

    canMergeString = false;
    const newPath = path.slice();
    newPath.push(k++);
    children += renderToTemplate(child, edits, newPath);
  }

  if (current.i!.length || current.e.length) edits.push(current);

  return `<${vnode.type}${props}>${children}</${vnode.type}>`;
};
