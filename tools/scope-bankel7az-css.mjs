/* تطويق أنماط بنك الحظ داخل .bank-el7az-root حتى لا تتسرب لبقية تطبيق قييمد
 * - :root / html / body / #root → .bank-el7az-root
 * - كل محدد آخر يُسبق بـ .bank-el7az-root
 * - @keyframes تُترك كما هي، @media تُعالج داخليًا
 * - 100vw → 100% و 100dvh → 100% (الجذر يملأ إطار قييمد لا المتصفح)
 */
import { readFileSync, writeFileSync } from 'node:fs'

const PATH = 'src/games/online/bankel7az/styles.css'
const ROOT = '.bank-el7az-root'

function transformSelector(raw) {
  const comments = []
  const sel = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => {
    comments.push(m)
    return ''
  }).trim()
  const parts = [...new Set(sel.split(',').map((s) => {
    const t = s.trim()
    if (t === ':root' || t === 'html' || t === 'body' || t === '#root') return ROOT
    if (t === '*') return `${ROOT} *`
    return `${ROOT} ${t}`
  }))]
  return (comments.length ? comments.join('\n') + '\n' : '') + parts.join(',\n')
}

function scopeCss(input) {
  let out = ''
  let pos = 0
  while (pos < input.length) {
    const open = input.indexOf('{', pos)
    if (open === -1) {
      out += input.slice(pos)
      break
    }
    const selector = input.slice(pos, open).trim()
    let depth = 1
    let j = open + 1
    while (j < input.length && depth > 0) {
      if (input[j] === '{') depth++
      else if (input[j] === '}') depth--
      j++
    }
    const body = input.slice(open + 1, j - 1)
    if (selector.startsWith('@keyframes')) {
      out += selector + ' {' + body + '}\n\n'
    } else if (selector.startsWith('@media') || selector.startsWith('@supports')) {
      out += selector + ' {' + scopeCss(body).replace(/\n+$/, '') + '}\n\n'
    } else if (selector) {
      out += transformSelector(selector) + ' {' + body + '}\n\n'
    } else {
      out += '{' + body + '}\n\n'
    }
    pos = j
  }
  return out
}

let css = readFileSync(PATH, 'utf8')
css = scopeCss(css)

// خصائص إضافية على قاعدة :root المحوّلة (أول قاعدة في الملف)
const anchor = `${ROOT} {`
const at = css.indexOf(anchor)
if (at === -1) throw new Error('root rule not found after scoping')
const injected =
  `${anchor}\n  position: absolute;\n  inset: 0;\n  overflow: hidden;\n  direction: rtl;\n` +
  `  transform: translateZ(0);\n  --board-tile-width: calc(100% / 9);\n  --board-tile-height: calc(100% / 9);`
css = css.slice(0, at) + injected + css.slice(at + anchor.length)

// استبدالات عامة آمنة فقط
css = css.replaceAll('100vw', '100%').replaceAll('100dvh', '100%')

writeFileSync(PATH, css)
console.log('scoped OK —', css.split('\n').length, 'lines')
