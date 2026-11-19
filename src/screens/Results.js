// Résultats : podium, classement complet, XP gagnée (barre qui se remplit), badges, dessins, « Rejouer ».
import { useEffect, useRef, useState } from 'preact/hooks'
import { html } from '../lib/html.js'
import { Icon } from '../components/icons.js'
import { Shiba, Avatar } from '../components/Shiba.js'
import { XpBar } from '../components/ui.js'
import { game, createGame } from '../state/game.js'
import { me, refreshMe, queueCelebration, keyReminderPending, errorToast } from '../state/core.js'
import { navigate, paths } from '../lib/router.js'
import { play, confetti } from '../lib/fx.js'
import { load, save } from '../lib/storage.js'
import { levelFromXp, BADGES } from '../../shared/progression.js'
import { openLightbox } from './Lightbox.js'

const ENDINGS = {
  complete: 'Partie terminée : bien joué, la meute !',
  not_enough: 'Partie terminée : il ne restait plus assez de joueurs. Les points acquis comptent.',
}

export function Results({ rid }) {
  const g = game.value
  const v = g.view
  const myId = me.value.id
  const ranking = v.results?.ranking || []
  const rewards = v.rewards || {}
  const mine = rewards[myId]
  const byId = Object.fromEntries(v.players.map((p) => [p.id, p]))
  const podium = [ranking[1], ranking[0], ranking[2]].filter(Boolean)
  const [busy, setBusy] = useState(false)
  const [fill, setFill] = useState(null)
  const celebratedRef = useRef(false)

  // Célébrations (une seule fois par partie et par appareil).
  useEffect(() => {
    if (!v.rewardsDone || celebratedRef.current) return
    celebratedRef.current = true
    const done = new Set(load('shx.celebratedGames', []))
    const first = !done.has(v.id)
    if (first) {
      done.add(v.id)
      save('shx.celebratedGames', [...done].slice(-40))
    }
    const myRank = ranking.find((r) => r.uid === myId)?.rank
    if (first && myRank === 1) {
      play('win')
      confetti()
    }
    if (mine) {
      const before = levelFromXp(Math.max(0, mine.xpAfter - mine.xp))
      setFill({ from: before, to: levelFromXp(mine.xpAfter) })
      if (first) {
        if (mine.levelAfter > mine.levelBefore) setTimeout(() => queueCelebration({ type: 'level', level: mine.levelAfter, accessories: mine.accessories }), 1400)
        for (const b of mine.badges || []) queueCelebration({ type: 'badge', id: b })
      }
    }
    refreshMe().then((m) => {
      if (first && mine?.valid && m && m.stats?.games === 1 && !m.keyReminderShown) setTimeout(() => (keyReminderPending.value = true), 2500)
    })
  }, [v.rewardsDone])

  const replay = async () => {
    setBusy(true)
    try {
      const next = await createGame(rid, v.type, v.id)
      navigate(paths.game(rid, next.id))
    } catch (err) {
      errorToast(err)
      setBusy(false)
    }
  }

  const drawings = v.results?.drawings || []
  return html`<div class="screen-body">
    <div class="results">
      <div class="center">
        <h2>Fin de la partie !</h2>
        <p class="muted small">${ENDINGS[v.endReason] || ENDINGS.complete}</p>
      </div>
      ${v.nextGameId &&
      html`<div class="game-banner"><span class="grow">Une nouvelle partie est ouverte avec les mêmes joueurs !</span>
        <button class="btn btn-small btn-primary" onClick=${() => navigate(paths.game(rid, v.nextGameId))}>Y aller</button></div>`}
      <div class="podium" aria-label="Podium">
        ${podium.map(
          (r) => html`<div class="podium-spot" key=${r.uid}>
            <${Shiba} body coat=${byId[r.uid]?.coat} acc=${byId[r.uid]?.acc} mood=${r.rank === 1 ? 'fete' : 'content'} size=${r.rank === 1 ? 110 : 84} />
            <span class="who ellipsis">${byId[r.uid]?.pseudo}</span>
            <span class="small">${r.score} pts</span>
            <div class=${`podium-step r${r.rank}`}>${r.rank}</div>
          </div>`,
        )}
      </div>
      ${!v.rewardsDone && html`<div class="row" style=${{ justifyContent: 'center' }}><${Shiba} body wag size=${48} /><span class="muted">Calcul des récompenses…</span></div>`}
      ${v.rewardsDone && v.results && !v.results.valid &&
      html`<p class="card small center">Partie trop courte pour gagner de l’XP : il faut au moins 3 manches jouées.</p>`}
      ${mine && mine.valid &&
      html`<section class="card col">
        <div class="row"><b class="grow">Ton XP : +${mine.xp}</b><span class="pill butter">Niveau ${mine.levelAfter}</span></div>
        <${XpBarAnimated} fill=${fill} />
        <ul class="xp-lines">${mine.lines.map((l) => html`<li key=${l.label}><span>${l.label}</span><b>+${l.xp}</b></li>`)}</ul>
        ${mine.badges?.length > 0 &&
        html`<p class="small"><b>Badges débloqués :</b> ${mine.badges.map((b) => BADGES.find((x) => x.id === b)?.name).join(', ')}</p>`}
      </section>`}
      <section>
        <h3 class="section-title">Classement complet</h3>
        <ol class="ranking">
          ${ranking.map(
            (r) => html`<li key=${r.uid} class=${r.uid === myId ? 'me' : ''}>
              <span class="rank">${r.rank}</span>
              <${Avatar} user=${byId[r.uid]} size=${36} />
              <span class="grow"><b>${byId[r.uid]?.pseudo}</b>${byId[r.uid]?.left ? html` <span class="pill white tiny">parti</span>` : ''}<br />
                <span class="tiny muted">${r.score} points · ${r.found} mot${r.found > 1 ? 's' : ''} trouvé${r.found > 1 ? 's' : ''}</span></span>
              ${rewards[r.uid] && html`<span class="xp-gain">+${rewards[r.uid].xp} XP</span>`}
            </li>`,
          )}
        </ol>
      </section>
      ${drawings.length > 0 &&
      html`<section>
        <h3 class="section-title">Les dessins de la partie</h3>
        <div class="thumbs" style=${{ flexWrap: 'wrap' }}>
          ${drawings.map(
            (d, i) => html`<button class="thumb" key=${d.r} style=${{ width: '140px' }} aria-label=${`Agrandir le dessin « ${d.word} »`}
              onClick=${() => openLightbox(drawings.map((x) => ({ src: `/api/games/${v.id}/drawings/${x.r}`, word: x.word })), i)}>
              <img src=${`/api/games/${v.id}/drawings/${d.r}`} alt=${`Dessin : ${d.word}`} loading="lazy" onError=${(e) => (e.currentTarget.style.visibility = 'hidden')} />
              <span class="word">${d.word} · ${byId[d.drawerId]?.pseudo || ''}</span>
            </button>`,
          )}
        </div>
      </section>`}
    </div>
    <div class="results-actions" style=${{ maxWidth: '760px', margin: '0 auto' }}>
      <button class="btn btn-primary btn-big" onClick=${replay} disabled=${busy}><${Icon} name="refresh" /> Rejouer</button>
      <button class="btn btn-secondary btn-big" onClick=${() => navigate(paths.room(rid))}><${Icon} name="chat" /> Retour au salon</button>
    </div>
  </div>`
}

function XpBarAnimated({ fill }) {
  const [p, setP] = useState(fill?.from.progress || 0)
  const [label, setLabel] = useState('')
  useEffect(() => {
    if (!fill) return
    setP(fill.from.progress)
    const t = setTimeout(() => {
      setP(fill.to.level > fill.from.level ? 1 : fill.to.progress)
      if (fill.to.level > fill.from.level) setTimeout(() => setP(fill.to.progress), 1300)
    }, 300)
    setLabel(`${fill.to.into} / ${fill.to.needed} XP vers le niveau ${fill.to.level + 1}`)
    return () => clearTimeout(t)
  }, [fill])
  return html`<div class="col" style=${{ gap: '4px' }}><${XpBar} progress=${p} /><span class="tiny muted">${label}</span></div>`
}
