// Jeux en direct « par manches » : question → réponses → révélation, scores en continu.
// Quiz, Réflexe, Le juste nombre, Petit Bac, Calcul express, Mots mélangés. Le chrono suit le serveur.
import { useEffect, useRef, useState } from 'preact/hooks'
import { html } from '../../lib/html.js'
import { Icon } from '../../components/icons.js'
import { Shiba, Avatar } from '../../components/Shiba.js'
import { game, act, joinGame } from '../../state/game.js'
import { me, errorToast } from '../../state/core.js'
import { serverNow } from '../../lib/clock.js'
import { useNow } from '../../lib/layout.js'
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
  return html`<div class=${`live live-${v.type}`}>
    <div class="live-top">
      <span class="di-round">${t('live.round', { n: Math.min(gs.round + 1, gs.total), total: gs.total })}</span>
      ${showTimer &&
      html`<span class=${`timer ${alert ? 'alert' : ''}`} role="timer" aria-live="off" aria-label=${tn('live.secondsLeft', secs)}>
        <${Icon} name=${alert ? 'alert' : 'clock'} size=${20} /> ${secs} s</span>`}
      ${gs.phase === 'reveal' && html`<span class="pill butter">${t('live.reveal')}</span>`}
    </div>
    ${gs.stoppedBy && gs.phase === 'question' &&
    html`<div class="game-banner stop-banner" role="alert">🛑 ${gs.stoppedBy === myId ? t('petitbac.youStopped') : t('petitbac.stopped', { pseudo: playerOf(v, gs.stoppedBy).pseudo })}</div>`}
    <div class="live-stage">
      ${gs.phase === 'question'
        ? html`<${UI.Q} key=${`q${gs.round}`} v=${v} gs=${gs} now=${now} canPlay=${canPlay} />`
        : html`<${UI.R} key=${`r${gs.round}`} v=${v} gs=${gs} />`}
      ${late && html`<p class="guess-feedback"><span class="pill sky">${t('game.lateNext')}</span></p>`}
      ${!myPlayer && html`<${Spectator} v=${v} />`}
    </div>
    <aside class="live-side" aria-label=${t('live.scores')}><${LiveScores} v=${v} gs=${gs} /></aside>
  </div>`
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
  const now = serverNow()
  const last = gs.phase === 'reveal' ? gs.reveal?.points || {} : {}
  const players = v.players.filter((p) => !p.left).sort((a, b) => b.score - a.score)
  return html`<ol class="scoreboard">
    ${players.map((p, i) => {
      const absent = p.id !== myId && presence[p.id] && now - presence[p.id] > LIMITS.absentMs
      return html`<li key=${p.id} class=${`${p.id === myId ? 'me' : ''} ${absent ? 'absent' : ''} ${last[p.id] > 0 ? 'found' : ''}`}>
        <span class="rank-n">${i + 1}</span>
        <${Avatar} user=${p} size=${30} mood=${last[p.id] > 0 ? 'fete' : 'content'} />
        <span class="col" style=${{ gap: 0, minWidth: 0 }}>
          <span class="score-name">${p.pseudo}${p.id === myId ? ` ${t('common.youParen')}` : ''}</span>
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
      return html`<li key=${uid}>
        <${Avatar} user=${p} size=${28} />
        <span class="ellipsis grow">${p.pseudo}</span>
        ${label && d && html`<span class="small muted">${label(d)}</span>`}
        <span class=${`pts ${pts > 0 ? 'plus' : ''}`}>+${pts}</span>
      </li>`
    })}
  </ul>`
}

// ---------- Quiz de la meute ----------

function QuizQ({ gs, canPlay }) {
  const p = gs.prompt
  const [picked, setPicked] = useState(null)
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
  return html`<div class="live-card">
    ${p.cat && hasKey(`quiz.cat.${p.cat}`) && html`<span class="pill white">${t(`quiz.cat.${p.cat}`)}</span>`}
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
    <${RoundPoints} v=${v} rv=${rv} label=${(d) => (d.ok ? '✓' : '✗')} />
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
    resRef.current = { ms }
    setRes(resRef.current)
    play('found')
    buzz(40)
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
  return html`<div class="live-card reflex">
    <button class=${`reflex-field ${shown ? 'go' : ''} ${res?.early ? 'early' : ''}`} onPointerDown=${tap} disabled=${!canPlay} aria-label=${t('reflexe.tapAria')}>
      ${Array.from({ length: SPOTS }, (_, i) =>
        html`<span key=${i} class="bush">${shown && i === p.spot ? html`<span class="pop-shiba"><${Shiba} coat=${p.coat} mood="surpris" size=${78} /></span>` : html`<span aria-hidden="true">🌿</span>`}</span>`,
      )}
    </button>
    <p class="live-hint big" aria-live="assertive">
      ${res?.early ? `😅 ${t('reflexe.early')}` : res ? `⚡ ${t('reflexe.ms', { ms: res.ms })}` : shown ? t('reflexe.now') : t('reflexe.wait')}
    </p>
  </div>`
}

function ReflexeR({ v, gs }) {
  const rv = gs.reveal
  return html`<div class="live-card">
    <h2 class="live-q">${t('reflexe.results')}</h2>
    <${RoundPoints} v=${v} rv=${rv} label=${(d) => (d.early ? t('reflexe.tooEarly') : t('reflexe.ms', { ms: d.ms }))} />
  </div>`
}

// ---------- Le juste nombre ----------

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
      : html`<p class="guess-feedback"><span class="pill sky">${t('justenombre.sent', { n: typeof sent === 'number' ? formatNumber(sent) : sent, unit: p.unit || '' })}</span></p>`}
    <p class="live-hint">${t('justenombre.hint')}</p>
  </div>`
}

function JusteR({ v, gs }) {
  const rv = gs.reveal
  return html`<div class="live-card">
    <h2 class="live-q">${rv.prompt.q}</h2>
    <p class="big-answer">${formatNumber(rv.secret.answer)} ${rv.prompt.unit || ''}</p>
    <${RoundPoints} v=${v} rv=${rv} label=${(d) => `${formatNumber(d.value)} · ${d.dist === 0 ? t('justenombre.exact') : t('justenombre.off', { n: formatNumber(d.dist) })}`} />
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
  return html`<div class="live-card bac">
    <div class="bac-letter" aria-label=${t('petitbac.letterAria', { letter })}>${letter}</div>
    <div class="bac-fields">
      ${p.categories.map(
        (c) => html`<label key=${c.id} class=${`bac-field ${vals[c.id] ? (okFor(vals[c.id]) ? 'ok' : 'bad') : ''}`}>
          <span class="bac-cat">${c.label}</span>
          <input class="input" maxlength="32" autocomplete="off" autocorrect="off" spellcheck="false" disabled=${sent || !canPlay} value=${vals[c.id] || ''}
            placeholder=${`${letter}…`} onInput=${(e) => setVals({ ...valsRef.current, [c.id]: e.currentTarget.value })} />
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

function BacR({ v, gs }) {
  const rv = gs.reveal
  const cats = rv.prompt.categories
  const uids = Object.keys(rv.detail || {}).sort((a, b) => (rv.points[b] || 0) - (rv.points[a] || 0))
  return html`<div class="live-card bac">
    <div class="bac-letter small" aria-hidden="true">${rv.prompt.letter}</div>
    ${uids.length > 0 &&
    html`<div class="bac-table">
      ${cats.map(
        (c) => html`<div class="bac-row" key=${c.id}>
          <span class="bac-cat">${c.label}</span>
          <div class="bac-answers">
            ${uids.map((u) => {
              const a = rv.detail[u].answers?.[c.id]
              const p = playerOf(v, u)
              return html`<span key=${u} class=${`bac-chip ${a?.ok ? (a.pts === 5 ? 'dup' : 'ok') : 'bad'}`} title=${p.pseudo}>
                <${Avatar} user=${p} size=${18} /> <span class="ellipsis">${a?.text || '—'}</span> <b>${a?.pts ? `+${a.pts}` : '0'}</b></span>`
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

function RaceInput({ gs, canPlay, label, inputmode, value, setValue, inputRef }) {
  const [state, setState] = useState(null)
  const [shaking, setShaking] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    const val = value.trim()
    if (!val || state?.rank !== undefined || !canPlay) return
    try {
      const res = await answer(gs, val)
      if (res.result === 'correct') {
        setState({ rank: res.rank })
        play('found')
        buzz(60)
      } else {
        setState({ wrong: true })
        setShaking(true)
        setTimeout(() => setShaking(false), 450)
        play('close')
        setValue('')
      }
    } catch (err) {
      if (err.code === 'already_found') setState({ rank: 0 })
      else if (err.code === 'too_fast') setState({ slow: true })
      else quiet(err)
    }
    inputRef?.current?.focus()
  }
  if (state?.rank !== undefined) {
    return html`<p class="guess-feedback" role="status"><span class="pill mint"><${Icon} name="check" size=${16} /> ${state.rank ? t('race.found', { rank: ordinal(state.rank) }) : t('race.alreadyFound')}</span></p>`
  }
  return html`<div class="col" style=${{ gap: '4px' }}>
    <form class=${`guess-form big ${shaking ? 'shake' : ''}`} onSubmit=${submit}>
      <label class="sr-only" for="race-in">${label}</label>
      <input id="race-in" ref=${inputRef} class="input" inputmode=${inputmode} autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
        enterkeyhint="send" value=${value} disabled=${!canPlay} placeholder=${label} onInput=${(e) => {
          setValue(e.currentTarget.value)
          if (state) setState(null)
        }} />
      <button class="btn btn-primary" disabled=${!canPlay || !value.trim()}>${t('live.validate')}</button>
    </form>
    <p class="live-hint" aria-live="polite">${state?.wrong ? `✗ ${t('race.wrong')}` : state?.slow ? t('err.too_fast') : ''}</p>
  </div>`
}

const raceLabel = (d) => t('race.timeRank', { rank: ordinal(d.rank), s: (Math.max(0, d.ms || 0) / 1000).toFixed(1) })

function CalculQ({ gs, canPlay }) {
  const [val, setVal] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    if (canPlay) ref.current?.focus()
  }, [])
  return html`<div class="live-card">
    <p class="calc-problem">${gs.prompt.text} = ?</p>
    <${RaceInput} gs=${gs} canPlay=${canPlay} label=${t('calcul.label')} inputmode="numeric" value=${val} setValue=${setVal} inputRef=${ref} />
    <p class="live-hint">${t('race.hint')}</p>
  </div>`
}

function CalculR({ v, gs }) {
  const rv = gs.reveal
  return html`<div class="live-card">
    <p class="calc-problem">${rv.prompt.text} = <b>${rv.secret.answer}</b></p>
    <${RoundPoints} v=${v} rv=${rv} label=${raceLabel} />
  </div>`
}

function AnagrammeQ({ gs, canPlay }) {
  const p = gs.prompt
  const [order, setOrder] = useState(() => p.letters.map((_, i) => i))
  const [val, setVal] = useState('')
  const ref = useRef(null)
  const shuffleTiles = () => setOrder((o) => [...o].sort(() => Math.random() - 0.5))
  return html`<div class="live-card">
    ${p.theme && hasKey(`theme.${p.theme}`) && html`<span class="pill white">${t(`theme.${p.theme}`)}</span>`}
    <div class="tiles" role="group" aria-label=${t('anagramme.lettersAria', { letters: p.letters.join(' ') })}>
      ${order.map(
        (i) => html`<button key=${i} type="button" class="tile" disabled=${!canPlay} onClick=${() => {
          setVal((x) => x + p.letters[i])
          ref.current?.focus()
        }}>${p.letters[i]}</button>`,
      )}
    </div>
    <div class="row" style=${{ justifyContent: 'center' }}>
      <button type="button" class="btn btn-ghost btn-small" onClick=${shuffleTiles}><${Icon} name="refresh" /> ${t('anagramme.shuffle')}</button>
      <button type="button" class="btn btn-ghost btn-small" disabled=${!val} onClick=${() => setVal('')}>${t('anagramme.clear')}</button>
    </div>
    ${p.first ? html`<p class="center"><span class="pill butter">💡 ${t('anagramme.hintFirst', { letter: p.first })}</span></p>` : html`<p class="tiny muted center">${tn('common.letters', p.length)}</p>`}
    <${RaceInput} gs=${gs} canPlay=${canPlay} label=${t('anagramme.label')} inputmode="text" value=${val} setValue=${setVal} inputRef=${ref} />
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
