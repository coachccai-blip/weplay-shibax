// Cartes des jeux dans la conversation : chacun joue à son rythme, la carte suit en direct
// (l'interrogation du groupe rapporte les jeux qui ont changé).
import { useEffect, useRef, useState } from 'preact/hooks'
import { html } from '../../lib/html.js'
import { Icon } from '../../components/icons.js'
import { Avatar } from '../../components/Shiba.js'
import { me, errorToast, toast, openModal } from '../../state/core.js'
import { people } from '../../state/people.js'
import { loadAsync, actAsync, createAsync, asyncFocus, focusAsync } from '../../state/async.js'
import { t, tn, lang, hasKey } from '../../i18n/index.js'
import { gameName } from '../../i18n/texts.js'
import { useNow, finePointer } from '../../lib/layout.js'
import { play, buzz } from '../../lib/fx.js'
import { GAME_CATALOG } from '../../../shared/constants.js'
import { openLightbox } from '../../screens/Lightbox.js'

export const emojiOf = (type) => GAME_CATALOG.find((g) => g.id === type)?.emoji || '🎲'
const nameOf = (uid) => people.value[uid]?.pseudo || t('common.aShiba')
const userOf = (uid) => ({ id: uid, ...(people.value[uid] || {}) })

function leftLabel(ms) {
  const min = Math.max(1, Math.round(ms / 60000))
  if (min >= 48 * 60) return tn('ag.leftDays', Math.round(min / 1440))
  if (min >= 90) return tn('ag.leftHours', Math.round(min / 60))
  return tn('ag.leftMinutes', min)
}

function useAct(g) {
  const [busy, setBusy] = useState(false)
  const run = async (body, onDone) => {
    if (busy || !g) return
    setBusy(true)
    try {
      const res = await actAsync(g.id, body)
      onDone?.(res)
    } catch (err) {
      if (err.code === 'game_over') toast(t('ag.isOver'), 'info')
      else errorToast(err)
    } finally {
      setBusy(false)
    }
  }
  return [busy, run]
}

/** Nouvelle partie du même jeu, lancée directement depuis la carte, puis carte mise en avant. */
async function startAnother(rid, type, options) {
  try {
    const g = await createAsync(rid, type, options)
    focusAsync(g.id)
    play('turn')
  } catch (err) {
    errorToast(err)
  }
}

/** « À toi de jouer » : ce que le joueur peut faire maintenant sur cette carte. */
export function asyncNeedsMe(g, myId) {
  if (!g || g.missing || g.status !== 'open') return false
  const d = g.data || {}
  if (g.type === 'morpion' || g.type === 'puissance4' || g.type === 'shifumi') return !!d.myTurn || (g.open && g.players[0] !== myId)
  if (g.type === 'dessin') return g.createdBy !== myId && !d.found
  if (g.type === 'tupreferes') return d.myVote === null || d.myVote === undefined
  if (g.type === 'pendu') return d.setter !== myId
  return true
}

const BODIES = { morpion: Morpion, puissance4: Puissance4, shifumi: Shifumi, dessin: Dessin, tupreferes: TuPreferes, pendu: Pendu, devine: Devine }

export function AsyncCard({ m, r }) {
  const g = r.asyncGames?.[m.agid]
  const myId = me.value.id
  const now = useNow(30000)
  const ref = useRef(null)
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (!g) loadAsync(m.agid)
  }, [m.agid, !g])
  // Mise en avant depuis le hub ou après une revanche : on fait défiler jusqu'à la carte.
  const focus = asyncFocus.value
  useEffect(() => {
    if (focus?.id !== m.agid) return
    const timer = setTimeout(() => {
      ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      setFlash(true)
      setTimeout(() => setFlash(false), 1600)
      focusAsync(null)
    }, 350)
    return () => clearTimeout(timer)
  }, [focus?.at, !!g])
  const type = g?.type || m.gtype
  const [busy, run] = useAct(g && !g.missing ? g : null)
  const Body = BODIES[type]
  let pill = { text: '…', cls: 'white' }
  if (g?.missing) pill = { text: t('ag.status.gone'), cls: 'coral' }
  else if (g?.status === 'open') pill = asyncNeedsMe(g, myId) ? { text: t('ag.status.yourTurn'), cls: 'apricot' } : { text: t('ag.status.open'), cls: 'mint' }
  else if (g?.status === 'finished') pill = { text: t('ag.status.finished'), cls: 'butter' }
  else if (g?.status === 'expired') pill = { text: t('ag.status.expired'), cls: 'coral' }
  const series = g?.data?.series
  return html`<article ref=${ref} id=${`ag-${m.agid}`} class=${`game-card ag-card ag-${type} ${flash ? 'flash' : ''}`} aria-label=${t('ag.cardAria', { game: gameName(type) })}>
    <div class="game-card-head">
      <span class="art ag-emoji" aria-hidden="true">${emojiOf(type)}</span>
      <div class="grow">
        <h3>${gameName(type)}${series?.games ? html` <span class="pill lavender tiny">${t('ag.rematchN', { n: series.games + 1 })}</span>` : ''}</h3>
        <p class="small">${t('ag.by', { pseudo: m.a?.p || nameOf(m.author) })}</p>
      </div>
      <span class=${`pill ${pill.cls}`}>${pill.text}</span>
    </div>
    ${g?.missing && html`<p class="small muted">${t('ag.gone')}</p>`}
    ${!g && html`<div class="ag-loading" aria-hidden="true"></div>`}
    ${g && !g.missing && Body && html`<${Body} g=${g} run=${run} busy=${busy} myId=${myId} rid=${r.rid} />`}
    ${g && !g.missing && g.status === 'open' && g.expiresAt > now && html`<p class="tiny muted ag-foot"><${Icon} name="hourglass" size=${12} /> ${leftLabel(g.expiresAt - now)}</p>`}
  </article>`
}

// ---------- Duels (morpion, quatre en ligne, shifumi) ----------

function DuelHead({ g, marks = [], active = -1, score }) {
  const side = (uid, i) =>
    uid
      ? html`<span class=${`duel-side ${active === i ? 'active' : ''}`}>
          <${Avatar} user=${userOf(uid)} size=${30} />
          <span class="ellipsis">${nameOf(uid)}</span>
          ${marks[i] && html`<span class="duel-mark" aria-hidden="true">${marks[i]}</span>`}
          ${score && html`<b class="duel-score">${score[uid] || 0}</b>`}
        </span>`
      : html`<span class="duel-side empty"><span class="duel-unknown" aria-hidden="true">?</span><span class="small">${t('ag.duel.open')}</span></span>`
  return html`<div class="duel-head">${side(g.players[0], 0)}<span class="duel-vs">${t('ag.duel.vs')}</span>${side(g.players[1], 1)}</div>`
}

function DuelStatus({ g, myId, run, busy, turnUid }) {
  if (g.status === 'finished') {
    const res = g.result || {}
    if (res.outcome === 'win') return html`<p class="ag-status win">🏆 ${res.winners?.[0] === myId ? t('ag.youWin') : t('ag.wins', { pseudo: nameOf(res.winners?.[0]) })}</p>`
    return html`<p class="ag-status">🤝 ${t('ag.draw')}</p>`
  }
  if (g.status === 'expired') return html`<p class="ag-status muted">${t('ag.expired')}</p>`
  if (g.open) {
    if (g.players[0] === myId) return html`<p class="ag-status muted">${t('ag.duel.waiting')}</p>`
    return html`<button class="btn btn-primary btn-small" disabled=${busy} onClick=${() => run({ type: 'join' }, () => play('turn'))}>${t('ag.duel.accept')}</button>`
  }
  if (g.data.myTurn) return html`<p class="ag-status turn">${t('ag.yourTurn')}</p>`
  if (!g.me.isPlayer) return html`<p class="ag-status muted">${t('ag.duel.watching')}</p>`
  return html`<p class="ag-status muted">${t('ag.waitingFor', { pseudo: nameOf(turnUid) })}</p>`
}

/** Série entre les deux joueurs (affichée pendant une revanche et à la fin) et « Revanche » (l'autre commence). */
function DuelEnd({ g, myId, rid }) {
  const [busy, setBusy] = useState(false)
  if (g.players.length < 2) return null
  const d = g.data
  const finished = g.status !== 'open'
  const wins = { ...(d.series?.wins || {}) }
  let draws = d.series?.draws || 0
  const res = g.result
  if (finished && res?.outcome === 'win' && res.winners?.[0]) wins[res.winners[0]] = (wins[res.winners[0]] || 0) + 1
  else if (finished && res?.outcome === 'draw') draws += 1
  const games = (d.series?.games || 0) + (finished ? 1 : 0)
  const showSeries = games > 1 || (!finished && d.series?.games > 0)
  // Ordre fixe d'une revanche à l'autre (le premier joueur change à chaque partie).
  const [a, b] = [...g.players].sort()
  const mine = g.players.includes(myId)
  const rematch = async () => {
    setBusy(true)
    await startAnother(rid, g.type, { from: g.id })
    setBusy(false)
  }
  if (!showSeries && !finished) return null
  return html`<div class="duel-end">
    ${showSeries &&
    html`<p class="series-line" aria-label=${t('ag.seriesAria', { a: nameOf(a), b: nameOf(b), wa: wins[a] || 0, wb: wins[b] || 0 })}>
      <span>${t('ag.series')}</span> <b>${nameOf(a)} ${wins[a] || 0} – ${wins[b] || 0} ${nameOf(b)}</b>${draws ? html` <span class="muted">· ${tn('ag.draws', draws)}</span>` : ''}
    </p>`}
    ${finished &&
    (d.rematch
      ? html`<button class="btn btn-secondary btn-small" onClick=${() => focusAsync(d.rematch)}><${Icon} name="chevron" /> ${t('ag.rematchStarted')}</button>`
      : mine && html`<button class="btn btn-primary btn-small" disabled=${busy} onClick=${rematch}><${Icon} name="refresh" /> ${t('ag.rematch')}</button>`)}
  </div>`
}

function Morpion({ g, run, busy, myId, rid }) {
  const d = g.data
  const can = d.myTurn && !busy
  const sign = (c) => (c === 'X' ? '✕' : c === 'O' ? '◯' : '')
  return html`<div class="col ag-body">
    <${DuelHead} g=${g} marks=${['✕', '◯']} active=${g.status === 'open' && !g.open ? d.turn : -1} />
    <div class="ttt" role="group" aria-label=${t('ag.morpion.board')}>
      ${d.board.map(
        (c, i) => html`<button key=${i} class=${`ttt-cell ${c ? `mark-${c}` : ''} ${d.line?.includes(i) ? 'win' : ''} ${d.last === i && !d.line ? 'last' : ''}`} disabled=${!can || !!c}
          aria-label=${c ? t('ag.cellTaken', { n: i + 1, mark: sign(c) }) : t('ag.cell', { n: i + 1 })} onClick=${() => run({ type: 'move', cell: i }, () => play('pop'))}>${sign(c)}</button>`,
      )}
    </div>
    <${DuelStatus} g=${g} myId=${myId} run=${run} busy=${busy} turnUid=${g.players[d.turn]} />
    <${DuelEnd} g=${g} myId=${myId} rid=${rid} />
  </div>`
}

function Puissance4({ g, run, busy, myId, rid }) {
  const d = g.data
  const can = d.myTurn && !busy
  const [hover, setHover] = useState(-1)
  const fine = finePointer.value
  const myPiece = d.myPiece
  const topEmpty = (x) => {
    for (let y = 5; y >= 0; y--) if (!d.board[y * 7 + x]) return y
    return -1
  }
  return html`<div class="col ag-body">
    <${DuelHead} g=${g} marks=${['🔴', '🟡']} active=${g.status === 'open' && !g.open ? d.turn : -1} />
    <div class="c4" role="group" aria-label=${t('ag.p4.board')} onMouseLeave=${() => setHover(-1)}>
      ${[0, 1, 2, 3, 4, 5, 6].map((x) => {
        const full = !!d.board[x]
        const ghostRow = can && fine && hover === x ? topEmpty(x) : -1
        return html`<button key=${x} class="c4-col" disabled=${!can || full} aria-label=${t('ag.p4.col', { n: x + 1 })} onMouseEnter=${() => setHover(x)}
          onClick=${() => run({ type: 'move', col: x }, () => play('pop'))}>
          ${[0, 1, 2, 3, 4, 5].map((y) => {
            const i = y * 7 + x
            const c = d.board[i]
            return html`<span key=${y} class=${`c4-cell ${c ? `p-${c}` : ''} ${d.line?.includes(i) ? 'win' : ''} ${d.last === i ? 'last' : ''} ${ghostRow === y ? `ghost p-${myPiece}` : ''}`}
              style=${d.last === i ? { '--drop': y + 1 } : undefined}></span>`
          })}
        </button>`
      })}
    </div>
    <${DuelStatus} g=${g} myId=${myId} run=${run} busy=${busy} turnUid=${g.players[d.turn]} />
    <${DuelEnd} g=${g} myId=${myId} rid=${rid} />
  </div>`
}

const SHI = { pierre: '✊', feuille: '✋', ciseaux: '✌️', hidden: '❔' }

function Shifumi({ g, run, busy, myId, rid }) {
  const d = g.data
  const [a, b] = g.players
  const done = d.rounds.filter((x) => x.winner !== undefined)
  const current = d.rounds[d.rounds.length - 1]
  const myPick = current && current.winner === undefined ? current.picks?.[myId] : null
  const other = g.players.find((u) => u !== myId)
  // « Shi… fu… mi ! » : courte animation quand une manche vient d'être jouée par les deux.
  const seen = useRef(done.length)
  const [anim, setAnim] = useState(false)
  useEffect(() => {
    if (done.length > seen.current) {
      seen.current = done.length
      setAnim(true)
      const timer = setTimeout(() => {
        setAnim(false)
        play('reveal')
      }, 1100)
      return () => clearTimeout(timer)
    }
  }, [done.length])
  const shown = anim ? done.slice(0, -1) : done
  return html`<div class="col ag-body">
    <${DuelHead} g=${g} score=${g.open ? null : d.score} />
    <p class="tiny muted center">${t('ag.shifumi.rule', { n: d.target || 2 })}</p>
    ${anim && html`<div class="shi-anim" aria-live="polite"><span>✊</span><b>${t('ag.shifumi.chant')}</b><span>✊</span></div>`}
    ${shown.length > 0 &&
    html`<ol class="shi-rounds">
      ${shown.map(
        (x, i) => html`<li key=${i} class=${i === shown.length - 1 && !anim ? 'fresh' : ''}><span class="shi-n">${i + 1}</span><span aria-hidden="true">${SHI[x.picks[a]]}</span><span class="tiny">${t('ag.duel.vs')}</span><span aria-hidden="true">${SHI[x.picks[b]]}</span>
          <span class="grow small">${x.winner ? t('ag.shifumi.point', { pseudo: nameOf(x.winner) }) : t('ag.shifumi.tie')}</span></li>`,
      )}
    </ol>`}
    ${g.status === 'open' && d.myTurn &&
    html`<div class="shi-picks" role="group" aria-label=${t('ag.shifumi.pick')}>
      ${['pierre', 'feuille', 'ciseaux'].map(
        (c) => html`<button key=${c} class="shi-pick" disabled=${busy} onClick=${() => run({ type: 'pick', choice: c }, () => play('pop'))}>
          <span aria-hidden="true">${SHI[c]}</span><span class="small">${t(`ag.shifumi.${c}`)}</span></button>`,
      )}
    </div>`}
    ${g.status === 'open' && myPick && html`<p class="ag-status muted">${t('ag.shifumi.played', { pick: SHI[myPick] })} · ${t('ag.waitingFor', { pseudo: nameOf(other) })}</p>`}
    ${!(g.status === 'open' && (d.myTurn || myPick)) && !anim && html`<${DuelStatus} g=${g} myId=${myId} run=${run} busy=${busy} turnUid=${g.players.find((u) => !current?.picks?.[u])} />`}
    ${!anim && html`<${DuelEnd} g=${g} myId=${myId} rid=${rid} />`}
  </div>`
}

// ---------- Devine mon dessin ----------

function HintCells({ cells }) {
  return html`<div class="hint" aria-label=${tn('common.letters', cells.filter((c) => (c.t || c) === 'l').length)}>
    ${cells.map((cell, i) => {
      const c = typeof cell === 'string' ? { t: cell } : cell
      if (c.t === 'l') return html`<span key=${i} class=${`cell ${c.c ? 'revealed' : ''}`}>${c.c || ''}</span>`
      if (c.t === 's') return html`<span key=${i} class="gap"></span>`
      return html`<span key=${i} class="mark">${c.t === 'd' ? '-' : '’'}</span>`
    })}
  </div>`
}

function Dessin({ g, run, busy, myId, rid }) {
  const d = g.data
  const mine = g.createdBy === myId
  const open = g.status === 'open'
  const [text, setText] = useState('')
  const [fb, setFb] = useState(null)
  const submit = (e) => {
    e.preventDefault()
    const value = text.trim()
    if (!value) return
    setText('')
    run({ type: 'guess', text: value }, (res) => {
      const verdict = res.outcome?.result
      if (verdict === 'correct') {
        play('found')
        buzz(60)
        setFb(null)
      } else if (verdict === 'close' || verdict === 'masked') {
        play('close')
        setFb('close')
      } else setFb('wrong')
    })
  }
  const nextIn = d.nextHintAt ? d.nextHintAt - d.tries : null
  return html`<div class="col ag-body">
    <button class="ag-img" onClick=${() => openLightbox([{ src: d.image, word: d.word || '?' }])} aria-label=${t('ag.dessin.zoom')}>
      <img src=${d.image} alt=${t('ag.dessin.alt')} loading="lazy" onError=${(e) => (e.currentTarget.style.visibility = 'hidden')} />
    </button>
    ${d.word ? html`<p class="ag-word">${d.word}</p>` : html`<${HintCells} cells=${d.hint || []} />`}
    ${open && !mine && !d.found &&
    html`<form class="guess-form" onSubmit=${submit}>
      <label class="sr-only" for=${`g-${g.id}`}>${t('ag.dessin.guess')}</label>
      <input id=${`g-${g.id}`} class="input" placeholder=${t('ag.dessin.guess')} maxlength="60" value=${text} autocomplete="off" autocorrect="off" spellcheck="false"
        enterkeyhint="send" onInput=${(e) => setText(e.currentTarget.value)} />
      <button class="btn btn-primary" disabled=${busy || !text.trim()} aria-label=${t('ag.dessin.send')}><${Icon} name="send" /></button>
    </form>
    <p class="tiny muted" aria-live="polite">${fb === 'close' ? html`<span class="pill butter">🔥 ${t('ag.close')}</span>` : fb === 'wrong' ? t('ag.dessin.wrong') : ''} ${tn('ag.dessin.tries', d.tries, { max: 20 })}${nextIn ? ` · 💡 ${tn('ag.dessin.nextHint', nextIn)}` : ''}</p>`}
    ${d.found && html`<p class="ag-status win">🎉 ${t('ag.dessin.found')}</p>`}
    ${mine && open && html`<p class="small muted">${t('ag.dessin.mine')}</p>`}
    ${d.finders.length > 0 &&
    html`<div class="col" style=${{ gap: '4px' }}>
      <span class="small">${tn('ag.dessin.finders', d.finders.length)}</span>
      <ul class="finders">
        ${d.finders.slice(0, 12).map((f, i) => html`<li key=${f.uid}>${i === 0 ? '🥇' : ''}<${Avatar} user=${userOf(f.uid)} size=${22} /> <span class="ellipsis">${nameOf(f.uid)}</span> <span class="tiny muted">${tn('ag.dessin.inTries', f.tries || 1)}</span></li>`)}
      </ul>
    </div>`}
    ${!open && d.finders.length === 0 && html`<p class="small muted">${t('ag.dessin.nobody')}</p>`}
    ${mine && open && html`<button class="btn btn-ghost btn-small" disabled=${busy} onClick=${() => run({ type: 'close' })}>${t('ag.closeGame')}</button>`}
    ${!open && html`<button class="btn btn-secondary btn-small" onClick=${() => openModal('asyncSetup', { type: 'dessin', rid })}><${Icon} name="brush" /> ${t('ag.dessin.myTurn')}</button>`}
  </div>`
}

// ---------- Tu préfères ? ----------

function TuPreferes({ g, run, busy, myId, rid }) {
  const d = g.data
  const opts = d.custom || d[lang.value] || d.fr || ['', '']
  const open = g.status === 'open'
  const show = !!d.counts
  const total = d.total || 0
  const voted = d.myVote !== null && d.myVote !== undefined
  return html`<div class="col ag-body">
    <p class="wyr-q">${t('ag.tupreferes.q')} ${d.anonymous && html`<span class="pill white tiny">🙈 ${t('ag.tupreferes.anonymous')}</span>`}</p>
    ${[0, 1].map((i) => {
      const pct = show && total ? Math.round((d.counts[i] * 100) / total) : 0
      return html`<div class="col" style=${{ gap: '4px' }} key=${i}>
        <button class=${`wyr-opt ${d.myVote === i ? 'mine' : ''}`} disabled=${!open || busy} aria-pressed=${String(d.myVote === i)}
          onClick=${() => d.myVote !== i && run({ type: 'vote', choice: i }, () => play('pop'))}>
          ${show && html`<span class="wyr-bar" style=${{ width: `${pct}%` }} aria-hidden="true"></span>`}
          <span class="wyr-text">${opts[i]}</span>
          ${show && html`<b class="wyr-pct">${t('common.percent', { n: pct })}</b>`}
        </button>
        ${show && d.voters?.[i]?.length > 0 && html`<span class="avatar-row">${d.voters[i].slice(0, 10).map((u) => html`<${Avatar} key=${u} user=${userOf(u)} size=${22} />`)}</span>`}
      </div>`
    })}
    <p class="tiny muted">${tn('ag.tupreferes.votes', total)}${open && voted ? ` · ${t('ag.tupreferes.change')}` : ''}</p>
    <div class="row wrap">
      ${open && g.createdBy === myId && html`<button class="btn btn-ghost btn-small" disabled=${busy} onClick=${() => run({ type: 'close' })}>${t('ag.tupreferes.close')}</button>`}
      ${(voted || !open) && html`<button class="btn btn-secondary btn-small" onClick=${() => startAnother(rid, 'tupreferes', { anonymous: !!d.anonymous })}><${Icon} name="dice" /> ${t('ag.tupreferes.another')}</button>`}
    </div>
  </div>`
}

// ---------- Le pendu ----------

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function Pendu({ g, run, busy, myId, rid }) {
  const d = g.data
  const open = g.status === 'open'
  const setter = d.setter === myId
  const [text, setText] = useState('')
  const lives = d.max - d.wrong
  const submit = (e) => {
    e.preventDefault()
    const value = text.trim()
    if (!value) return
    setText('')
    run({ type: 'word', text: value }, (res) => (res.outcome?.result === 'correct' ? play('found') : play('close')))
  }
  const detectives = Object.entries(d.hits || {})
    .sort((x, y) => y[1] - x[1])
    .slice(0, 4)
  return html`<div class="col ag-body">
    ${(d.theme || d.hint) &&
    html`<p class="center small">${d.theme && hasKey(`theme.${d.theme}`) ? html`<span class="pill white">${t('ag.pendu.theme', { theme: t(`theme.${d.theme}`) })}</span>` : ''}
      ${d.hint ? html`<span class="pill butter">💡 ${d.hint}</span>` : ''}</p>`}
    <div class="lives" aria-label=${tn('ag.pendu.lives', lives)}>
      ${Array.from({ length: d.max }, (_, i) => html`<span key=${i} class=${`life ${i < lives ? '' : 'lost'}`} aria-hidden="true">${i < lives ? '🦴' : '✖'}</span>`)}
    </div>
    <div class="hint big" aria-label=${t('ag.pendu.wordAria')}>
      ${d.cells.map((c, i) =>
        c.t === 'l' ? html`<span key=${i} class=${`cell ${c.c ? 'revealed' : ''}`}>${c.c || ''}</span>` : c.t === 's' ? html`<span key=${i} class="gap"></span>` : html`<span key=${i} class="mark">${c.t === 'd' ? '-' : '’'}</span>`,
      )}
    </div>
    ${open && !setter &&
    html`<div class="kbd" role="group" aria-label=${t('ag.pendu.letters')}>
        ${ALPHABET.map(
          (l) => html`<button key=${l} class=${`kbd-key ${d.tried.includes(l) ? 'tried' : ''}`} disabled=${busy || d.tried.includes(l)}
            onClick=${() => run({ type: 'letter', letter: l }, (res) => play(res.outcome?.result === 'hit' ? 'pop' : 'close'))}>${l}</button>`,
        )}
      </div>
      <form class="guess-form" onSubmit=${submit}>
        <label class="sr-only" for=${`w-${g.id}`}>${t('ag.pendu.word')}</label>
        <input id=${`w-${g.id}`} class="input" placeholder=${t('ag.pendu.word')} maxlength="40" value=${text} autocomplete="off" spellcheck="false" onInput=${(e) => setText(e.currentTarget.value)} />
        <button class="btn btn-secondary" disabled=${busy || !text.trim()}>${t('ag.pendu.try')}</button>
      </form>`}
    ${open && setter && html`<p class="small muted">${t('ag.pendu.setter')}</p>`}
    ${detectives.length > 0 &&
    html`<p class="tiny muted">🔎 ${t('ag.pendu.detectives')} ${detectives.map(([u, n]) => `${nameOf(u)} (${tn('ag.pendu.lettersFound', n)})`).join(' · ')}</p>`}
    ${!open && d.word && html`<p class="ag-word">${d.word}</p>`}
    ${g.status === 'finished' &&
    html`<p class=${`ag-status ${g.result?.outcome === 'lost' ? '' : 'win'}`}>${g.result?.outcome === 'lost' ? `😿 ${t('ag.pendu.lost')}` : `🎉 ${d.solvedBy ? t('ag.pendu.solvedBy', { pseudo: nameOf(d.solvedBy) }) : t('ag.pendu.won')}`}</p>`}
    ${g.status === 'expired' && html`<p class="ag-status muted">${t('ag.expired')}</p>`}
    ${!open && html`<button class="btn btn-secondary btn-small" onClick=${() => openModal('asyncSetup', { type: 'pendu', rid })}><${Icon} name="refresh" /> ${t('ag.playAgain')}</button>`}
  </div>`
}

// ---------- Le nombre mystère ----------

const HEAT = { brulant: '🔥', chaud: '♨️', tiede: '🌤️', froid: '❄️' }

function Devine({ g, run, busy, myId, rid }) {
  const d = g.data
  const open = g.status === 'open'
  const [n, setN] = useState('')
  const [last, setLast] = useState(null)
  const submit = (e) => {
    e.preventDefault()
    const value = parseInt(n, 10)
    if (!value) return
    setN('')
    run({ type: 'guess', n: value }, (res) => {
      setLast(res.outcome || null)
      if (res.outcome?.result === 'bingo') {
        play('win')
        buzz(80)
      } else play('pop')
    })
  }
  const hintText = (h) => (h === 'plus' ? `⬆️ ${t('ag.devine.more')}` : h === 'moins' ? `⬇️ ${t('ag.devine.less')}` : `🎯 ${t('ag.devine.bingo')}`)
  const pos = (x) => `${((x - 1) / Math.max(1, d.max - 1)) * 100}%`
  const myTries = d.counts?.[myId] || 0
  return html`<div class="col ag-body">
    <p>${t('ag.devine.prompt', { max: d.max })}</p>
    ${open &&
    html`<div class="range-bar" role="img" aria-label=${t('ag.devine.rangeAria', { lo: d.lo, hi: d.hi })}>
        <span class="rb-zone" style=${{ left: pos(d.lo), width: `calc(${pos(d.hi)} - ${pos(d.lo)})` }}></span>
        ${d.guesses.slice(-8).map((x, i) => html`<span key=${`${x.at}-${i}`} class=${`rb-mark ${x.hint}`} style=${{ left: pos(x.n) }} title=${String(x.n)}></span>`)}
      </div>
      <p class="ag-range"><b>${d.lo}</b><span class="muted"> … </span><b>${d.hi}</b></p>
      ${last?.heat && html`<p class="center"><span class=${`pill heat-${last.heat}`}>${HEAT[last.heat]} ${t(`ag.devine.heat.${last.heat}`)}</span></p>`}
      <form class="guess-form" onSubmit=${submit}>
        <label class="sr-only" for=${`n-${g.id}`}>${t('ag.devine.label')}</label>
        <input id=${`n-${g.id}`} class="input" type="number" inputmode="numeric" min=${d.lo} max=${d.hi} placeholder=${`${d.lo} – ${d.hi}`} value=${n} onInput=${(e) => setN(e.currentTarget.value)} />
        <button class="btn btn-primary" disabled=${busy || !n}>${t('ag.devine.try')}</button>
      </form>`}
    ${!open && d.secret !== null && html`<p class="ag-word">${d.secret}</p>`}
    ${d.guesses.length > 0 &&
    html`<ul class="ag-log">
      ${d.guesses
        .slice(-5)
        .reverse()
        .map((x, i) => html`<li key=${`${x.at}-${i}`}><b>${nameOf(x.uid)}</b> · ${x.n} · <span class="small">${hintText(x.hint)}${x.heat ? ` ${HEAT[x.heat]}` : ''}</span></li>`)}
    </ul>`}
    <p class="tiny muted">${tn('ag.devine.count', d.count)}${myTries ? ` · ${tn('ag.devine.mine', myTries)}` : ''}</p>
    ${d.finder && html`<p class="ag-status win">🎯 ${t('ag.devine.found', { pseudo: nameOf(d.finder), n: d.secret })}</p>`}
    ${g.status === 'expired' && html`<p class="ag-status muted">${t('ag.expired')}</p>`}
    ${!open && html`<button class="btn btn-secondary btn-small" onClick=${() => startAnother(rid, 'devine', { max: d.max })}><${Icon} name="refresh" /> ${t('ag.playAgain')}</button>`}
  </div>`
}
