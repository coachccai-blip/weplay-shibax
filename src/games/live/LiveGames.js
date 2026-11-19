// Jeux en direct « par manches » : question → réponses → révélation, scores en continu.
// Quiz, Réflexe, Le juste nombre, Petit Bac, Calcul express, Mots mélangés. Le chrono suit le serveur.
import { useEffect, useRef, useState } from 'preact/hooks'
import { html } from '../../lib/html.js'
import { Icon } from '../../components/icons.js'
import { Shiba, Avatar } from '../../components/Shiba.js'
import { game, act, joinGame } from '../../state/game.js'
import { me, errorToast } from '../../state/core.js'
import { serverNow } from '../../lib/clock.js'
import { useNow, finePointer } from '../../lib/layout.js'
import { play, buzz } from '../../lib/fx.js'
import { t, tn, hasKey } from '../../i18n/index.js'
import { ordinal } from '../../i18n/texts.js'
import { formatNumber } from '../../lib/format.js'
import { compactWord } from '../../../shared/text.js'
import { LIMITS } from '../../../shared/constants.js'

const playerOf = (v, uid) => v.players.find((p) => p.id === uid) || { id: uid, pseudo: t('common.aShiba') }
const answer = (gs, value) => act({ type: 'answer', round: gs.round, value })
const quiet = (err) => {
  if (!['already_answered', 'round_over', 'already_found'].includes(err?.code)) errorToast(err)
}
const RACE = new Set(['calcul', 'anagramme'])
const secs1 = (ms) => (Math.max(0, ms || 0) / 1000).toFixed(1)

export function LiveGame() {
  const g = game.value
  const v = g.view
  const gs = v.g
  const myId = me.value.id
  const myPlayer = v.players.find((p) => p.id === myId && !p.left)
  const late = !!myPlayer && myPlayer.fromRound > gs.round
  const canPlay = !!myPlayer && !late
  const now = useNow(200)
  const remaining = Math.max(0, gs.phaseEnd - now)
  const secs = Math.ceil(remaining / 1000)
  const alert = gs.phase === 'question' && remaining <= 5000
  const showTimer = gs.phase === 'question' && v.type !== 'reflexe'
  const span = Math.max(1, gs.phaseEnd - gs.phaseStart)

  const lastTick = useRef(0)
  useEffect(() => {
    if (showTimer && secs <= 3 && secs > 0 && secs !== lastTick.current) {
      lastTick.current = secs
      play('tick')
    }
  }, [secs, showTimer])
  useEffect(() => {
    if (gs.phase === 'reveal') play('reveal')
  }, [gs.phase, gs.round])

  const UI = LIVE_UI[v.type]
  if (!UI) return html`<p class="center">${t('game.unknown')}</p>`
  const lastRound = gs.round + 1 >= gs.total
  return html`<div class=${`live live-${v.type}`}>
    <div class="live-top">
      <span class="di-round">${t('live.round', { n: Math.min(gs.round + 1, gs.total), total: gs.total })}</span>
      ${gs.phase === 'question' && html`<${AnsweredLine} v=${v} gs=${gs} />`}
      ${showTimer &&
      html`<span class=${`timer ${alert ? 'alert' : ''}`} role="timer" aria-live="off" aria-label=${tn('live.secondsLeft', secs)}>
        <${Icon} name=${alert ? 'alert' : 'clock'} size=${20} /> ${secs} s</span>`}
      ${gs.phase === 'reveal' && html`<span class="pill butter">${lastRound ? t('live.finalIn', { s: secs }) : t('live.nextIn', { s: secs })}</span>`}
    </div>
    ${(showTimer || gs.phase === 'reveal') &&
    html`<div class=${`phase-bar ${gs.phase} ${alert ? 'alert' : ''}`} aria-hidden="true"><span style=${{ width: `${Math.min(100, (remaining / span) * 100)}%` }}></span></div>`}
    ${gs.stoppedBy && gs.phase === 'question' &&
    html`<div class="game-banner stop-banner" role="alert">🛑 ${gs.stoppedBy === myId ? t('petitbac.youStopped') : t('petitbac.stopped', { pseudo: playerOf(v, gs.stoppedBy).pseudo })}</div>`}
    <div class="live-stage">
      ${gs.phase === 'question'
        ? html`<${UI.Q} key=${`q${gs.round}`} v=${v} gs=${gs} now=${now} canPlay=${canPlay} />`
        : html`<${UI.R} key=${`r${gs.round}`} v=${v} gs=${gs} now=${now} canPlay=${canPlay} />`}
      ${late && html`<p class="guess-feedback"><span class="pill sky">${t('game.lateNext')}</span></p>`}
      ${!myPlayer && html`<${Spectator} v=${v} />`}
    </div>
    <aside class="live-side" aria-label=${t('live.scores')}><${LiveScores} v=${v} gs=${gs} /></aside>
  </div>`
}

/** « 2/4 ont répondu » (ou « 2 ont trouvé » dans les courses), en direct pendant la question. */
function AnsweredLine({ v, gs }) {
  const ids = game.value.answeredIds || []
  const playing = v.players.filter((p) => !p.left && (p.fromRound || 0) <= gs.round).length
  if (RACE.has(v.type)) return ids.length ? html`<span class="pill mint answered-line">✓ ${tn('live.foundCount', ids.length)}</span>` : null
  return html`<span class="pill white answered-line">${t('live.answeredCount', { n: ids.length, total: playing })}</span>`
}

function Spectator({ v }) {
  const full = v.players.filter((p) => !p.left).length >= v.maxPlayers
  return html`<div class="game-banner">
    <span class="grow">${t('game.spectator')}</span>
    <button class="btn btn-small btn-primary" disabled=${full} onClick=${() => joinGame().catch(() => {})}>${full ? t('game.full') : t('common.join')}</button>
  </div>`
}

function LiveScores({ v, gs }) {
  const myId = me.value.id
  const presence = game.value.presence || {}
  const answered = new Set(gs.phase === 'question' ? game.value.answeredIds || [] : [])
  const race = RACE.has(v.type)
  const now = serverNow()
  const last = gs.phase === 'reveal' ? gs.reveal?.points || {} : {}
  const players = v.players.filter((p) => !p.left).sort((a, b) => b.score - a.score)
  return html`<ol class="scoreboard">
    ${players.map((p, i) => {
      const absent = p.id !== myId && presence[p.id] && now - presence[p.id] > LIMITS.absentMs
      const done = answered.has(p.id)
      return html`<li key=${p.id} class=${`${p.id === myId ? 'me' : ''} ${absent ? 'absent' : ''} ${last[p.id] > 0 || (race && done) ? 'found' : ''}`}>
        <span class="rank-n">${i + 1}</span>
        <${Avatar} user=${p} size=${30} mood=${last[p.id] > 0 ? 'fete' : 'content'} />
        <span class="col" style=${{ gap: 0, minWidth: 0 }}>
          <span class="score-name">${p.pseudo}${p.id === myId ? ` ${t('common.youParen')}` : ''}</span>
          ${done && html`<span class="score-tag answered-tag">✓ ${race ? t('drawit.found') : t('live.answered')}</span>`}
          ${absent && html`<span class="score-tag">${t('live.absent')}</span>`}
        </span>
        <span class="score-pts">${last[p.id] > 0 && html`<span class="pts plus">+${last[p.id]}</span> `}${p.score}</span>
      </li>`
    })}
  </ol>`
}

/** Points de la manche, du meilleur au moins bon, avec le détail propre au jeu. */
function RoundPoints({ v, rv, label }) {
  const rows = Object.entries(rv?.points || {}).sort((a, b) => b[1] - a[1])
  if (!rows.length) return html`<p class="small muted center">${t('live.nobodyAnswered')}</p>`
  return html`<ul class="round-points">
    ${rows.map(([uid, pts]) => {
      const p = playerOf(v, uid)
      const d = rv.detail?.[uid]
      return html`<li key=${uid} class=${uid === me.value.id ? 'me' : ''}>
        <${Avatar} user=${p} size=${28} />
        <span class="ellipsis grow">${p.pseudo}</span>
        ${label && d && html`<span class="small muted">${label(d)}</span>`}
        <span class=${`pts ${pts > 0 ? 'plus' : ''}`}>+${pts}</span>
      </li>`
    })}
  </ul>`
}

// ---------- Quiz de la meute ----------

function myStreak(v, gs) {
  // Série en cours d'après les manches précédentes (bonnes réponses consécutives).
  const myId = me.value.id
  let n = 0
  for (let i = gs.history.length - 1; i >= 0; i--) {
    if ((gs.history[i].points?.[myId] || 0) > 0) n++
    else break
  }
  return n
}

function QuizQ({ v, gs, canPlay }) {
  const p = gs.prompt
  const [picked, setPicked] = useState(null)
  const streak = myStreak(v, gs)
  const choose = async (i) => {
    if (picked !== null || !canPlay) return
    setPicked(i)
    play('pop')
    try {
      await answer(gs, i)
    } catch (err) {
      if (err.code !== 'already_answered') setPicked(null)
      quiet(err)
    }
  }
  useEffect(() => {
    if (!canPlay) return
    const onKey = (e) => {
      const i = ['1', '2', '3', '4', 'a', 'b', 'c', 'd'].indexOf(e.key.toLowerCase()) % 4
      if (i >= 0 && !e.target.closest?.('input, textarea')) choose(i)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  return html`<div class="live-card">
    <div class="row wrap" style=${{ justifyContent: 'center', gap: '6px' }}>
      ${p.cat && hasKey(`quiz.cat.${p.cat}`) && html`<span class="pill white">${t(`quiz.cat.${p.cat}`)}</span>`}
      ${streak >= 1 && canPlay && html`<span class="pill coral">🔥 ${t('quiz.streak', { n: streak })}</span>`}
    </div>
    <h2 class="live-q">${p.q}</h2>
    <div class="quiz-choices">
      ${p.choices.map(
        (c, i) => html`<button key=${i} class=${`quiz-choice c${i} ${picked === i ? 'picked' : ''}`} disabled=${picked !== null || !canPlay} onClick=${() => choose(i)}>
          <span class="letter" aria-hidden="true">${'ABCD'[i]}</span><span class="grow">${c}</span></button>`,
      )}
    </div>
    <p class="live-hint" aria-live="polite">${picked !== null ? t('live.answerSent') : canPlay ? t('quiz.speed') : ''}</p>
  </div>`
}

function QuizR({ v, gs }) {
  const rv = gs.reveal
  if (!rv) return null
  const correct = rv.secret.correct
  const byChoice = [[], [], [], []]
  for (const [uid, d] of Object.entries(rv.detail || {})) byChoice[d.value]?.push(uid)
  const fastest = Object.entries(rv.detail || {})
    .filter(([, d]) => d.ok)
    .sort((a, b) => a[1].ms - b[1].ms)[0]
  return html`<div class="live-card">
    <h2 class="live-q">${rv.prompt.q}</h2>
    <div class="quiz-choices">
      ${rv.prompt.choices.map(
        (c, i) => html`<div key=${i} class=${`quiz-choice c${i} ${i === correct ? 'correct' : 'dim'}`}>
          <span class="letter" aria-hidden="true">${i === correct ? '✓' : 'ABCD'[i]}</span><span class="grow">${c}</span>
          <span class="avatar-row">${byChoice[i].map((u) => html`<${Avatar} key=${u} user=${playerOf(v, u)} size=${22} />`)}</span>
        </div>`,
      )}
    </div>
    ${fastest && html`<p class="center small">⚡ ${t('quiz.fastest', { pseudo: playerOf(v, fastest[0]).pseudo, s: secs1(fastest[1].ms) })}</p>`}
    <${RoundPoints} v=${v} rv=${rv} label=${(d) => (d.ok ? `✓ ${secs1(d.ms)} s${d.bonus ? ` · 🔥 +${d.bonus}` : ''}` : '✗')} />
  </div>`
}

// ---------- Réflexe ----------

const SPOTS = 5

function ReflexeQ({ gs, canPlay }) {
  const p = gs.prompt
  const [shown, setShown] = useState(() => serverNow() >= p.appearAt)
  const [res, setRes] = useState(null)
  const shownAt = useRef(0)
  const resRef = useRef(null)
  useEffect(() => {
    if (shown) {
      shownAt.current = performance.now() - Math.max(0, serverNow() - p.appearAt)
      return
    }
    const timer = setTimeout(() => {
      setShown(true)
      requestAnimationFrame(() => (shownAt.current = performance.now()))
    }, Math.max(0, p.appearAt - serverNow()))
    return () => clearTimeout(timer)
  }, [])
  const tap = (e) => {
    e?.preventDefault?.()
    if (resRef.current || !canPlay) return
    if (!shown) {
      resRef.current = { early: true }
      setRes(resRef.current)
      buzz(120)
      play('close')
      answer(gs, { early: true }).catch(quiet)
      return
    }
    const ms = Math.round(performance.now() - (shownAt.current || performance.now()))
    resRef.current = p.decoy ? { trap: true } : { ms }
    setRes(resRef.current)
    if (p.decoy) {
      buzz([60, 40, 60])
      play('close')
    } else {
      play('found')
      buzz(40)
    }
    answer(gs, { ms }).catch(quiet)
  }
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault()
        tap()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const status = res?.early
    ? `😅 ${t('reflexe.early')}`
    : res?.trap
      ? `🙀 ${t('reflexe.trapped')}`
      : res
        ? `⚡ ${t('reflexe.ms', { ms: res.ms })}`
        : shown
          ? p.decoy
            ? `🐱 ${t('reflexe.dontTouch')}`
            : t('reflexe.now')
          : t('reflexe.wait')
  return html`<div class="live-card reflex">
    <button class=${`reflex-field ${shown ? (p.decoy ? 'decoy' : 'go') : ''} ${res?.early || res?.trap ? 'early' : ''}`} onPointerDown=${tap} disabled=${!canPlay}
      aria-label=${t('reflexe.tapAria')}>
      ${Array.from({ length: SPOTS }, (_, i) =>
        html`<span key=${i} class="bush">${shown && i === p.spot
          ? p.decoy
            ? html`<span class="pop-shiba pop-cat" aria-hidden="true">🐱</span>`
            : html`<span class="pop-shiba"><${Shiba} coat=${p.coat} mood="surpris" size=${78} /></span>`
          : html`<span aria-hidden="true">🌿</span>`}</span>`,
      )}
    </button>
    <p class="live-hint big" aria-live="assertive">${status}</p>
    <p class="tiny muted center">${t('reflexe.rule')}</p>
  </div>`
}

function ReflexeR({ v, gs }) {
  const rv = gs.reveal
  const decoy = rv?.prompt?.decoy
  return html`<div class="live-card">
    <h2 class="live-q">${decoy ? `🐱 ${t('reflexe.trapRound')}` : t('reflexe.results')}</h2>
    <${RoundPoints} v=${v} rv=${rv} label=${(d) =>
      d.early ? t('reflexe.tooEarly') : d.trap ? `🙀 ${t('reflexe.trappedShort')}` : d.calm ? `😎 ${t('reflexe.calm')}` : t('reflexe.ms', { ms: d.ms })} />
  </div>`
}

// ---------- Le juste nombre ----------

/** Les années (question sans unité, entre 1000 et 2100) s'écrivent sans séparateur de milliers. */
const isYear = (prompt, n) => !prompt?.unit && Number.isInteger(n) && n >= 1000 && n <= 2100
const fmtEst = (prompt, n) => (isYear(prompt, n) ? String(n) : formatNumber(n))

function JusteQ({ gs, canPlay }) {
  const p = gs.prompt
  const [val, setVal] = useState('')
  const [sent, setSent] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    const raw = val.trim()
    if (!raw || sent !== null || !canPlay) return
    setSent(raw)
    try {
      const res = await answer(gs, raw)
      setSent(res.value)
      play('pop')
    } catch (err) {
      if (err.code !== 'already_answered') setSent(null)
      quiet(err)
    }
  }
  return html`<div class="live-card">
    <h2 class="live-q">${p.q}</h2>
    ${sent === null
      ? html`<form class="guess-form big" onSubmit=${submit}>
          <label class="sr-only" for="estimate">${t('justenombre.label')}</label>
          <input id="estimate" class="input" inputmode="decimal" autocomplete="off" placeholder=${t('justenombre.label')} value=${val} disabled=${!canPlay}
            onInput=${(e) => setVal(e.currentTarget.value)} />
          ${p.unit && html`<span class="unit">${p.unit}</span>`}
          <button class="btn btn-primary" disabled=${!canPlay || !val.trim()}>${t('live.validate')}</button>
        </form>`
      : html`<p class="guess-feedback"><span class="pill sky">${t('justenombre.sent', { n: typeof sent === 'number' ? fmtEst(p, sent) : sent, unit: p.unit || '' })}</span></p>`}
    <p class="live-hint">${t('justenombre.hint')}</p>
  </div>`
}

/** Droite graduée : la bonne réponse et l'estimation de chacun. */
function NumberLine({ v, rv }) {
  const target = rv.secret.answer
  const entries = Object.entries(rv.detail || {}).map(([uid, d]) => ({ uid, value: d.value }))
  if (!entries.length) return null
  const values = [target, ...entries.map((e) => e.value)]
  let lo = Math.min(...values)
  let hi = Math.max(...values)
  if (lo === hi) {
    lo -= 1
    hi += 1
  }
  const pad = (hi - lo) * 0.06
  lo -= pad
  hi += pad
  const pos = (x) => `${((x - lo) / (hi - lo)) * 100}%`
  const sorted = entries.sort((a, b) => a.value - b.value)
  const f = (n) => fmtEst(rv.prompt, n)
  return html`<div class="number-line" role="img" aria-label=${t('justenombre.lineAria', { n: f(target) })}>
    <div class="nl-track"></div>
    <div class="nl-target" style=${{ left: pos(target) }}><span class="nl-flag">🎯</span><b>${f(target)}</b></div>
    ${sorted.map(
      (e, i) => html`<div key=${e.uid} class=${`nl-mark ${i % 2 ? 'up' : 'down'}`} style=${{ left: pos(e.value) }} title=${`${playerOf(v, e.uid).pseudo} : ${f(e.value)}`}>
        <${Avatar} user=${playerOf(v, e.uid)} size=${24} /><span class="tiny">${f(e.value)}</span>
      </div>`,
    )}
  </div>`
}

function JusteR({ v, gs }) {
  const rv = gs.reveal
  const target = rv.secret.answer
  const pct = (d) => (target ? Math.round((d.dist / target) * 100) : null)
  return html`<div class="live-card">
    <h2 class="live-q">${rv.prompt.q}</h2>
    <p class="big-answer">${fmtEst(rv.prompt, target)} ${rv.prompt.unit || ''}</p>
    <${NumberLine} v=${v} rv=${rv} />
    <${RoundPoints} v=${v} rv=${rv} label=${(d) =>
      `${fmtEst(rv.prompt, d.value)} · ${d.dist === 0 ? t('justenombre.exact') : t('justenombre.off', { n: formatNumber(d.dist) })}${d.dist && pct(d) !== null && !isYear(rv.prompt, target) ? ` (${pct(d)} %)` : ''}`} />
  </div>`
}

// ---------- Petit Bac ----------

function BacQ({ gs, canPlay }) {
  const p = gs.prompt
  const letter = p.letter
  const [vals, setVals] = useState({})
  const [sent, setSent] = useState(false)
  const valsRef = useRef(vals)
  valsRef.current = vals
  const sentRef = useRef(false)
  const isComplete = (x) => p.categories.every((c) => compactWord(x[c.id] || '').length >= 2)
  const okFor = (txt) => {
    const c = compactWord(txt || '')
    return c.length >= 2 && c.startsWith(compactWord(letter))
  }
  const send = async () => {
    if (sentRef.current || !canPlay) return
    sentRef.current = true
    setSent(true)
    try {
      await answer(gs, valsRef.current)
      play(isComplete(valsRef.current) ? 'turn' : 'pop')
    } catch (err) {
      if (err.code !== 'already_answered') {
        sentRef.current = false
        setSent(false)
      }
      quiet(err)
    }
  }
  // Envoi automatique juste avant la fin du temps (le serveur accepte encore quelques secondes après).
  useEffect(() => {
    if (sent || !canPlay) return
    const timer = setTimeout(send, Math.max(0, gs.phaseEnd - serverNow() - 400))
    return () => clearTimeout(timer)
  }, [gs.phaseEnd, sent, canPlay])
  const complete = isComplete(vals)
  const filled = p.categories.filter((c) => okFor(vals[c.id])).length
  return html`<div class="live-card bac">
    <div class="row" style=${{ justifyContent: 'center', gap: '12px' }}>
      <div class="bac-letter" aria-label=${t('petitbac.letterAria', { letter })}>${letter}</div>
      <span class="pill white">${t('petitbac.filled', { n: filled, total: p.categories.length })}</span>
    </div>
    <div class="bac-fields">
      ${p.categories.map(
        (c, i) => html`<label key=${c.id} class=${`bac-field ${vals[c.id] ? (okFor(vals[c.id]) ? 'ok' : 'bad') : ''}`}>
          <span class="bac-cat">${c.label}</span>
          <input class="input" maxlength="32" autocomplete="off" autocorrect="off" spellcheck="false" disabled=${sent || !canPlay} value=${vals[c.id] || ''}
            placeholder=${`${letter}…`} enterkeyhint=${i === p.categories.length - 1 ? 'done' : 'next'}
            onKeyDown=${(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const next = e.currentTarget.closest('.bac-fields')?.querySelectorAll('input')[i + 1]
                if (next) next.focus()
                else if (isComplete(valsRef.current)) send()
              }
            }}
            onInput=${(e) => setVals({ ...valsRef.current, [c.id]: e.currentTarget.value })} />
        </label>`,
      )}
    </div>
    ${canPlay &&
    (sent
      ? html`<p class="guess-feedback"><span class="pill sky">${t('petitbac.sent')}</span></p>`
      : html`<button class=${`btn btn-big ${complete ? 'btn-danger' : 'btn-secondary'}`} onClick=${send}>${complete ? `🛑 ${t('petitbac.stop')}` : t('petitbac.done')}</button>`)}
    <p class="live-hint">${t('petitbac.hint')}</p>
  </div>`
}

/** Vérification : chacun peut contester les réponses douteuses des autres (retirées à la majorité). */
function BacR({ v, gs, now, canPlay }) {
  const rv = gs.reveal
  const myId = me.value.id
  const cats = rv.prompt.categories
  const uids = Object.keys(rv.detail || {}).sort((a, b) => (rv.points[b] || 0) - (rv.points[a] || 0))
  const votes = game.value.votes
  const [mine, setMine] = useState(() => new Set(votes?.mine || []))
  const timer = useRef(null)
  const open = canPlay && now < gs.phaseEnd && !rv.settled
  const need = votes?.need || 1
  const toggle = (key) => {
    if (!open) return
    const next = new Set(mine)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setMine(next)
    play('pop')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => act({ type: 'vote', round: gs.round, targets: [...next] }).catch(quiet), 350)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  return html`<div class="live-card bac">
    <div class="row" style=${{ justifyContent: 'center', gap: '12px' }}>
      <div class="bac-letter small" aria-hidden="true">${rv.prompt.letter}</div>
      <p class="small grow" style=${{ margin: 0 }}>${open ? t('petitbac.contestHint', { n: need }) : t('petitbac.contestClosed')}</p>
    </div>
    ${uids.length > 0 &&
    html`<div class="bac-table">
      ${cats.map(
        (c) => html`<div class="bac-row" key=${c.id}>
          <span class="bac-cat">${c.label}</span>
          <div class="bac-answers">
            ${uids.map((u) => {
              const a = rv.detail[u].answers?.[c.id]
              const p = playerOf(v, u)
              const key = `${u}:${c.id}`
              const count = votes?.tally?.[key] || 0
              const out = a?.contested || (a?.ok && count >= need)
              const canContest = open && a?.ok && u !== myId
              const cls = out ? 'out' : a?.ok ? (a.pts === 5 ? 'dup' : 'ok') : 'bad'
              return html`<span key=${u} class=${`bac-chip ${cls}`} title=${p.pseudo}>
                <${Avatar} user=${p} size=${18} /> <span class="ellipsis">${a?.text || '—'}</span> <b>${out ? '0' : a?.pts ? `+${a.pts}` : '0'}</b>
                ${canContest &&
                html`<button type="button" class="contest" aria-pressed=${String(mine.has(key))} onClick=${() => toggle(key)}
                  aria-label=${t('petitbac.contestAria', { word: a.text, pseudo: p.pseudo })}>👎${count ? ` ${count}` : ''}</button>`}
                ${!canContest && count > 0 && html`<span class="contest-count">👎 ${count}</span>`}
              </span>`
            })}
          </div>
        </div>`,
      )}
    </div>`}
    <p class="tiny muted">${t('petitbac.scoring')}</p>
    <${RoundPoints} v=${v} rv=${rv} />
  </div>`
}

// ---------- Courses : Calcul express, Mots mélangés ----------

const raceLabel = (d) => t('race.timeRank', { rank: ordinal(d.rank), s: secs1(d.ms) })

/** Retour d'une proposition dans une course : bonne réponse, erreur (courte pause), trop rapide. */
function useRace(gs, canPlay) {
  const [state, setState] = useState(null)
  const [shaking, setShaking] = useState(false)
  const [pauseUntil, setPauseUntil] = useState(0)
  useEffect(() => {
    if (!pauseUntil) return
    const timer = setTimeout(() => setPauseUntil(0), Math.max(0, pauseUntil - Date.now()))
    return () => clearTimeout(timer)
  }, [pauseUntil])
  const submit = async (value, onWrong) => {
    if (!value || state?.rank !== undefined || !canPlay || pauseUntil) return
    try {
      const res = await answer(gs, value)
      if (res.result === 'correct') {
        setState({ rank: res.rank })
        play('found')
        buzz(60)
      } else {
        setState({ wrong: true })
        setShaking(true)
        setTimeout(() => setShaking(false), 450)
        setPauseUntil(Date.now() + (res.retryAfterMs || 1200))
        play('close')
        onWrong?.()
      }
    } catch (err) {
      if (err.code === 'already_found') setState({ rank: 0 })
      else if (err.code === 'too_fast') setPauseUntil(Date.now() + (err.retryAfterMs || 800))
      else quiet(err)
    }
  }
  return { state, setState, shaking, paused: !!pauseUntil, submit }
}

function RaceDone({ state }) {
  return html`<p class="guess-feedback" role="status"><span class="pill mint"><${Icon} name="check" size=${16} /> ${state.rank ? t('race.found', { rank: ordinal(state.rank) }) : t('race.alreadyFound')}</span></p>`
}

function RaceFeedback({ race }) {
  return html`<p class="live-hint" aria-live="polite">${race.paused ? `⏳ ${t('race.pause')}` : race.state?.wrong ? `✗ ${t('race.wrong')}` : ''}</p>`
}

/** Pavé numérique (téléphones et tablettes : pas de clavier système qui masque le calcul). */
function Keypad({ onKey, disabled }) {
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '−', '0', '⌫']
  return html`<div class="keypad" role="group" aria-label=${t('calcul.keypad')}>
    ${keys.map(
      (k) => html`<button key=${k} type="button" class=${`key ${k === '⌫' ? 'key-del' : ''}`} disabled=${disabled} onClick=${() => onKey(k)}
        aria-label=${k === '⌫' ? t('calcul.erase') : k === '−' ? t('calcul.minus') : k}>${k}</button>`,
    )}
  </div>`
}

function CalculQ({ gs, canPlay }) {
  const [val, setVal] = useState('')
  const ref = useRef(null)
  const race = useRace(gs, canPlay)
  const touch = !finePointer.value
  useEffect(() => {
    if (canPlay && !touch) ref.current?.focus()
  }, [])
  const submit = (e) => {
    e?.preventDefault?.()
    race.submit(val.trim().replace('−', '-'), () => setVal(''))
  }
  const onKey = (k) => {
    if (k === '⌫') setVal((x) => x.slice(0, -1))
    else if (k === '−') setVal((x) => (x.startsWith('−') ? x.slice(1) : `−${x}`))
    else setVal((x) => (x.length < 6 ? x + k : x))
    if (race.state?.wrong) race.setState(null)
  }
  const text = gs.prompt.eq ? gs.prompt.text : `${gs.prompt.text} = ?`
  return html`<div class="live-card">
    <p class="calc-problem">${text}</p>
    ${race.state?.rank !== undefined
      ? html`<${RaceDone} state=${race.state} />`
      : html`<form class=${`guess-form big ${race.shaking ? 'shake' : ''}`} onSubmit=${submit}>
            <label class="sr-only" for="race-in">${t('calcul.label')}</label>
            <input id="race-in" ref=${ref} class="input" inputmode=${touch ? 'none' : 'numeric'} readonly=${touch} autocomplete="off" value=${val} disabled=${!canPlay}
              placeholder=${t('calcul.label')} onInput=${(e) => setVal(e.currentTarget.value)} />
            <button class="btn btn-primary" disabled=${!canPlay || !val.trim() || race.paused}>${t('live.validate')}</button>
          </form>
          ${touch && html`<${Keypad} onKey=${onKey} disabled=${!canPlay || race.paused} />`}
          <${RaceFeedback} race=${race} />`}
    <p class="live-hint">${t('race.hint')}</p>
  </div>`
}

function CalculR({ v, gs }) {
  const rv = gs.reveal
  const text = rv.prompt.eq ? rv.prompt.text.replace('?', `[${rv.secret.answer}]`) : `${rv.prompt.text} = ${rv.secret.answer}`
  return html`<div class="live-card">
    <p class="calc-problem">${text}</p>
    <${RoundPoints} v=${v} rv=${rv} label=${raceLabel} />
  </div>`
}

/** Mots mélangés : on touche les lettres pour les placer, on touche une case pour la vider. */
function AnagrammeQ({ gs, canPlay }) {
  const p = gs.prompt
  const n = p.letters.length
  const [order, setOrder] = useState(() => p.letters.map((_, i) => i))
  const [picked, setPicked] = useState([])
  const race = useRace(gs, canPlay)
  const used = new Set(picked)
  const word = picked.map((i) => p.letters[i]).join('')
  const done = race.state?.rank !== undefined
  const pick = (i) => {
    if (!canPlay || done || used.has(i) || picked.length >= n) return
    const next = [...picked, i]
    setPicked(next)
    play('pop')
    if (race.state?.wrong) race.setState(null)
    if (next.length === n) race.submit(next.map((x) => p.letters[x]).join(''), () => setPicked([]))
  }
  const unpick = (slot) => setPicked((x) => x.filter((_, k) => k !== slot))
  const shuffleTiles = () => setOrder((o) => [...o].sort(() => Math.random() - 0.5))
  useEffect(() => {
    if (!canPlay) return
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea')) return
      if (e.key === 'Backspace') return setPicked((x) => x.slice(0, -1))
      if (e.key === 'Enter') return picked.length && race.submit(word, () => setPicked([]))
      const letter = compactWord(e.key).toUpperCase()
      if (letter.length !== 1) return
      const free = order.find((i) => !used.has(i) && p.letters[i] === letter)
      if (free !== undefined) pick(free)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  return html`<div class="live-card">
    ${p.theme && hasKey(`theme.${p.theme}`) && html`<span class="pill white">${t(`theme.${p.theme}`)}</span>`}
    <div class=${`slots ${race.shaking ? 'shake' : ''}`} style=${{ '--n': n }} role="group" aria-label=${t('anagramme.slotsAria', { word: word || '—' })}>
      ${Array.from({ length: n }, (_, k) => {
        const tile = picked[k]
        const ghost = tile === undefined ? (k === 0 ? p.first : k === n - 1 ? p.last : null) : null
        return html`<button key=${k} type="button" class=${`slot ${tile !== undefined ? 'filled' : ''} ${ghost ? 'ghost' : ''}`} disabled=${tile === undefined || done}
          onClick=${() => unpick(k)}>${tile !== undefined ? p.letters[tile] : ghost || ''}</button>`
      })}
    </div>
    ${!done &&
    html`<div class="tiles" style=${{ '--n': n }} role="group" aria-label=${t('anagramme.lettersAria', { letters: p.letters.join(' ') })}>
        ${order.map((i) => html`<button key=${i} type="button" class="tile" disabled=${!canPlay || used.has(i) || race.paused} onClick=${() => pick(i)}>${p.letters[i]}</button>`)}
      </div>
      <div class="row" style=${{ justifyContent: 'center' }}>
        <button type="button" class="btn btn-ghost btn-small" onClick=${shuffleTiles}><${Icon} name="refresh" /> ${t('anagramme.shuffle')}</button>
        <button type="button" class="btn btn-ghost btn-small" disabled=${!picked.length} onClick=${() => setPicked([])}>${t('anagramme.clear')}</button>
      </div>`}
    ${done ? html`<${RaceDone} state=${race.state} />` : html`<${RaceFeedback} race=${race} />`}
    <p class="tiny muted center">${p.first ? (p.last ? t('anagramme.hint2', { first: p.first, last: p.last }) : t('anagramme.hintFirst', { letter: p.first })) : t('anagramme.howTo')}</p>
  </div>`
}

function AnagrammeR({ v, gs }) {
  const rv = gs.reveal
  return html`<div class="live-card">
    <p class="small muted center">${t('anagramme.was')}</p>
    <p class="reveal-word center">${rv.secret.word}</p>
    <${RoundPoints} v=${v} rv=${rv} label=${raceLabel} />
  </div>`
}

const LIVE_UI = {
  quiz: { Q: QuizQ, R: QuizR },
  reflexe: { Q: ReflexeQ, R: ReflexeR },
  justenombre: { Q: JusteQ, R: JusteR },
  petitbac: { Q: BacQ, R: BacR },
  calcul: { Q: CalculQ, R: CalculR },
  anagramme: { Q: AnagrammeQ, R: AnagrammeR },
}
