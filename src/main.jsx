import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { STUDENTS, TEAM_COUNTS } from './students'
import {
  commitDraw,
  login,
  logout,
  reauthenticateCurrentUser,
  resetRemoteState,
  saveRemoteState,
  subscribeAuth,
  subscribeRemoteState,
} from './firebase'
import './styles.css'

const STORAGE_KEY = 'piaget-gincana-2026-state-v3'
const BACKUP_KEY = 'piaget-gincana-2026-reset-backup-v2'
const RESET_PHRASE = 'RESETAR GINCANA'
const WHEEL = ['AZUL', 'LARANJA', 'AZUL', 'AZUL', 'LARANJA', 'AZUL', 'LARANJA', 'LARANJA']

function makeSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `sessao-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function newSessionState(resetBy = null) {
  const now = new Date().toISOString()
  return {
    drawnIds: [],
    history: [],
    sessionId: makeSessionId(),
    sessionStartedAt: now,
    resetAt: resetBy ? now : null,
    resetBy,
  }
}

function sanitizeState(value) {
  if (!value || !Array.isArray(value.drawnIds) || !Array.isArray(value.history)) return newSessionState()
  const validIds = new Set(STUDENTS.map((s) => s.id))
  const drawnIds = [...new Set(value.drawnIds.filter((id) => validIds.has(id)))]
  const history = value.history
    .filter((item) => item && validIds.has(item.id))
    .map((item, index) => {
      const student = STUDENTS.find((s) => s.id === item.id)
      return {
        id: item.id,
        drawNumber: Number(item.drawNumber) || index + 1,
        at: item.at || null,
        name: item.name || student?.name || '',
        grade: item.grade || student?.grade || '',
        team: item.team || student?.team || '',
        wheelSlice: item.wheelSlice ?? null,
        sessionId: item.sessionId || value.sessionId || 'sessao-legada',
        operator: item.operator || null,
      }
    })
    .sort((a, b) => a.drawNumber - b.drawNumber)

  return {
    drawnIds,
    history,
    sessionId: value.sessionId || history[0]?.sessionId || 'sessao-legada',
    sessionStartedAt: value.sessionStartedAt || history[0]?.at || null,
    resetAt: value.resetAt || null,
    resetBy: value.resetBy || null,
  }
}

function safeLoad() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? sanitizeState(JSON.parse(raw)) : newSessionState()
  } catch {
    return newSessionState()
  }
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)]
}

function pickSmartStudent(undrawn, history) {
  if (undrawn.length <= 1) return undrawn[0]
  const last = history.slice(-5).map((h) => STUDENTS.find((s) => s.id === h.id)).filter(Boolean)
  const [last1, last2, last3, last4] = [last.at(-1), last.at(-2), last.at(-3), last.at(-4)]

  const scored = undrawn.map((student) => {
    let score = 7 + Math.random() * 5
    if (last1?.grade === student.grade) score -= 1.7
    if (last1?.grade === student.grade && last2?.grade === student.grade) score -= 5.5
    if (last1?.team === student.team && last2?.team === student.team) score -= 1.7
    if (last1?.team === student.team && last2?.team === student.team && last3?.team === student.team) score -= 6

    if (last1 && last2 && last3 && last4) {
      const alternating = last1.team !== last2.team && last2.team !== last3.team && last3.team !== last4.team
      if (alternating && student.team !== last1.team) score -= 4
    }

    score += Math.random() * 2
    return { student, score }
  }).sort((a, b) => b.score - a.score)

  return randomItem(scored.slice(0, Math.min(8, scored.length))).student
}

function beep(frequency = 440, duration = 0.08, volume = 0.04) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = frequency
    gain.gain.value = volume
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + duration)
  } catch {}
}

function friendlyAuthError(error) {
  const code = error?.code || ''
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'E-mail ou senha incorretos.'
  if (code.includes('too-many-requests')) return 'Muitas tentativas. Aguarde alguns instantes e tente novamente.'
  if (code.includes('network-request-failed')) return 'Sem conexão com o Firebase. Verifique a internet.'
  return 'Não foi possível entrar. Confira os dados e tente novamente.'
}

function formatTime(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) } catch { return '—' }
}

function formatDateTime(iso) {
  if (!iso) return 'Não registrado'
  try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }) } catch { return 'Não registrado' }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]))
}

function shortSession(id) {
  return id ? String(id).split('-').slice(0, 2).join('-').toUpperCase() : '—'
}

function printHtmlDocument(html) {
  const previous = document.getElementById('piaget-print-frame')
  if (previous) previous.remove()

  const iframe = document.createElement('iframe')
  iframe.id = 'piaget-print-frame'
  iframe.setAttribute('title', 'Documento para impressão')
  iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;z-index:-1;'
  document.body.appendChild(iframe)

  const win = iframe.contentWindow
  const doc = iframe.contentDocument || win?.document
  if (!win || !doc) {
    iframe.remove()
    alert('Não foi possível abrir a impressão neste navegador. Atualize a página e tente novamente.')
    return
  }

  let printed = false
  const cleanup = () => setTimeout(() => iframe.remove(), 500)
  const triggerPrint = () => {
    if (printed) return
    printed = true
    setTimeout(() => {
      try {
        win.focus()
        win.print()
      } catch {
        cleanup()
        alert('Não foi possível iniciar a impressão. Tente novamente pelo Chrome.')
      }
    }, 350)
  }

  iframe.onload = triggerPrint
  try { win.addEventListener('afterprint', cleanup, { once: true }) } catch {}
  doc.open()
  doc.write(html)
  doc.close()

  // Fallback para navegadores que não disparam load no iframe de impressão.
  setTimeout(triggerPrint, 1400)
  setTimeout(cleanup, 120000)
}

function reportPageHtml({ title, subtitle, meta, content, badge = 'DOCUMENTO OFICIAL', page = 1, totalPages = 1 }) {
  const logoUrl = `${window.location.origin}/logo-piaget.png`
  const metaHtml = meta.map(([key, value]) => `<div class="meta-item"><span>${escapeHtml(key)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')
  return `<section class="sheet">
    <div class="top-stripe"></div>
    <header class="print-header">
      <div class="brand-lockup"><img src="${logoUrl}" alt="Escola Piaget"></div>
      <div class="event-lockup"><span>GINCANA 2026</span><strong>${escapeHtml(badge)}</strong></div>
    </header>
    <div class="blue-rule"></div>
    <div class="title-block"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div>
    <div class="meta-grid">${metaHtml}</div>
    <main class="print-content">${content}</main>
    <footer class="print-footer"><div><strong>ESCOLA PIAGET</strong> • CNPJ 41.270.679/0001-16 • INEP 2202343</div><div>Emitido em ${escapeHtml(formatDateTime(new Date().toISOString()))} • Página ${page}/${totalPages}</div></footer>
  </section>`
}

function openPrintDocument({ pages, orientation = 'portrait' }) {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gincana 2026 - Escola Piaget</title><style>
    @page{size:A4 ${orientation};margin:8mm}
    *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    html,body{margin:0;padding:0;background:#fff;color:#12203a;font-family:Arial,Helvetica,sans-serif}
    body{font-size:8.2pt}
    .sheet{page-break-after:always;break-after:page;position:relative;min-height:276mm;display:flex;flex-direction:column;background:#fff;overflow:hidden}
    .sheet:last-child{page-break-after:auto;break-after:auto}
    .top-stripe{height:2.5mm;background:#f58b1f;flex:0 0 auto}
    .print-header{display:flex;align-items:center;justify-content:space-between;gap:8mm;padding:3mm 1mm 2.4mm}
    .brand-lockup{display:flex;align-items:center}.brand-lockup img{width:35mm;height:auto;display:block}
    .event-lockup{text-align:right;display:flex;flex-direction:column;align-items:flex-end}.event-lockup span{font-size:7pt;letter-spacing:.18em;color:#63728a;font-weight:800}.event-lockup strong{margin-top:1mm;padding:1.4mm 2.6mm;border-radius:99px;background:#eef3fb;color:#174e9e;font-size:7.2pt;letter-spacing:.08em}
    .blue-rule{height:.8mm;background:#1557a8;margin:0 1mm}
    .title-block{text-align:center;padding:3.2mm 2mm 2.2mm}.title-block h1{margin:0;color:#154f9e;font-size:15.2pt;line-height:1.05;text-transform:uppercase;letter-spacing:.025em}.title-block p{margin:1.2mm 0 0;color:#52627a;font-size:7.6pt;font-weight:700}
    .meta-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1.6mm;margin:0 1mm 2.5mm}.meta-item{border:1px solid #d7e0eb;background:#f6f8fb;border-radius:2mm;padding:1.6mm 1.8mm;min-width:0}.meta-item span{display:block;font-size:5.8pt;text-transform:uppercase;letter-spacing:.08em;color:#6e7d91;font-weight:800}.meta-item strong{display:block;margin-top:.5mm;font-size:7.2pt;color:#1d2c44;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .print-content{flex:1;min-height:0;padding:0 1mm}
    .team-banner{display:flex;align-items:center;justify-content:space-between;color:#fff;border-radius:2.2mm;padding:2.2mm 3mm;margin:0 0 1.8mm;font-weight:900;letter-spacing:.06em;font-size:10.2pt}.team-banner small{font-size:7pt;letter-spacing:.02em;font-weight:700;opacity:.94}.team-banner.azul{background:#155bc4}.team-banner.laranja{background:#e67817}
    .notice{margin:0 0 2mm;padding:1.6mm 2mm;border:1px solid #d8e0ea;background:#f8fafc;border-radius:1.8mm;color:#53647b;font-size:6.6pt}.notice strong{color:#1d2d46}
    table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0}
    thead{display:table-header-group}tr{page-break-inside:avoid;break-inside:avoid}
    th{background:#edf2f8;color:#44566f;font-size:6.2pt;text-transform:uppercase;letter-spacing:.05em;font-weight:900;border:1px solid #cbd6e3;padding:1.35mm 1.2mm;text-align:left}
    td{border:1px solid #d3dce7;padding:.72mm 1.2mm;font-size:7.05pt;line-height:1.08;vertical-align:middle;color:#17263d}
    tbody tr:nth-child(even) td{background:#fbfcfe}
    .c-num{width:10mm;text-align:center}.c-order{width:12mm;text-align:center}.c-time{width:21mm;text-align:center;font-variant-numeric:tabular-nums}.c-grade{width:18mm;text-align:center}.c-team{width:20mm;text-align:center;font-weight:900}.student-name{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .team-cell{font-size:6.4pt;font-weight:900;letter-spacing:.05em}.team-cell.azul{color:#155bc4;background:#eef4ff!important}.team-cell.laranja{color:#c85f08;background:#fff3e8!important}
    .grade-section{margin:0 0 2.2mm}.grade-title{display:flex;justify-content:space-between;align-items:center;background:#eff3f8;border:1px solid #d2dce8;border-bottom:0;padding:1.5mm 2mm;font-size:7.5pt;font-weight:900;color:#35465e}.grade-title span{font-size:6.2pt;color:#6e7d91}.division-content .grade-section{margin-bottom:1mm}.division-content .grade-title{padding:.85mm 1.8mm;font-size:6.8pt}.division-content .grade-title span{font-size:5.8pt}.division-content td{padding:.38mm 1.1mm;font-size:6.55pt;line-height:1}.division-content .notice{margin-bottom:1.2mm;padding:1.2mm 1.8mm}.division-content .team-banner{padding:1.8mm 2.6mm;margin-bottom:1.2mm}
    .empty{border:1px dashed #b8c5d5;background:#fafbfd;padding:10mm;text-align:center;color:#65758b;border-radius:2mm}
    .audit-note{font-size:6.3pt;color:#617187;margin:0 0 1.8mm}.audit-note b{color:#24344c}
    .print-footer{flex:0 0 auto;margin:2.8mm 1mm 0;padding:1.8mm 0 0;border-top:.5px solid #bfcbd8;display:flex;justify-content:space-between;gap:5mm;color:#67768a;font-size:5.7pt}.print-footer strong{color:#3b4b62}
    @media screen{body{background:#e9eef5;padding:12px}.sheet{width:210mm;margin:0 auto 12px;box-shadow:0 6px 30px rgba(0,0,0,.15);padding:0}}
  </style></head><body>${pages.join('')}</body></html>`
  printHtmlDocument(html)
}

function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try { await login(email, password) }
    catch (err) { setError(friendlyAuthError(err)) }
    finally { setLoading(false) }
  }

  return <div className="login-screen">
    <form className="login-card" onSubmit={submit}>
      <div className="login-brand"><div className="brand-mark">P</div><div><strong>ESCOLA PIAGET</strong><span>GINCANA 2026</span></div></div>
      <div className="login-kicker">ACESSO INTERNO</div><h1>Painel do sorteio</h1>
      <p>O acesso é restrito aos usuários autorizados no Firebase Authentication.</p>
      <label>E-mail<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>Senha<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      {error && <div className="login-error">{error}</div>}
      <button className="primary login-submit" disabled={loading}>{loading ? 'ENTRANDO…' : 'ENTRAR'}</button>
    </form>
  </div>
}

function LoadingScreen() {
  return <div className="loading-screen"><div className="brand-mark">P</div><strong>Carregando Gincana 2026…</strong></div>
}

function Confetti({ active }) {
  if (!active) return null
  return <div className="confetti" aria-hidden="true">{Array.from({ length: 44 }).map((_, i) => <i key={i} style={{ '--x': `${Math.random() * 100}%`, '--d': `${Math.random() * 1.2}s`, '--r': `${Math.random() * 360}deg` }} />)}</div>
}

function Wheel({ rotation, spinning }) {
  return <div className="wheel-shell"><div className="pointer" /><div className={`wheel ${spinning ? 'spinning' : ''}`} style={{ transform: `rotate(${rotation}deg)` }}>
    {WHEEL.map((team, i) => { const angle = i * 45; return <div className={`wheel-label ${team.toLowerCase()}`} key={i} style={{ transform: `rotate(${angle}deg) translateY(-128px) rotate(${-angle}deg)` }}>{team}</div> })}
    <div className="wheel-center"><span>PIAGET</span></div>
  </div></div>
}

function App({ user }) {
  const [persisted, setPersisted] = useState(safeLoad)
  const [phase, setPhase] = useState('idle')
  const [current, setCurrent] = useState(null)
  const [shuffleText, setShuffleText] = useState('')
  const [rotation, setRotation] = useState(0)
  const [adminOpen, setAdminOpen] = useState(false)
  const [syncStatus, setSyncStatus] = useState('Conectando ao Firebase…')
  const [remoteReady, setRemoteReady] = useState(false)
  const [confetti, setConfetti] = useState(false)
  const shuffleTimer = useRef(null)

  const drawnSet = useMemo(() => new Set(persisted.drawnIds), [persisted.drawnIds])
  const undrawn = useMemo(() => STUDENTS.filter((s) => !drawnSet.has(s.id)), [drawnSet])
  const progress = persisted.drawnIds.length
  const done = progress === STUDENTS.length

  useEffect(() => {
    const unsub = subscribeRemoteState((remote) => {
      if (remote) {
        const remoteState = sanitizeState(remote)
        const localState = safeLoad()
        // Recuperação de uma gravação local mais nova apenas quando se trata da MESMA sessão.
        if (localState.sessionId === remoteState.sessionId && localState.history.length > remoteState.history.length) {
          setPersisted(localState)
          saveRemoteState(localState).catch(() => {})
        } else {
          setPersisted(remoteState)
        }
      } else {
        const localState = safeLoad()
        const initial = localState.history.length ? localState : newSessionState()
        setPersisted(initial)
        saveRemoteState(initial).catch(() => {})
      }
      setRemoteReady(true)
      setSyncStatus('Firebase conectado')
    }, () => {
      setSyncStatus('Firebase indisponível • cópia local ativa')
      setRemoteReady(false)
    })
    return unsub
  }, [])

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)) }, [persisted])
  useEffect(() => () => clearInterval(shuffleTimer.current), [])

  useEffect(() => {
    const onKey = (e) => {
      if (adminOpen) return
      if (e.code === 'Space') {
        e.preventDefault()
        if (phase === 'idle' || phase === 'result') startStudentDraw()
        else if (phase === 'revealed') spinWheel()
      }
      if (e.key.toLowerCase() === 'f') toggleFullscreen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.()
    else document.exitFullscreen?.()
  }

  function startStudentDraw() {
    if (!undrawn.length || phase === 'shuffling' || phase === 'spinning') return
    setConfetti(false); setCurrent(null); setPhase('shuffling')
    const candidate = pickSmartStudent(undrawn, persisted.history)
    let ticks = 0
    clearInterval(shuffleTimer.current)
    shuffleTimer.current = setInterval(() => {
      setShuffleText(randomItem(undrawn).name)
      if (ticks++ % 3 === 0) beep(260 + Math.random() * 170, 0.025, 0.015)
    }, 72)
    setTimeout(() => {
      clearInterval(shuffleTimer.current)
      setShuffleText(candidate.name); setCurrent(candidate); setPhase('revealed'); beep(660, 0.11, 0.035)
    }, 2450)
  }

  function spinWheel() {
    if (!current || phase !== 'revealed') return
    setPhase('spinning')
    const matching = WHEEL.map((team, i) => ({ team, i })).filter((x) => x.team === current.team)
    const targetIndex = randomItem(matching).i
    const currentMod = ((rotation % 360) + 360) % 360
    const desired = ((-targetIndex * 45) % 360 + 360) % 360
    const delta = (desired - currentMod + 360) % 360
    const turns = 7 + Math.floor(Math.random() * 3)
    setRotation(rotation + turns * 360 + delta)

    setTimeout(() => {
      const at = new Date().toISOString()
      const drawNumber = persisted.history.length + 1
      const entry = {
        id: current.id,
        drawNumber,
        at,
        name: current.name,
        grade: current.grade,
        team: current.team,
        wheelSlice: targetIndex + 1,
        sessionId: persisted.sessionId,
        operator: user.email || null,
      }
      const next = {
        ...persisted,
        drawnIds: [...persisted.drawnIds, current.id],
        history: [...persisted.history, entry],
      }

      setPersisted(next)
      setPhase('result'); setConfetti(true)
      setSyncStatus('Registrando sorteio…')
      commitDraw(next, entry)
        .then(() => { setRemoteReady(true); setSyncStatus(`Sorteio ${drawNumber} registrado`) })
        .catch(() => { setRemoteReady(false); setSyncStatus('Falha no Firebase • registro local preservado') })

      beep(current.team === 'AZUL' ? 520 : 620, 0.15, 0.05)
      setTimeout(() => beep(current.team === 'AZUL' ? 780 : 880, 0.16, 0.04), 170)
    }, 4750)
  }

  function applyReset(next) {
    setPersisted(sanitizeState(next))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setPhase('idle'); setCurrent(null); setRotation(0); setConfetti(false)
    setRemoteReady(true); setSyncStatus('Nova sessão iniciada • 0/81')
  }

  return <div className={`app ${phase === 'result' ? `result-${current?.team?.toLowerCase()}` : ''}`}>
    <Confetti active={confetti} />
    <header><div className="brand"><div className="brand-mark">P</div><div><strong>ESCOLA PIAGET</strong><span>GINCANA 2026</span></div></div><div className="top-actions"><span className={`connection ${remoteReady ? 'online' : ''}`}>{syncStatus}</span><button className="ghost" onClick={toggleFullscreen}>Tela cheia</button><div className="account-menu"><span>{user.email}</span><button onClick={() => logout()}>Sair</button></div></div></header>

    <main>
      <section className="stage"><div className="eyebrow">SORTEIO DAS EQUIPES • FUNDAMENTAL II</div>
        {(phase === 'idle' || (phase === 'result' && !current)) && !done && <div className="hero"><div className="orb"><span>{progress + 1}</span><small>PRÓXIMO</small></div><h1>Quem será chamado agora?</h1><p>A ordem é escolhida entre os participantes ainda não chamados.</p><button className="primary" onClick={startStudentDraw}>CHAMAR PRÓXIMO ALUNO</button></div>}
        {phase === 'shuffling' && <div className="shuffle"><span className="scanline" /><div className="shuffle-kicker">ESCOLHENDO O PRÓXIMO PARTICIPANTE</div><div className="shuffle-name">{shuffleText}</div><div className="shuffle-dots"><i /><i /><i /></div></div>}
        {(phase === 'revealed' || phase === 'spinning') && current && <div className="reveal-layout"><div className={`student-card ${phase === 'spinning' ? 'compact' : ''}`}><span>{phase === 'spinning' ? 'SORTEANDO EQUIPE PARA' : 'PARTICIPANTE SELECIONADO'}</span>{phase === 'spinning' ? <h2>{current.name}</h2> : <h1>{current.name}</h1>}<strong>{current.grade}</strong>{phase === 'spinning' ? <p className="suspense">A roleta está girando…</p> : <><p>Agora é hora de descobrir a equipe.</p><button className="primary" onClick={spinWheel}>GIRAR A ROLETA</button></>}</div><Wheel rotation={rotation} spinning={phase === 'spinning'} /></div>}
        {phase === 'result' && current && !done && <div className="result-card"><div className="result-badge">RESULTADO • #{progress}</div><h2>{current.name}</h2><span>{current.grade}</span><div className={`team-title ${current.team.toLowerCase()}`}>EQUIPE {current.team}</div><button className="primary" onClick={startStudentDraw}>PRÓXIMO ALUNO</button></div>}
        {done && <FinalResults state={persisted} onAdmin={() => setAdminOpen(true)} />}
      </section>

      <aside className="panel"><div className="progress-card"><div><span>PROGRESSO</span><strong>{progress}<small>/81</small></strong></div><div className="progress-bar"><i style={{ width: `${(progress / 81) * 100}%` }} /></div></div><div className="stats"><div><span>👥</span><strong>{STUDENTS.length}</strong><small>Participantes</small></div><div><span>⏳</span><strong>{STUDENTS.length - progress}</strong><small>Restantes</small></div></div><div className="recent"><h3>Últimos chamados</h3>{persisted.history.slice(-5).reverse().map((h) => <div className="recent-row" key={`${h.id}-${h.drawNumber}`}><i className={h.team.toLowerCase()} /><span>{h.name}</span><small>{h.grade}</small></div>)}{!persisted.history.length && <p>Nenhum aluno chamado ainda.</p>}</div><div className="hint">Atalhos: <kbd>Espaço</kbd> avançar • <kbd>F</kbd> tela cheia</div><button className="danger-link" onClick={() => setAdminOpen(true)}>🔒 Área protegida</button></aside>
    </main>

    {adminOpen && <ProtectedArea state={persisted} user={user} onClose={() => setAdminOpen(false)} onReset={applyReset} />}
  </div>
}


function FinalResults({ state, onAdmin }) {
  const teams = ['AZUL', 'LARANJA']
  const grouped = Object.fromEntries(teams.map((team) => [team, state.history.filter((h) => h.team === team)]))

  return <div className="final-results">
    <div className="final-results-head">
      <div className="final-check">✓</div>
      <div>
        <span>GINCANA PIAGET 2026</span>
        <h1>Sorteio concluído!</h1>
        <p>Resultado final das equipes • 81 participantes</p>
      </div>
    </div>

    <div className="final-team-grid">
      {teams.map((team) => <section className={`final-team ${team.toLowerCase()}`} key={team}>
        <header>
          <div><span>EQUIPE</span><strong>{team}</strong></div>
          <b>{grouped[team].length}<small> integrantes</small></b>
        </header>
        <ol>
          {grouped[team].map((h, i) => <li key={`${team}-${h.drawNumber}`}>
            <span className="final-order">{String(i + 1).padStart(2, '0')}</span>
            <span className="final-name">{h.name}<small>{h.grade}</small></span>
          </li>)}
        </ol>
      </section>)}
    </div>

    <div className="final-results-foot">
      <span>Integrantes apresentados na ordem em que foram sorteados.</span>
      <button className="ghost final-admin" onClick={onAdmin}>🔒 Área protegida</button>
    </div>
  </div>
}

function ProtectedArea({ state, user, onClose, onReset }) {
  const [password, setPassword] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState('menu')

  async function unlock(e) {
    e.preventDefault()
    if (!password || checking) return
    setChecking(true); setError('')
    try { await reauthenticateCurrentUser(password); setUnlocked(true); setPassword('') }
    catch (err) {
      if ((err?.code || '').includes('invalid-credential') || (err?.code || '').includes('wrong-password')) setError('Senha incorreta. A área protegida continua bloqueada.')
      else setError('Não foi possível confirmar sua identidade. Tente novamente.')
    } finally { setChecking(false) }
  }

  if (!unlocked) return <div className="modal-backdrop admin-modal-backdrop"><form className="admin-modal protected-gate" onSubmit={unlock}><div className="admin-modal-head"><div><span>🔒 ÁREA PROTEGIDA</span><h2>Ferramentas administrativas</h2></div><button type="button" className="ghost" onClick={onClose}>Fechar</button></div><div className="protected-note"><strong>Conteúdo reservado à organização.</strong><p>A divisão cadastrada, os relatórios oficiais e o reset ficam exclusivamente nesta área.</p></div><label className="reset-label">Confirme a senha de <b>{user.email}</b><input autoFocus type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Senha atual" /></label>{error && <div className="reset-error">{error}</div>}<button className="primary admin-unlock" disabled={!password || checking}>{checking ? 'CONFIRMANDO…' : 'DESBLOQUEAR ÁREA PROTEGIDA'}</button></form></div>

  return <div className="modal-backdrop admin-modal-backdrop"><div className="admin-modal protected-panel wide-admin">
    <div className="admin-modal-head"><div><span>🔓 ÁREA PROTEGIDA</span><h2>{view === 'menu' ? 'Central administrativa' : view === 'audit' ? 'Auditoria do sorteio' : view === 'result' ? 'Resultado oficial' : view === 'division' ? 'Divisão oficial cadastrada' : 'Reiniciar sorteio'}</h2></div><div className="admin-head-actions">{view !== 'menu' && <button className="ghost" onClick={() => setView('menu')}>← Voltar</button>}<button className="ghost" onClick={onClose}>Fechar</button></div></div>
    {view === 'menu' && <AdminMenu state={state} setView={setView} />}
    {view === 'audit' && <AuditView state={state} />}
    {view === 'result' && <ResultView state={state} />}
    {view === 'division' && <DivisionView />}
    {view === 'reset' && <ResetView state={state} user={user} onReset={onReset} onDone={() => setView('menu')} />}
  </div></div>
}

function AdminMenu({ state, setView }) {
  return <><div className="admin-status"><div><span>SESSÃO ATUAL</span><strong>{state.drawnIds.length}<small> / {STUDENTS.length}</small></strong></div><p><b>{shortSession(state.sessionId)}</b><br />Iniciada em {formatDateTime(state.sessionStartedAt)}</p></div><div className="protected-actions admin-grid">
    <button className="protected-action" onClick={() => setView('audit')}><span>🧾</span><div><strong>Auditoria do sorteio</strong><small>Ordem, horário, aluno, turma e equipe de cada registro.</small></div></button>
    <button className="protected-action" onClick={() => setView('result')}><span>🏁</span><div><strong>Resultado oficial</strong><small>Equipes montadas por ordem de sorteio, atualizadas em tempo real.</small></div></button>
    <button className="protected-action" onClick={() => setView('division')}><span>📋</span><div><strong>Divisão oficial cadastrada</strong><small>Relação-base completa dos 81 alunos. Nunca aparece ao público.</small></div></button>
    <button className="protected-action danger" onClick={() => setView('reset')}><span>↺</span><div><strong>Reiniciar sorteio</strong><small>Faz backup da sessão e abre uma nova sessão com 0/81.</small></div></button>
  </div><div className="protected-foot">Cada sorteio concluído atualiza os relatórios e cria um registro de auditoria no Firebase.</div></>
}

function AuditView({ state }) {
  const rows = state.history
  function print() {
    const perPage = 42
    const chunks = rows.length ? Array.from({ length: Math.ceil(rows.length / perPage) }, (_, i) => rows.slice(i * perPage, (i + 1) * perPage)) : [[]]
    const status = rows.length === STUDENTS.length ? 'CONCLUÍDO' : 'PARCIAL'
    const finishedAt = rows.length ? rows[rows.length - 1].at : null
    const pages = chunks.map((chunk, pageIndex) => {
      const table = chunk.length ? `<table><thead><tr><th class="c-order">Ordem</th><th class="c-time">Horário</th><th>Aluno</th><th class="c-grade">Turma</th><th class="c-team">Equipe</th></tr></thead><tbody>${chunk.map((h) => `<tr><td class="c-order">${h.drawNumber}</td><td class="c-time">${escapeHtml(formatTime(h.at))}</td><td class="student-name">${escapeHtml(h.name)}</td><td class="c-grade">${escapeHtml(h.grade)}</td><td class="c-team team-cell ${h.team.toLowerCase()}">${escapeHtml(h.team)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nenhum sorteio registrado nesta sessão.</div>'
      const content = `<div class="notice"><strong>Registro de auditoria:</strong> esta relação reproduz a ordem cronológica dos sorteios concluídos na sessão, com horário registrado pelo dispositivo de operação.</div>${table}`
      return reportPageHtml({
        title: 'Relatório de Auditoria do Sorteio',
        subtitle: 'Registro cronológico oficial da sessão da Gincana 2026',
        badge: status === 'CONCLUÍDO' ? 'AUDITORIA OFICIAL' : 'AUDITORIA PARCIAL',
        meta: [['Sessão', shortSession(state.sessionId)], ['Início', formatDateTime(state.sessionStartedAt)], ['Conclusão', finishedAt ? formatDateTime(finishedAt) : 'Em andamento'], ['Registros', `${rows.length} de ${STUDENTS.length}`]],
        content,
        page: pageIndex + 1,
        totalPages: chunks.length,
      })
    })
    openPrintDocument({ pages })
  }
  return <div className="admin-view"><div className="report-toolbar"><div><span>REGISTRO CRONOLÓGICO</span><strong>{rows.length} sorteios registrados</strong></div><button className="primary small" onClick={print}>IMPRIMIR / SALVAR PDF</button></div><div className="report-meta"><span>Sessão <b>{shortSession(state.sessionId)}</b></span><span>Início <b>{formatDateTime(state.sessionStartedAt)}</b></span><span>Status <b>{rows.length === STUDENTS.length ? 'CONCLUÍDO' : 'PARCIAL'}</b></span></div><div className="table-wrap"><table className="admin-table"><thead><tr><th>#</th><th>Horário</th><th>Aluno</th><th>Turma</th><th>Equipe</th></tr></thead><tbody>{rows.map((h) => <tr key={`${h.sessionId}-${h.drawNumber}`}><td>{h.drawNumber}</td><td>{formatTime(h.at)}</td><td>{h.name}</td><td>{h.grade}</td><td><span className={`team-pill ${h.team.toLowerCase()}`}>{h.team}</span></td></tr>)}{!rows.length && <tr><td colSpan="5" className="empty-cell">Nenhum sorteio registrado nesta sessão.</td></tr>}</tbody></table></div></div>
}

function ResultView({ state }) {
  const teams = ['AZUL', 'LARANJA']
  const grouped = Object.fromEntries(teams.map((team) => [team, state.history.filter((h) => h.team === team)]))
  function print() {
    const status = state.history.length === STUDENTS.length ? 'CONCLUÍDO' : 'PARCIAL'
    const finishedAt = state.history.length ? state.history[state.history.length - 1].at : null
    const pages = teams.map((team, pageIndex) => {
      const rows = grouped[team]
      const content = `<div class="team-banner ${team.toLowerCase()}"><span>EQUIPE ${team}</span><small>${rows.length} integrante${rows.length === 1 ? '' : 's'} • ordem do sorteio</small></div>
        <div class="notice"><strong>Resultado ${status === 'CONCLUÍDO' ? 'consolidado' : 'parcial'}:</strong> os integrantes estão apresentados na sequência em que foram sorteados, mantendo o número da ordem geral e o horário de cada registro.</div>
        ${rows.length ? `<table><thead><tr><th class="c-num"># Equipe</th><th class="c-order">Geral</th><th class="c-time">Horário</th><th>Aluno</th><th class="c-grade">Turma</th></tr></thead><tbody>${rows.map((h, i) => `<tr><td class="c-num">${i + 1}</td><td class="c-order">${h.drawNumber}</td><td class="c-time">${escapeHtml(formatTime(h.at))}</td><td class="student-name">${escapeHtml(h.name)}</td><td class="c-grade">${escapeHtml(h.grade)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nenhum integrante sorteado para esta equipe nesta sessão.</div>'}`
      return reportPageHtml({
        title: 'Resultado Oficial do Sorteio',
        subtitle: status === 'CONCLUÍDO' ? 'Composição final das equipes - Gincana 2026' : 'Composição parcial das equipes - Gincana 2026',
        badge: status === 'CONCLUÍDO' ? 'RESULTADO OFICIAL' : 'RESULTADO PARCIAL',
        meta: [['Sessão', shortSession(state.sessionId)], ['Início', formatDateTime(state.sessionStartedAt)], ['Conclusão', finishedAt ? formatDateTime(finishedAt) : 'Em andamento'], ['Equipe', `${team} • ${rows.length} integrantes`]],
        content,
        page: pageIndex + 1,
        totalPages: teams.length,
      })
    })
    openPrintDocument({ pages })
  }
  return <div className="admin-view"><div className="report-toolbar"><div><span>RESULTADO DA SESSÃO</span><strong>{state.history.length === STUDENTS.length ? 'Resultado concluído' : `Resultado parcial • ${state.history.length}/81`}</strong></div><button className="primary small" onClick={print}>IMPRIMIR / SALVAR PDF</button></div><div className="result-summary"><div className="azul"><span>Equipe Azul</span><strong>{grouped.AZUL.length}</strong></div><div className="laranja"><span>Equipe Laranja</span><strong>{grouped.LARANJA.length}</strong></div></div><div className="result-tables">{teams.map((team) => <section key={team} className={`result-team ${team.toLowerCase()}`}><h3>EQUIPE {team}<small>{grouped[team].length}</small></h3><div className="table-wrap"><table className="admin-table"><thead><tr><th>Na equipe</th><th>Geral</th><th>Horário</th><th>Aluno</th><th>Turma</th></tr></thead><tbody>{grouped[team].map((h, i) => <tr key={`${team}-${h.drawNumber}`}><td>{i + 1}</td><td>{h.drawNumber}</td><td>{formatTime(h.at)}</td><td>{h.name}</td><td>{h.grade}</td></tr>)}{!grouped[team].length && <tr><td colSpan="5" className="empty-cell">Ainda sem integrantes sorteados.</td></tr>}</tbody></table></div></section>)}</div></div>
}

function DivisionView() {
  const grades = ['6º Ano', '7º Ano', '8º Ano', '9º Ano']
  function print() {
    const teams = ['AZUL', 'LARANJA']
    const pages = teams.map((team, pageIndex) => {
      const sections = grades.map((grade) => {
        const list = STUDENTS.filter((s) => s.team === team && s.grade === grade)
        return `<section class="grade-section"><div class="grade-title"><strong>${escapeHtml(grade)}</strong><span>${list.length} aluno${list.length === 1 ? '' : 's'}</span></div><table><tbody>${list.map((s, i) => `<tr><td class="c-num">${i + 1}</td><td class="student-name">${escapeHtml(s.name)}</td></tr>`).join('')}</tbody></table></section>`
      }).join('')
      const content = `<div class="division-content"><div class="team-banner ${team.toLowerCase()}"><span>EQUIPE ${team}</span><small>${TEAM_COUNTS[team]} alunos cadastrados</small></div><div class="notice"><strong>Relação-base protegida:</strong> composição cadastrada antes da execução da animação do sorteio, organizada por turma.</div>${sections}</div>`
      return reportPageHtml({
        title: 'Divisão Oficial Cadastrada',
        subtitle: 'Relação-base restrita da Gincana 2026',
        badge: 'ÁREA PROTEGIDA',
        meta: [['Participantes', '81'], ['Equipe Azul', '41'], ['Equipe Laranja', '40'], ['Equipe desta página', `${team} • ${TEAM_COUNTS[team]} alunos`]],
        content,
        page: pageIndex + 1,
        totalPages: teams.length,
      })
    })
    openPrintDocument({ pages })
  }
  return <div className="admin-view"><div className="report-toolbar"><div><span>RELAÇÃO RESTRITA</span><strong>81 alunos • 41 Azul • 40 Laranja</strong></div><button className="primary small" onClick={print}>IMPRIMIR / SALVAR PDF</button></div><div className="team-columns admin-division">{['AZUL', 'LARANJA'].map((team) => <section className={`team-list ${team.toLowerCase()}`} key={team}><h3>EQUIPE {team} <small>{TEAM_COUNTS[team]} alunos</small></h3>{grades.map((grade) => { const list = STUDENTS.filter((s) => s.team === team && s.grade === grade); return <div className="grade-list" key={grade}><h4>{grade} <small>{list.length}</small></h4><ol>{list.map((s) => <li key={s.id}>{s.name}</li>)}</ol></div> })}</section>)}</div></div>
}

function ResetView({ state, user, onReset, onDone }) {
  const [phrase, setPhrase] = useState('')
  const [password, setPassword] = useState('')
  const [ack, setAck] = useState(false)
  const [armed, setArmed] = useState(false)
  const [countdown, setCountdown] = useState(5)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const prerequisites = ack && phrase.trim().toUpperCase() === RESET_PHRASE && password.length > 0

  useEffect(() => {
    if (!armed || countdown <= 0) return
    const t = setTimeout(() => setCountdown((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [armed, countdown])

  async function validateReset() {
    if (!prerequisites || busy) return
    setBusy(true); setError('')
    try {
      // A senha é validada AQUI. Depois disso, a contagem regressiva é a última proteção.
      await reauthenticateCurrentUser(password)
      setArmed(true); setCountdown(5)
    } catch (err) {
      setArmed(false)
      if ((err?.code || '').includes('invalid-credential') || (err?.code || '').includes('wrong-password')) setError('Senha incorreta. O reset não foi liberado.')
      else setError('Não foi possível validar o reset. Nenhum dado foi alterado.')
    } finally { setBusy(false) }
  }

  async function executeReset() {
    if (!armed || countdown > 0 || busy) return
    setBusy(true); setError('')
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(state))
      const next = newSessionState(user.email || null)
      await resetRemoteState(state, next)
      onReset(next)
      onDone()
    } catch (err) {
      setError('O Firebase não confirmou o reset. Por segurança, a sessão atual foi mantida. Verifique a conexão e tente novamente.')
      setArmed(false); setCountdown(5)
    } finally { setBusy(false) }
  }

  return <div className="admin-view reset-view"><div className="reset-warning"><strong>⚠️ Reiniciar abre uma NOVA sessão com 0/81.</strong><p>A sessão atual é preservada automaticamente em backup no Firebase e no navegador. Os registros de auditoria anteriores não são apagados.</p></div><div className="reset-summary"><span>Sessão atual</span><strong>{state.drawnIds.length}<small>/81</small></strong></div><div className="reset-session-line">ID da sessão: <b>{shortSession(state.sessionId)}</b> • Início: <b>{formatDateTime(state.sessionStartedAt)}</b></div><label className="reset-check"><input type="checkbox" checked={ack} onChange={(e) => { setAck(e.target.checked); setArmed(false) }} /><span>Confirmo que desejo encerrar esta sessão de teste/uso e devolver todos os alunos à fila.</span></label><label className="reset-label">Digite <b>{RESET_PHRASE}</b><input value={phrase} onChange={(e) => { setPhrase(e.target.value); setArmed(false) }} placeholder={RESET_PHRASE} autoComplete="off" /></label><label className="reset-label">Confirme novamente a senha de <b>{user.email}</b><input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setArmed(false) }} autoComplete="current-password" placeholder="Senha atual" /></label>{error && <div className="reset-error">{error}</div>}{!armed ? <button className="danger-button" onClick={validateReset} disabled={!prerequisites || busy}>{busy ? 'VALIDANDO…' : 'VALIDAR E ARMAR RESET'}</button> : <div className="reset-armed"><p>{countdown > 0 ? `Senha confirmada. Proteção final: aguarde ${countdown}s…` : 'Reset liberado. A próxima ação cria a nova sessão.'}</p><button className="danger-button final" onClick={executeReset} disabled={countdown > 0 || busy}>{busy ? 'REINICIANDO…' : countdown > 0 ? `AGUARDE ${countdown}s` : 'CONFIRMAR RESET DEFINITIVO'}</button></div>}</div>
}

function Root() {
  const [user, setUser] = useState(undefined)
  useEffect(() => subscribeAuth(setUser), [])
  if (user === undefined) return <LoadingScreen />
  if (!user) return <LoginScreen />
  return <App user={user} />
}

createRoot(document.getElementById('root')).render(<Root />)
