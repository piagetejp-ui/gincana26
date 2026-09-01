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

function openPrintDocument({ title, subtitle, meta, body }) {
  const popup = window.open('', '_blank', 'noopener,noreferrer')
  if (!popup) {
    alert('O navegador bloqueou a janela de impressão. Autorize pop-ups para este site e tente novamente.')
    return
  }
  popup.document.open()
  popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page{size:A4 portrait;margin:13mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#172033;margin:0;font-size:10.5px}.header{border-bottom:3px solid #1f5eb8;padding-bottom:10px;margin-bottom:13px}.brand{display:flex;justify-content:space-between;gap:16px;align-items:flex-end}.brand h1{font-size:18px;margin:0;color:#164f9d}.brand strong{font-size:11px;letter-spacing:.08em}.subtitle{margin-top:4px;font-size:12px;font-weight:700}.meta{display:grid;grid-template-columns:repeat(2,1fr);gap:5px 18px;background:#f3f6fa;border:1px solid #d9e1eb;padding:9px 10px;margin:12px 0}.meta div{display:flex;justify-content:space-between;gap:10px}.meta b{color:#33445d}.status{display:inline-block;padding:4px 8px;border:1px solid #b9c7da;background:#f6f8fb;border-radius:20px;font-weight:700}.team-head{margin:16px 0 7px;padding:8px 10px;color:#fff;font-size:13px}.team-head.azul{background:#155bc4}.team-head.laranja{background:#df7414}table{width:100%;border-collapse:collapse;margin-bottom:14px}th,td{border:1px solid #cfd8e5;padding:6px 7px;text-align:left;vertical-align:top}th{background:#edf2f8;font-size:9px;text-transform:uppercase;letter-spacing:.04em}td.num,th.num{width:48px;text-align:center}td.time,th.time{width:78px;text-align:center}td.grade,th.grade{width:72px}td.team,th.team{width:76px;font-weight:700}.foot{margin-top:15px;border-top:1px solid #cfd8e5;padding-top:8px;color:#66758b;font-size:9px}.empty{padding:24px;border:1px dashed #bdc9d8;text-align:center;color:#65758c}.sign{display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:38px}.sign div{border-top:1px solid #555;text-align:center;padding-top:5px;font-size:9px}@media print{.no-print{display:none!important}}
  </style></head><body><div class="header"><div class="brand"><div><strong>ESCOLA PIAGET</strong><h1>${escapeHtml(title)}</h1></div><span>GINCANA 2026</span></div><div class="subtitle">${escapeHtml(subtitle)}</div></div><div class="meta">${meta.map(([k,v]) => `<div><b>${escapeHtml(k)}</b><span>${escapeHtml(v)}</span></div>`).join('')}</div>${body}<div class="foot">Documento emitido pelo Sistema da Gincana 2026 da Escola Piaget em ${escapeHtml(formatDateTime(new Date().toISOString()))}. Os horários registrados correspondem ao dispositivo utilizado na operação; cada sorteio também é registrado no Firebase da sessão.</div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250))<\/script></body></html>`)
  popup.document.close()
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
        {phase === 'result' && current && <div className="result-card"><div className="result-badge">RESULTADO • #{progress}</div><h2>{current.name}</h2><span>{current.grade}</span><div className={`team-title ${current.team.toLowerCase()}`}>EQUIPE {current.team}</div>{!done ? <button className="primary" onClick={startStudentDraw}>PRÓXIMO ALUNO</button> : <button className="primary" onClick={() => setAdminOpen(true)}>ABRIR ÁREA PROTEGIDA</button>}</div>}
        {done && phase !== 'result' && <div className="hero"><h1>Sorteio concluído!</h1><p>Os 81 participantes foram chamados. Os relatórios oficiais estão na área protegida.</p><button className="primary" onClick={() => setAdminOpen(true)}>ABRIR ÁREA PROTEGIDA</button></div>}
      </section>

      <aside className="panel"><div className="progress-card"><div><span>PROGRESSO</span><strong>{progress}<small>/81</small></strong></div><div className="progress-bar"><i style={{ width: `${(progress / 81) * 100}%` }} /></div></div><div className="stats"><div><span>👥</span><strong>{STUDENTS.length}</strong><small>Participantes</small></div><div><span>⏳</span><strong>{STUDENTS.length - progress}</strong><small>Restantes</small></div></div><div className="recent"><h3>Últimos chamados</h3>{persisted.history.slice(-5).reverse().map((h) => <div className="recent-row" key={`${h.id}-${h.drawNumber}`}><i className={h.team.toLowerCase()} /><span>{h.name}</span><small>{h.grade}</small></div>)}{!persisted.history.length && <p>Nenhum aluno chamado ainda.</p>}</div><div className="hint">Atalhos: <kbd>Espaço</kbd> avançar • <kbd>F</kbd> tela cheia</div><button className="danger-link" onClick={() => setAdminOpen(true)}>🔒 Área protegida</button></aside>
    </main>

    {adminOpen && <ProtectedArea state={persisted} user={user} onClose={() => setAdminOpen(false)} onReset={applyReset} />}
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
    const body = rows.length ? `<table><thead><tr><th class="num">Nº</th><th class="time">Horário</th><th>Aluno</th><th class="grade">Turma</th><th class="team">Equipe</th></tr></thead><tbody>${rows.map((h) => `<tr><td class="num">${h.drawNumber}</td><td class="time">${escapeHtml(formatTime(h.at))}</td><td>${escapeHtml(h.name)}</td><td class="grade">${escapeHtml(h.grade)}</td><td class="team">${escapeHtml(h.team)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nenhum sorteio registrado nesta sessão.</div>'
    openPrintDocument({ title: 'RELATÓRIO DE AUDITORIA DO SORTEIO', subtitle: 'Registro cronológico oficial da sessão', meta: [['Sessão', shortSession(state.sessionId)], ['Início da sessão', formatDateTime(state.sessionStartedAt)], ['Registros', `${rows.length} de ${STUDENTS.length}`], ['Status', rows.length === STUDENTS.length ? 'CONCLUÍDO' : 'PARCIAL']], body })
  }
  return <div className="admin-view"><div className="report-toolbar"><div><span>REGISTRO CRONOLÓGICO</span><strong>{rows.length} sorteios registrados</strong></div><button className="primary small" onClick={print}>IMPRIMIR / SALVAR PDF</button></div><div className="report-meta"><span>Sessão <b>{shortSession(state.sessionId)}</b></span><span>Início <b>{formatDateTime(state.sessionStartedAt)}</b></span><span>Status <b>{rows.length === STUDENTS.length ? 'CONCLUÍDO' : 'PARCIAL'}</b></span></div><div className="table-wrap"><table className="admin-table"><thead><tr><th>#</th><th>Horário</th><th>Aluno</th><th>Turma</th><th>Equipe</th></tr></thead><tbody>{rows.map((h) => <tr key={`${h.sessionId}-${h.drawNumber}`}><td>{h.drawNumber}</td><td>{formatTime(h.at)}</td><td>{h.name}</td><td>{h.grade}</td><td><span className={`team-pill ${h.team.toLowerCase()}`}>{h.team}</span></td></tr>)}{!rows.length && <tr><td colSpan="5" className="empty-cell">Nenhum sorteio registrado nesta sessão.</td></tr>}</tbody></table></div></div>
}

function ResultView({ state }) {
  const teams = ['AZUL', 'LARANJA']
  const grouped = Object.fromEntries(teams.map((team) => [team, state.history.filter((h) => h.team === team)]))
  function print() {
    const body = teams.map((team) => `<div class="team-head ${team.toLowerCase()}">EQUIPE ${team} — ${grouped[team].length} integrante${grouped[team].length === 1 ? '' : 's'}</div>${grouped[team].length ? `<table><thead><tr><th class="num">Ordem equipe</th><th class="num">Ordem geral</th><th class="time">Horário</th><th>Aluno</th><th class="grade">Turma</th></tr></thead><tbody>${grouped[team].map((h, i) => `<tr><td class="num">${i + 1}</td><td class="num">${h.drawNumber}</td><td class="time">${escapeHtml(formatTime(h.at))}</td><td>${escapeHtml(h.name)}</td><td class="grade">${escapeHtml(h.grade)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nenhum integrante sorteado para esta equipe nesta sessão.</div>'}`).join('')
    openPrintDocument({ title: 'RESULTADO OFICIAL DO SORTEIO', subtitle: state.history.length === STUDENTS.length ? 'Composição final das equipes por ordem de sorteio' : 'Composição parcial das equipes por ordem de sorteio', meta: [['Sessão', shortSession(state.sessionId)], ['Início da sessão', formatDateTime(state.sessionStartedAt)], ['Sorteados', `${state.history.length} de ${STUDENTS.length}`], ['Status', state.history.length === STUDENTS.length ? 'CONCLUÍDO' : 'PARCIAL']], body })
  }
  return <div className="admin-view"><div className="report-toolbar"><div><span>RESULTADO DA SESSÃO</span><strong>{state.history.length === STUDENTS.length ? 'Resultado concluído' : `Resultado parcial • ${state.history.length}/81`}</strong></div><button className="primary small" onClick={print}>IMPRIMIR / SALVAR PDF</button></div><div className="result-summary"><div className="azul"><span>Equipe Azul</span><strong>{grouped.AZUL.length}</strong></div><div className="laranja"><span>Equipe Laranja</span><strong>{grouped.LARANJA.length}</strong></div></div><div className="result-tables">{teams.map((team) => <section key={team} className={`result-team ${team.toLowerCase()}`}><h3>EQUIPE {team}<small>{grouped[team].length}</small></h3><div className="table-wrap"><table className="admin-table"><thead><tr><th>Na equipe</th><th>Geral</th><th>Horário</th><th>Aluno</th><th>Turma</th></tr></thead><tbody>{grouped[team].map((h, i) => <tr key={`${team}-${h.drawNumber}`}><td>{i + 1}</td><td>{h.drawNumber}</td><td>{formatTime(h.at)}</td><td>{h.name}</td><td>{h.grade}</td></tr>)}{!grouped[team].length && <tr><td colSpan="5" className="empty-cell">Ainda sem integrantes sorteados.</td></tr>}</tbody></table></div></section>)}</div></div>
}

function DivisionView() {
  const grades = ['6º Ano', '7º Ano', '8º Ano', '9º Ano']
  function print() {
    const body = ['AZUL', 'LARANJA'].map((team) => `<div class="team-head ${team.toLowerCase()}">EQUIPE ${team} — ${TEAM_COUNTS[team]} alunos</div>${grades.map((grade) => { const list = STUDENTS.filter((s) => s.team === team && s.grade === grade); return `<table><thead><tr><th colspan="2">${escapeHtml(grade)} — ${list.length}</th></tr></thead><tbody>${list.map((s, i) => `<tr><td class="num">${i + 1}</td><td>${escapeHtml(s.name)}</td></tr>`).join('')}</tbody></table>` }).join('')}`).join('')
    openPrintDocument({ title: 'DIVISÃO OFICIAL CADASTRADA', subtitle: 'Relação-base restrita da Gincana 2026', meta: [['Participantes', '81'], ['Equipe Azul', '41'], ['Equipe Laranja', '40'], ['Acesso', 'ÁREA PROTEGIDA']], body })
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
