import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { STUDENTS, TEAM_COUNTS } from './students'
import {
  login,
  logout,
  reauthenticateCurrentUser,
  saveRemoteState,
  saveResetBackup,
  subscribeAuth,
  subscribeRemoteState,
} from './firebase'
import './styles.css'

const STORAGE_KEY = 'piaget-gincana-2026-state-v2'
const BACKUP_KEY = 'piaget-gincana-2026-reset-backup-v1'
const RESET_PHRASE = 'RESETAR GINCANA'
const WHEEL = ['AZUL', 'LARANJA', 'AZUL', 'AZUL', 'LARANJA', 'AZUL', 'LARANJA', 'LARANJA']
const cleanState = () => ({ drawnIds: [], history: [], resetAt: null, resetBy: null })

function sanitizeState(value) {
  if (!value || !Array.isArray(value.drawnIds) || !Array.isArray(value.history)) return cleanState()
  const validIds = new Set(STUDENTS.map((s) => s.id))
  const drawnIds = [...new Set(value.drawnIds.filter((id) => validIds.has(id)))]
  const history = value.history.filter((item) => item && validIds.has(item.id))
  return { ...cleanState(), ...value, drawnIds, history }
}

function safeLoad() {
  try {
    return sanitizeState(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'))
  } catch {
    return cleanState()
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

    // Evita alternância perfeita Azul/Laranja por muitos sorteios seguidos.
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

function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(friendlyAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  return <div className="login-screen">
    <form className="login-card" onSubmit={submit}>
      <div className="login-brand"><div className="brand-mark">P</div><div><strong>ESCOLA PIAGET</strong><span>GINCANA 2026</span></div></div>
      <div className="login-kicker">ACESSO INTERNO</div>
      <h1>Painel do sorteio</h1>
      <p>Entre com o mesmo usuário autorizado no Firebase Authentication. O sorteio e o reset ficam bloqueados para quem não estiver autenticado.</p>
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
  const pieces = Array.from({ length: 44 })
  return <div className="confetti" aria-hidden="true">
    {pieces.map((_, i) => <i key={i} style={{ '--x': `${Math.random() * 100}%`, '--d': `${Math.random() * 1.2}s`, '--r': `${Math.random() * 360}deg` }} />)}
  </div>
}

function Wheel({ rotation, spinning }) {
  return <div className="wheel-shell">
    <div className="pointer" />
    <div className={`wheel ${spinning ? 'spinning' : ''}`} style={{ transform: `rotate(${rotation}deg)` }}>
      {WHEEL.map((team, i) => {
        const angle = i * 45
        return <div className={`wheel-label ${team.toLowerCase()}`} key={i} style={{ transform: `rotate(${angle}deg) translateY(-128px) rotate(${-angle}deg)` }}>{team}</div>
      })}
      <div className="wheel-center"><span>PIAGET</span></div>
    </div>
  </div>
}

function ResetModal({ state, user, onClose, onReset }) {
  const [phrase, setPhrase] = useState('')
  const [password, setPassword] = useState('')
  const [ack, setAck] = useState(false)
  const [armed, setArmed] = useState(false)
  const [countdown, setCountdown] = useState(5)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const prerequisites = ack && phrase.trim().toUpperCase() === RESET_PHRASE && password.length > 0

  useEffect(() => {
    if (!armed) return
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [armed, countdown])

  function armReset() {
    if (!prerequisites) return
    setError('')
    setCountdown(5)
    setArmed(true)
  }

  async function executeReset() {
    if (!armed || countdown > 0 || busy) return
    setBusy(true)
    setError('')
    try {
      await reauthenticateCurrentUser(password)
      localStorage.setItem(BACKUP_KEY, JSON.stringify(state))
      await saveResetBackup(state)
      const next = { ...cleanState(), resetAt: new Date().toISOString(), resetBy: user.email || null }
      await saveRemoteState(next)
      onReset(next)
      onClose()
    } catch (err) {
      setArmed(false)
      setCountdown(5)
      if ((err?.code || '').includes('invalid-credential') || (err?.code || '').includes('wrong-password')) setError('Senha incorreta. O reset não foi executado.')
      else setError('Não foi possível confirmar o reset. Nada foi apagado. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="modal-backdrop admin-modal-backdrop">
    <div className="admin-modal">
      <div className="admin-modal-head"><div><span>ÁREA PROTEGIDA</span><h2>Reiniciar sorteio</h2></div><button className="ghost" onClick={onClose} disabled={busy}>Fechar</button></div>
      <div className="reset-warning"><strong>⚠️ Isso devolve todos os 81 alunos para a fila.</strong><p>Antes do reset, o sistema cria automaticamente um backup do estado atual no Firebase e no navegador.</p></div>
      <div className="reset-summary"><span>Sorteados agora</span><strong>{state.drawnIds.length}<small>/81</small></strong></div>
      <label className="reset-check"><input type="checkbox" checked={ack} onChange={(e) => { setAck(e.target.checked); setArmed(false) }} /><span>Entendo que o andamento atual será zerado.</span></label>
      <label className="reset-label">Digite <b>{RESET_PHRASE}</b><input value={phrase} onChange={(e) => { setPhrase(e.target.value); setArmed(false) }} placeholder={RESET_PHRASE} autoComplete="off" /></label>
      <label className="reset-label">Confirme com a senha de <b>{user.email}</b><input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setArmed(false) }} autoComplete="current-password" placeholder="Senha atual" /></label>
      {error && <div className="reset-error">{error}</div>}
      {!armed ? <button className="danger-button" onClick={armReset} disabled={!prerequisites}>VALIDAR RESET</button> :
        <div className="reset-armed">
          <p>{countdown > 0 ? `Proteção final: aguarde ${countdown}s…` : 'Reset liberado. Esta é a última confirmação.'}</p>
          <button className="danger-button final" onClick={executeReset} disabled={countdown > 0 || busy}>{busy ? 'REINICIANDO…' : countdown > 0 ? `AGUARDE ${countdown}s` : 'CONFIRMAR RESET DEFINITIVO'}</button>
        </div>}
    </div>
  </div>
}

function App({ user }) {
  const [persisted, setPersisted] = useState(safeLoad)
  const [phase, setPhase] = useState('idle')
  const [current, setCurrent] = useState(null)
  const [shuffleText, setShuffleText] = useState('')
  const [rotation, setRotation] = useState(0)
  const [listOpen, setListOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [syncStatus, setSyncStatus] = useState('Conectando ao Firebase…')
  const [remoteReady, setRemoteReady] = useState(false)
  const [confetti, setConfetti] = useState(false)
  const shuffleTimer = useRef(null)
  const ignoreSaveOnce = useRef(false)

  const drawnSet = useMemo(() => new Set(persisted.drawnIds), [persisted.drawnIds])
  const undrawn = useMemo(() => STUDENTS.filter((s) => !drawnSet.has(s.id)), [drawnSet])
  const progress = persisted.drawnIds.length
  const done = progress === STUDENTS.length

  useEffect(() => {
    const unsub = subscribeRemoteState((remote) => {
      if (remote) {
        ignoreSaveOnce.current = true
        setPersisted(sanitizeState(remote))
      } else {
        // Documento ainda não existe: inicializa vazio de forma segura.
        const initial = cleanState()
        ignoreSaveOnce.current = true
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
    if (!remoteReady) return
    if (ignoreSaveOnce.current) {
      ignoreSaveOnce.current = false
      return
    }
    setSyncStatus('Salvando…')
    saveRemoteState(persisted)
      .then(() => setSyncStatus('Firebase conectado'))
      .catch(() => setSyncStatus('Falha ao salvar • cópia local preservada'))
  }, [persisted, remoteReady])

  useEffect(() => () => clearInterval(shuffleTimer.current), [])

  useEffect(() => {
    const onKey = (e) => {
      if (resetOpen || listOpen) return
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
    setConfetti(false)
    setCurrent(null)
    setPhase('shuffling')
    const candidate = pickSmartStudent(undrawn, persisted.history)
    let ticks = 0
    clearInterval(shuffleTimer.current)
    shuffleTimer.current = setInterval(() => {
      setShuffleText(randomItem(undrawn).name)
      if (ticks++ % 3 === 0) beep(260 + Math.random() * 170, 0.025, 0.015)
    }, 72)
    setTimeout(() => {
      clearInterval(shuffleTimer.current)
      setShuffleText(candidate.name)
      setCurrent(candidate)
      setPhase('revealed')
      beep(660, 0.11, 0.035)
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
      const entry = { id: current.id, at: new Date().toISOString() }
      setPersisted((prev) => ({ ...prev, drawnIds: [...prev.drawnIds, current.id], history: [...prev.history, entry] }))
      setPhase('result')
      setConfetti(true)
      beep(current.team === 'AZUL' ? 520 : 620, 0.15, 0.05)
      setTimeout(() => beep(current.team === 'AZUL' ? 780 : 880, 0.16, 0.04), 170)
    }, 4750)
  }

  function applyReset(next) {
    ignoreSaveOnce.current = true
    setPersisted(sanitizeState(next))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setPhase('idle')
    setCurrent(null)
    setRotation(0)
    setConfetti(false)
    setSyncStatus('Firebase conectado')
  }

  const teamResult = current?.team

  return <div className={`app ${phase === 'result' ? `result-${teamResult?.toLowerCase()}` : ''}`}>
    <Confetti active={confetti} />
    <header>
      <div className="brand"><div className="brand-mark">P</div><div><strong>ESCOLA PIAGET</strong><span>GINCANA 2026</span></div></div>
      <div className="top-actions">
        <span className={`connection ${remoteReady ? 'online' : ''}`}>{syncStatus}</span>
        <button className="ghost" onClick={() => setListOpen(true)}>Equipes</button>
        <button className="ghost" onClick={toggleFullscreen}>Tela cheia</button>
        <div className="account-menu"><span>{user.email}</span><button onClick={() => logout()}>Sair</button></div>
      </div>
    </header>

    <main>
      <section className="stage">
        <div className="eyebrow">SORTEIO DAS EQUIPES • FUNDAMENTAL II</div>

        {(phase === 'idle' || (phase === 'result' && !current)) && !done && <div className="hero">
          <div className="orb"><span>{progress + 1}</span><small>PRÓXIMO</small></div>
          <h1>Quem será chamado agora?</h1>
          <p>A ordem é escolhida entre os participantes ainda não chamados, com variação para evitar sequências muito repetitivas.</p>
          <button className="primary" onClick={startStudentDraw}>CHAMAR PRÓXIMO ALUNO</button>
        </div>}

        {phase === 'shuffling' && <div className="shuffle"><span className="scanline" /><div className="shuffle-kicker">ESCOLHENDO O PRÓXIMO PARTICIPANTE</div><div className="shuffle-name">{shuffleText}</div><div className="shuffle-dots"><i /><i /><i /></div></div>}

        {phase === 'revealed' && current && <div className="reveal-layout">
          <div className="student-card"><span>PARTICIPANTE SELECIONADO</span><h1>{current.name}</h1><strong>{current.grade}</strong><p>Agora é hora de descobrir a equipe.</p><button className="primary" onClick={spinWheel}>GIRAR A ROLETA</button></div>
          <Wheel rotation={rotation} spinning={false} />
        </div>}

        {phase === 'spinning' && current && <div className="reveal-layout">
          <div className="student-card compact"><span>SORTEANDO EQUIPE PARA</span><h2>{current.name}</h2><strong>{current.grade}</strong><p className="suspense">A roleta está girando…</p></div>
          <Wheel rotation={rotation} spinning />
        </div>}

        {phase === 'result' && current && <div className="result-card">
          <div className="result-badge">RESULTADO</div><h2>{current.name}</h2><span>{current.grade}</span><div className={`team-title ${current.team.toLowerCase()}`}>EQUIPE {current.team}</div>
          {!done ? <button className="primary" onClick={startStudentDraw}>PRÓXIMO ALUNO</button> : <button className="primary" onClick={() => setListOpen(true)}>VER EQUIPES FINAIS</button>}
        </div>}

        {done && phase !== 'result' && <div className="hero"><h1>Equipes formadas!</h1><p>Os 81 participantes foram chamados.</p><button className="primary" onClick={() => setListOpen(true)}>VER LISTA FINAL</button></div>}
      </section>

      <aside className="panel">
        <div className="progress-card"><div><span>PROGRESSO</span><strong>{progress}<small>/81</small></strong></div><div className="progress-bar"><i style={{ width: `${(progress / 81) * 100}%` }} /></div></div>
        <div className="stats"><div><span>🔵</span><strong>{TEAM_COUNTS.AZUL}</strong><small>Equipe Azul</small></div><div><span>🟠</span><strong>{TEAM_COUNTS.LARANJA}</strong><small>Equipe Laranja</small></div></div>
        <div className="recent"><h3>Últimos chamados</h3>{persisted.history.slice(-5).reverse().map((h) => { const s = STUDENTS.find((x) => x.id === h.id); return s ? <div className="recent-row" key={`${h.id}-${h.at}`}><i className={s.team.toLowerCase()} /><span>{s.name}</span><small>{s.grade}</small></div> : null })}{!persisted.history.length && <p>Nenhum aluno chamado ainda.</p>}</div>
        <div className="hint">Atalhos: <kbd>Espaço</kbd> avançar • <kbd>F</kbd> tela cheia</div>
        <button className="danger-link" onClick={() => setResetOpen(true)}>Área protegida • Reiniciar sorteio</button>
      </aside>
    </main>

    {listOpen && <OfficialList onClose={() => setListOpen(false)} />}
    {resetOpen && <ResetModal state={persisted} user={user} onClose={() => setResetOpen(false)} onReset={applyReset} />}
  </div>
}

function OfficialList({ onClose }) {
  const grades = ['6º Ano', '7º Ano', '8º Ano', '9º Ano']
  return <div className="modal-backdrop"><div className="modal">
    <div className="modal-head"><div><span>GINCANA 2026</span><h2>Divisão oficial das equipes</h2></div><div className="modal-actions"><button onClick={() => window.print()}>Imprimir</button><button onClick={onClose}>Fechar</button></div></div>
    <div className="print-title"><strong>ESCOLA PIAGET</strong><span>GINCANA 2026 — DIVISÃO VALIDADA</span></div>
    <div className="team-columns">{['AZUL', 'LARANJA'].map((team) => <section className={`team-list ${team.toLowerCase()}`} key={team}><h3>EQUIPE {team} <small>{TEAM_COUNTS[team]} alunos</small></h3>{grades.map((grade) => { const list = STUDENTS.filter((s) => s.team === team && s.grade === grade); return <div className="grade-list" key={grade}><h4>{grade} <small>{list.length}</small></h4><ol>{list.map((s) => <li key={s.id}>{s.name}</li>)}</ol></div> })}</section>)}</div>
  </div></div>
}

function Root() {
  const [user, setUser] = useState(undefined)
  useEffect(() => subscribeAuth(setUser), [])
  if (user === undefined) return <LoadingScreen />
  if (!user) return <LoginScreen />
  return <App user={user} />
}

createRoot(document.getElementById('root')).render(<Root />)
