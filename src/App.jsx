import React, { useEffect, useMemo, useState } from 'react'
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth'
import { collection, onSnapshot } from 'firebase/firestore'
import { QRCodeSVG } from 'qrcode.react'
import { jsPDF } from 'jspdf'
import { auth, db } from './firebase.js'
import { STUDENTS, STUDENT_PRICE, GRADES } from '../data/students.js'

const EVENT = {
  title: 'Gincana Piaget 2026',
  theme: 'Um Mundo de Culturas: raízes que nos unem, saberes que transformam!',
  date: '10/10/2026',
  location: 'Clube ARJOB',
  schedule: [
    ['07h00', 'Abertura dos portões'],
    ['08h30', 'Início oficial das atividades'],
    ['12h00', 'Pausa para o almoço'],
    ['13h30', 'Retorno com provas esportivas'],
    ['15h00', 'Momento de lazer e recreação'],
    ['16h00', 'Encerramento']
  ]
}

const GUIDE_ITEMS = [
  {
    emoji: '🍔',
    title: 'Alimentação',
    text: 'Haverá venda de refrigerantes, salgados, bombons e lanches rápidos. Não haverá venda de almoço; cada participante deverá levar o seu.',
    light: '#FFF3E5',
    accent: '#EF7F1A'
  },
  {
    emoji: '🏊',
    title: 'Recreação com piscina',
    text: 'Leve roupa de banho, toalha e protetor solar para o momento de lazer e atividades aquáticas.',
    light: '#E8F4FF',
    accent: '#1C7AE8'
  },
  {
    emoji: '🪑',
    title: 'Estrutura',
    text: 'O espaço possui mesas e cadeiras em quantidade limitada. Recomendamos chegar cedo.',
    light: '#F3F6FB',
    accent: '#46627E'
  },
  {
    emoji: '💧',
    title: 'Conforto',
    text: 'Leve água, cooler ou garrafa térmica com suas bebidas e os itens pessoais necessários para o dia.',
    light: '#EAF8F6',
    accent: '#1D9B84'
  }
]

const money = cents => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const fmtDate = value => {
  if (!value) return '—'
  const date = value?.toDate ? value.toDate() : new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR')
}

function Logo() {
  return <img className="logo" src="/logo-piaget.png" alt="Escola Piaget" />
}

function TeamBadge({ team }) {
  return <span className={`team-badge ${team === 'AZUL' ? 'blue' : 'orange'}`}>{team === 'AZUL' ? 'Equipe Azul' : 'Equipe Laranja'}</span>
}

function StudentPicker({ selected, onAdd, compact = false }) {
  const [grade, setGrade] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const options = useMemo(() => {
    if (!grade || !query.trim()) return []
    const q = normalize(query.trim())
    return STUDENTS.filter(s => s.grade === grade && !selected.some(x => x.id === s.id) && normalize(s.name).includes(q)).slice(0, 8)
  }, [grade, query, selected])

  const choose = student => {
    onAdd(student)
    setQuery('')
    setOpen(false)
  }

  const keyDown = event => {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (options.length === 1) choose(options[0])
      else if (options.length > 1) setOpen(true)
    }
  }

  return (
    <div className={`picker ${compact ? 'compact' : ''}`}>
      <div className="field">
        <label>Turma</label>
        <select value={grade} onChange={e => { setGrade(e.target.value); setQuery(''); setOpen(false) }}>
          <option value="">Selecione a turma</option>
          {GRADES.map(g => <option key={g}>{g}</option>)}
        </select>
      </div>
      <div className="field search-field">
        <label>Nome do aluno</label>
        <input
          value={query}
          disabled={!grade}
          placeholder={grade ? 'Comece a digitar o nome...' : 'Escolha a turma primeiro'}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={keyDown}
          autoComplete="off"
        />
        {open && options.length > 0 && (
          <div className="suggestions">
            {options.map(student => (
              <button type="button" key={student.id} onClick={() => choose(student)}>
                <strong>{student.name}</strong><span>{student.grade}</span>
              </button>
            ))}
          </div>
        )}
        {open && grade && query.trim() && options.length === 0 && <div className="suggestions empty">Nenhum aluno encontrado nessa turma.</div>}
      </div>
    </div>
  )
}

function SelectedStudents({ students, onRemove }) {
  if (!students.length) return null
  return (
    <div className="selected-list">
      {students.map((student, index) => (
        <div className="selected-student" key={student.id}>
          <div className="selected-number">{index + 1}</div>
          <div className="selected-main">
            <strong>{student.name}</strong>
            <div className="muted-row"><span>{student.grade}</span><TeamBadge team={student.team} /></div>
          </div>
          <div className="selected-price">{money(STUDENT_PRICE)}</div>
          {onRemove && <button className="icon-button" type="button" onClick={() => onRemove(student.id)} aria-label="Remover aluno">×</button>}
        </div>
      ))}
    </div>
  )
}

function EventInfo() {
  return (
    <>
      <section className="hero">
        <div className="hero-content">
          <Logo />
          <div className="eyebrow">6º ao 9º ano • Escola Piaget</div>
          <h1>{EVENT.title}</h1>
          <p className="theme">“{EVENT.theme}”</p>
          <p className="hero-text">Um dia de integração, diversão, espírito de equipe, cultura e competição saudável.</p>
          <div className="hero-facts">
            <div><span>Data</span><strong>{EVENT.date}</strong></div>
            <div><span>Local</span><strong>{EVENT.location}</strong></div>
            <div><span>Participação</span><strong>{money(STUDENT_PRICE)} por aluno</strong></div>
          </div>
          <a className="primary button-link" href="#confirmar">Confirmar participação</a>
        </div>
      </section>

      <section className="section info-section">
        <div className="section-heading"><span>Programação</span><h2>Um dia inteiro de Gincana</h2></div>
        <div className="timeline">
          {EVENT.schedule.map(([time, text]) => <div key={time} className="timeline-item"><strong>{time}</strong><span>{text}</span></div>)}
        </div>
      </section>

      <section className="section guidance-grid">
        {GUIDE_ITEMS.map(item => (
          <article className="info-card" key={item.title}>
            <div className="info-icon">{item.emoji}</div>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </section>
    </>
  )
}

function PublicApp() {
  const [students, setStudents] = useState([])
  const [responsibleName, setResponsibleName] = useState('')
  const [responsiblePhone, setResponsiblePhone] = useState('')
  const [responsibleEmail, setResponsibleEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const add = student => { if (!students.some(s => s.id === student.id)) setStudents(v => [...v, student]) }
  const remove = id => setStudents(v => v.filter(s => s.id !== id))
  const total = students.length * STUDENT_PRICE

  const pay = async () => {
    setError('')
    if (!students.length) return setError('Adicione pelo menos um aluno.')
    if (responsibleName.trim().length < 3) return setError('Informe o nome do responsável.')
    if (responsiblePhone.replace(/\D/g, '').length < 10) return setError('Informe um WhatsApp válido.')
    setLoading(true)
    try {
      const response = await fetch('/api/create-checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: students.map(s => s.id), responsibleName, responsiblePhone, responsibleEmail })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível iniciar o pagamento')
      window.location.href = data.checkoutUrl
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <main>
      <EventInfo />
      <section id="confirmar" className="section confirm-section">
        <div className="section-heading"><span>Confirmação</span><h2>Confirme a participação do aluno</h2><p>Escolha a turma, procure o nome e, se precisar, adicione irmãos no mesmo pagamento.</p></div>
        <div className="checkout-card">
          <StudentPicker selected={students} onAdd={add} />
          <SelectedStudents students={students} onRemove={remove} />
          {students.length > 0 && <div className="add-another"><span>Tem outro aluno?</span><strong>Use os campos acima para adicionar outro participante.</strong></div>}

          <div className="responsible-grid">
            <div className="field"><label>Nome do responsável</label><input value={responsibleName} onChange={e => setResponsibleName(e.target.value)} placeholder="Nome completo" /></div>
            <div className="field"><label>WhatsApp</label><input value={responsiblePhone} onChange={e => setResponsiblePhone(e.target.value)} placeholder="(86) 99999-9999" inputMode="tel" /></div>
            <div className="field full"><label>E-mail <span className="optional">(opcional)</span></label><input value={responsibleEmail} onChange={e => setResponsibleEmail(e.target.value)} placeholder="seuemail@exemplo.com" type="email" /></div>
          </div>

          <div className="payment-summary">
            <div><span>{students.length || 0} aluno{students.length === 1 ? '' : 's'}</span><strong>{money(total)}</strong></div>
            <p>Pagamento seguro pela InfinitePay. Pix ou cartão de crédito, com parcelamento disponível no checkout.</p>
          </div>
          {error && <div className="alert error">{error}</div>}
          <button className="primary wide mobile-large-button" onClick={pay} disabled={loading || !students.length}>{loading ? 'Preparando pagamento...' : `Pagar ${money(total)}`}</button>
          <p className="secure-note">🔒 A confirmação só é concluída após a validação do pagamento.</p>
        </div>
      </section>
      <footer><Logo /><p>Escola Piaget • (86) 9 9462-5073 • piaget.ejp@gmail.com</p><a href="/admin">Acesso da secretaria</a></footer>
      {students.length > 0 && <div className="mobile-float-bar"><div><strong>{students.length} aluno{students.length === 1 ? '' : 's'}</strong><span>{money(total)}</span></div><a className="primary button-link" href="#confirmar">Continuar</a></div>}
    </main>
  )
}

async function imageToDataUrl(url) {
  const response = await fetch(url)
  const blob = await response.blob()
  return await new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.readAsDataURL(blob)
  })
}

async function makeEmojiBadge(emoji, background = '#FFF3E5') {
  const canvas = document.createElement('canvas')
  canvas.width = 120
  canvas.height = 120
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = background
  ctx.beginPath()
  ctx.arc(60, 60, 54, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = '58px Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji, 60, 63)
  return canvas.toDataURL('image/png')
}

function drawWrappedText(doc, text, x, y, width, lineHeight = 4.7) {
  const lines = doc.splitTextToSize(text, width)
  doc.text(lines, x, y)
  return y + (lines.length * lineHeight)
}

async function generateOrientationPdf(order) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let logo = null
  try { logo = await imageToDataUrl('/logo-piaget.png') } catch {}

  if (logo) doc.addImage(logo, 'PNG', 18, 12, 46, 13)

  doc.setFillColor(11, 79, 162)
  doc.roundedRect(18, 30, 174, 28, 4, 4, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.text('Participação confirmada!', 24, 41)
  doc.setFontSize(10.5)
  const subtitle = doc.splitTextToSize(`Gincana Piaget 2026 • ${EVENT.theme}`, 160)
  doc.text(subtitle, 24, 48)

  let y = 67
  doc.setDrawColor(224, 231, 239)
  doc.setFillColor(247, 250, 253)
  doc.roundedRect(18, y, 174, 30, 4, 4, 'FD')
  doc.setTextColor(23, 37, 54)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Resumo da confirmação', 24, y + 8)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.8)
  doc.text(`Responsável: ${order.responsibleName || '—'}`, 24, y + 16)
  doc.text(`Data da Gincana: ${EVENT.date}`, 24, y + 23)
  doc.text(`Local: ${EVENT.location}`, 95, y + 16)
  doc.text(`Valor pago: ${money(order.total)}`, 95, y + 23)
  y += 40

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(16, 58, 105)
  doc.setFontSize(13)
  doc.text('Alunos confirmados', 18, y)
  y += 8

  doc.setFontSize(9.5)
  for (let i = 0; i < order.students.length; i++) {
    const student = order.students[i]
    if (y > 244) {
      doc.addPage()
      y = 20
    }
    doc.setFillColor(i % 2 ? 250 : 244, 247, 251)
    doc.roundedRect(18, y - 4.5, 174, 12, 2.5, 2.5, 'F')
    doc.setTextColor(23, 37, 54)
    doc.setFont('helvetica', 'bold')
    doc.text(`${i + 1}. ${student.name}`, 22, y + 0.5)
    doc.setFont('helvetica', 'normal')
    doc.text(`${student.grade} • Equipe ${student.team === 'AZUL' ? 'Azul' : 'Laranja'}`, 22, y + 6)
    y += 14
  }

  y += 3
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(16, 58, 105)
  doc.setFontSize(13)
  doc.text('Programação do dia', 18, y)
  y += 7
  doc.setFontSize(9.5)
  EVENT.schedule.forEach(([time, text]) => {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(11, 79, 162)
    doc.text(time, 18, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(37, 51, 66)
    doc.text(text, 38, y)
    y += 6
  })

  doc.addPage()
  if (logo) doc.addImage(logo, 'PNG', 18, 12, 44, 12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(16, 58, 105)
  doc.setFontSize(18)
  doc.text('Informações importantes', 18, 32)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(84, 98, 114)
  doc.setFontSize(10)
  doc.text('Salve este PDF no celular para consultar as orientações quando precisar.', 18, 39)

  const cardWidth = 83
  const cardHeight = 56
  const positions = [
    [18, 49],
    [109, 49],
    [18, 112],
    [109, 112]
  ]

  for (let i = 0; i < GUIDE_ITEMS.length; i++) {
    const item = GUIDE_ITEMS[i]
    const [x, top] = positions[i]
    const emojiBadge = await makeEmojiBadge(item.emoji, item.light)
    doc.setDrawColor(224, 231, 239)
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(x, top, cardWidth, cardHeight, 4, 4, 'FD')
    doc.addImage(emojiBadge, 'PNG', x + 4, top + 4, 16, 16)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(23, 37, 54)
    doc.setFontSize(11)
    doc.text(item.title, x + 22, top + 11)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(92, 107, 123)
    doc.setFontSize(8.8)
    drawWrappedText(doc, item.text, x + 6, top + 25, cardWidth - 12, 4.1)
  }

  doc.setFillColor(244, 247, 251)
  doc.roundedRect(18, 177, 174, 50, 4, 4, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(16, 58, 105)
  doc.setFontSize(12)
  doc.text('Lembretes finais', 24, 188)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.6)
  doc.setTextColor(73, 89, 104)
  let noteY = 197
  noteY = drawWrappedText(doc, '• Chegue cedo para aproveitar melhor a estrutura e garantir mais conforto para o aluno.', 24, noteY, 160, 4.7) + 2
  noteY = drawWrappedText(doc, '• Em caso de dúvida, a Escola Piaget está disponível pelo WhatsApp (86) 9 9462-5073.', 24, noteY, 160, 4.7) + 2
  drawWrappedText(doc, '• Este documento serve como confirmação informativa da participação e pode ser salvo offline no celular.', 24, noteY, 160, 4.7)

  doc.setDrawColor(220)
  doc.line(18, 278, 192, 278)
  doc.setFontSize(8.5)
  doc.setTextColor(95)
  doc.text('Escola Piaget • (86) 9 9462-5073 • piaget.ejp@gmail.com', 18, 285)
  doc.save(`Gincana-Piaget-2026-${order.students[0]?.name?.split(' ')[0] || 'confirmacao'}.pdf`)
}

function ReturnApp() {
  const params = new URLSearchParams(window.location.search)
  const [status, setStatus] = useState('checking')
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')

  const verify = async () => {
    setStatus('checking'); setError('')
    const payload = {
      order_nsu: params.get('order_nsu'), transaction_nsu: params.get('transaction_nsu'), slug: params.get('slug'),
      receipt_url: params.get('receipt_url'), capture_method: params.get('capture_method')
    }
    try {
      const response = await fetch('/api/verify-payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Falha ao verificar pagamento')
      setOrder(data)
      setStatus(data.status === 'paid' ? 'paid' : data.status === 'paid_conflict' ? 'conflict' : 'pending')
    } catch (e) { setError(e.message); setStatus('error') }
  }

  useEffect(() => { verify() }, [])

  return (
    <main className="return-page">
      <div className="return-card">
        <Logo />
        {status === 'checking' && <><div className="spinner"/><h1>Confirmando seu pagamento...</h1><p>Aguarde alguns segundos.</p></>}
        {status === 'paid' && order && <>
          <div className="success-icon">✓</div><h1>Participação confirmada!</h1><p>O pagamento foi validado e a participação já consta no sistema da Escola Piaget.</p>
          <SelectedStudents students={order.students || []} />
          <div className="receipt-box"><div><span>Valor confirmado</span><strong>{money(order.total)}</strong></div><div><span>Forma de pagamento</span><strong>{order.captureMethod === 'pix' ? 'Pix' : order.captureMethod === 'credit_card' ? 'Cartão de crédito' : 'Pagamento confirmado'}</strong></div></div>
          <div className="return-actions"><button className="primary" onClick={() => generateOrientationPdf(order)}>Baixar orientações em PDF</button>{order.receiptUrl && <a className="secondary button-link" href={order.receiptUrl} target="_blank" rel="noreferrer">Ver comprovante</a>}</div>
          <a href="/" className="text-link">Voltar à página da Gincana</a>
        </>}
        {status === 'pending' && <><div className="pending-icon">⌛</div><h1>Pagamento em confirmação</h1><p>Se você já concluiu o pagamento, aguarde alguns instantes e verifique novamente.</p><button className="primary" onClick={verify}>Verificar novamente</button></>}
        {status === 'conflict' && <><div className="warning-icon">!</div><h1>Pagamento recebido para conferência</h1><p>O pagamento chegou, mas encontramos outra confirmação para um dos alunos. A secretaria fará a conferência do registro.</p><p><strong>Entre em contato: (86) 9 9462-5073</strong></p></>}
        {status === 'error' && <><div className="warning-icon">!</div><h1>Não conseguimos verificar agora</h1><p>{error}</p><button className="primary" onClick={verify}>Tentar novamente</button></>}
      </div>
    </main>
  )
}

function Login({ onUser }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const login = async e => {
    e.preventDefault(); setLoading(true); setError('')
    try { const result = await signInWithEmailAndPassword(auth, email, password); onUser(result.user) }
    catch { setError('E-mail ou senha inválidos.') }
    finally { setLoading(false) }
  }
  return <main className="login-page"><form className="login-card" onSubmit={login}><Logo/><div className="eyebrow">Área da Secretaria</div><h1>Gincana Piaget 2026</h1><div className="field"><label>E-mail</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></div><div className="field"><label>Senha</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></div>{error&&<div className="alert error">{error}</div>}<button className="primary wide" disabled={loading}>{loading?'Entrando...':'Entrar'}</button></form></main>
}

const methodLabel = value => ({ cash:'Dinheiro', external_pix:'Pix externo', card_machine:'Cartão na maquininha', other:'Outro', pix:'Pix', credit_card:'Cartão online' }[value] || value || '—')
const originLabel = value => ({ online:'Online', secretaria_infinitepay:'Secretaria • InfinitePay', secretaria_manual:'Secretaria • Presencial' }[value] || value || '—')

function AdminSale({ user, afterSave }) {
  const [students, setStudents] = useState([])
  const [responsibleName, setResponsibleName] = useState('')
  const [responsiblePhone, setResponsiblePhone] = useState('')
  const [mode, setMode] = useState('cash')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [checkoutUrl, setCheckoutUrl] = useState('')
  const add = s => !students.some(x=>x.id===s.id) && setStudents(v=>[...v,s])
  const clear = () => { setStudents([]); setResponsibleName(''); setResponsiblePhone(''); setNote(''); setCheckoutUrl('') }

  const submit = async () => {
    setMessage(null); setCheckoutUrl('')
    if (!students.length) return setMessage({type:'error', text:'Selecione pelo menos um aluno.'})
    if (responsibleName.trim().length < 3) return setMessage({type:'error', text:'Informe o responsável.'})
    setLoading(true)
    try {
      const token = await user.getIdToken()
      const endpoint = mode === 'infinitepay' ? '/api/create-checkout' : '/api/manual-sale'
      const body = mode === 'infinitepay'
        ? { studentIds: students.map(s=>s.id), responsibleName, responsiblePhone }
        : { studentIds: students.map(s=>s.id), responsibleName, responsiblePhone, paymentMethod: mode, note }
      const response = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`}, body:JSON.stringify(body) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível concluir')
      if (mode === 'infinitepay') { setCheckoutUrl(data.checkoutUrl); setMessage({type:'success', text:'Checkout gerado. Abra ou mostre o QR Code ao responsável.'}) }
      else { setMessage({type:'success', text:`Confirmação presencial registrada. Pedido ${data.orderNsu}.`}); clear(); afterSave?.() }
    } catch(e) { setMessage({type:'error', text:e.message}) }
    finally { setLoading(false) }
  }

  return <div className="admin-panel-card"><div className="panel-title"><div><span>PDV da Secretaria</span><h2>Nova confirmação presencial</h2></div><div className="price-chip">{money(students.length*STUDENT_PRICE)}</div></div><StudentPicker selected={students} onAdd={add} compact/><SelectedStudents students={students} onRemove={id=>setStudents(v=>v.filter(s=>s.id!==id))}/><div className="responsible-grid"><div className="field"><label>Responsável</label><input value={responsibleName} onChange={e=>setResponsibleName(e.target.value)}/></div><div className="field"><label>WhatsApp</label><input value={responsiblePhone} onChange={e=>setResponsiblePhone(e.target.value)}/></div></div><div className="field"><label>Forma de pagamento</label><select value={mode} onChange={e=>setMode(e.target.value)}><option value="cash">Dinheiro</option><option value="external_pix">Pix externo/manual</option><option value="card_machine">Cartão na maquininha</option><option value="infinitepay">Gerar checkout InfinitePay</option><option value="other">Outro</option></select></div>{mode==='other'&&<div className="field"><label>Observação</label><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Descreva a forma de pagamento"/></div>}{message&&<div className={`alert ${message.type}`}>{message.text}</div>}<button className="primary wide" onClick={submit} disabled={loading}>{loading?'Processando...':mode==='infinitepay'?'Gerar link de pagamento':'Registrar pagamento e confirmar'}</button>{checkoutUrl&&<div className="qr-box"><QRCodeSVG value={checkoutUrl} size={190}/><div><strong>Checkout InfinitePay</strong><p>O responsável pode escanear o QR Code ou abrir o link.</p><div className="inline-actions"><a className="primary button-link" href={checkoutUrl} target="_blank" rel="noreferrer">Abrir checkout</a><button className="secondary" onClick={()=>navigator.clipboard.writeText(checkoutUrl)}>Copiar link</button></div></div></div>}</div>
}

function AdminTools({ user }) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  const resetAll = async () => {
    const ok = window.confirm('Isso vai apagar os registros de participantes, pagamentos e eventos da Gincana 2026. Deseja continuar?')
    if (!ok) return
    const typed = window.prompt('Digite RESETAR GINCANA para confirmar:')
    if (typed !== 'RESETAR GINCANA') return setMessage({ type: 'error', text: 'Confirmação inválida. Nada foi apagado.' })
    setLoading(true)
    setMessage(null)
    try {
      const token = await user.getIdToken()
      const response = await fetch('/api/admin-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmation: typed })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível resetar o sistema.')
      setMessage({ type: 'success', text: `Sistema resetado com sucesso. Participantes: ${data.deletedParticipants}, pagamentos: ${data.deletedOrders}, eventos: ${data.deletedEvents}.` })
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Falha ao resetar o sistema.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-panel-card">
      <div className="panel-title">
        <div>
          <span>Ferramentas</span>
          <h2>Resetar dados de teste</h2>
        </div>
      </div>
      <p className="panel-description">Use esta opção somente antes de liberar o sistema aos pais. Ela remove todos os registros de pagamentos, participantes confirmados e eventos financeiros da Gincana 2026.</p>
      <div className="warning-block">
        <strong>Atenção</strong>
        <p>Essa ação é irreversível no sistema e deve ser usada apenas para limpar a base antes da abertura oficial.</p>
      </div>
      {message && <div className={`alert ${message.type}`}>{message.text}</div>}
      <button className="danger-button" onClick={resetAll} disabled={loading}>{loading ? 'Resetando...' : 'Resetar sistema da Gincana'}</button>
    </div>
  )
}

function AdminApp() {
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [tab, setTab] = useState('dashboard')
  const [participants, setParticipants] = useState({})
  const [orders, setOrders] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [gradeFilter, setGradeFilter] = useState('all')

  useEffect(() => onAuthStateChanged(auth, u => { setUser(u); setAuthReady(true) }), [])
  useEffect(() => {
    if (!user) return
    const unsub1 = onSnapshot(collection(db,'gincana2026_participantes'), snap => { const obj={}; snap.forEach(d=>obj[d.id]={id:d.id,...d.data()}); setParticipants(obj) })
    const unsub2 = onSnapshot(collection(db,'gincana2026_pagamentos'), snap => { const arr=[]; snap.forEach(d=>arr.push({id:d.id,...d.data()})); arr.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)); setOrders(arr) })
    return () => { unsub1(); unsub2() }
  }, [user])

  if (!authReady) return <main className="login-page"><div className="spinner"/></main>
  if (!user) return <Login onUser={setUser}/>

  const enriched = STUDENTS.map(student => {
    const record = participants[student.id] || null
    let status = record?.status || 'available'
    if (status === 'pending_checkout' && record?.reservationExpiresAt?.toDate?.() <= new Date()) status = 'available'
    return { ...student, record, status }
  })
  const confirmed = enriched.filter(s=>s.status==='confirmed')
  const pending = enriched.filter(s=>s.status==='pending_checkout' && s.record?.reservationExpiresAt?.toDate?.() > new Date())
  const revenue = orders.filter(o=>o.status==='paid').reduce((sum,o)=>sum+Number(o.total||0),0)
  const filtered = enriched.filter(s => (statusFilter==='all'||s.status===statusFilter) && (gradeFilter==='all'||s.grade===gradeFilter) && normalize(s.name).includes(normalize(search)))
  const byGrade = GRADES.map(grade => { const total=STUDENTS.filter(s=>s.grade===grade).length; const ok=confirmed.filter(s=>s.grade===grade).length; return {grade,total,ok,pct:Math.round(ok/total*100)} })

  const cancel = async student => {
    const reason = window.prompt(`Motivo do cancelamento de ${student.name}:`)
    if (!reason) return
    const token = await user.getIdToken()
    const response = await fetch('/api/cancel-participation',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({studentId:student.id,reason})})
    const data=await response.json(); if(!response.ok) alert(data.error||'Erro ao cancelar')
  }

  return <div className="admin-layout"><aside className="sidebar"><Logo/><div className="sidebar-title">Gincana 2026</div><nav><button className={tab==='dashboard'?'active':''} onClick={()=>setTab('dashboard')}>Visão geral</button><button className={tab==='sale'?'active':''} onClick={()=>setTab('sale')}>Nova confirmação</button><button className={tab==='participants'?'active':''} onClick={()=>setTab('participants')}>Participantes</button><button className={tab==='orders'?'active':''} onClick={()=>setTab('orders')}>Pagamentos</button><button className={tab==='tools'?'active':''} onClick={()=>setTab('tools')}>Ferramentas</button></nav><div className="sidebar-user"><span>{user.email}</span><button onClick={()=>signOut(auth)}>Sair</button></div></aside><main className="admin-main"><header className="admin-header"><div><span className="eyebrow">Secretaria • Escola Piaget</span><h1>{tab==='dashboard'?'Painel da Gincana':tab==='sale'?'Confirmar participação':tab==='participants'?'Controle de participantes':tab==='orders'?'Controle de pagamentos':'Ferramentas do sistema'}</h1></div><div className="header-date">10 OUT 2026</div></header>
  {tab==='dashboard'&&<><div className="metrics"><div className="metric primary-metric"><span>Participação confirmada</span><strong>{confirmed.length}<small>/81</small></strong><div className="progress"><i style={{width:`${confirmed.length/81*100}%`}}/></div><b>{(confirmed.length/81*100).toFixed(1).replace('.',',')}%</b></div><div className="metric"><span>Arrecadação confirmada</span><strong>{money(revenue)}</strong><small>{orders.filter(o=>o.status==='paid').length} pagamentos</small></div><div className="metric"><span>Em pagamento</span><strong>{pending.length}</strong><small>reservas de checkout ativas</small></div><div className="metric"><span>Ainda não confirmados</span><strong>{81-confirmed.length}</strong><small>alunos</small></div></div><div className="dashboard-grid"><div className="admin-panel-card"><div className="panel-title"><div><span>Participação</span><h2>Por turma</h2></div></div>{byGrade.map(g=><div className="grade-progress" key={g.grade}><div><strong>{g.grade}</strong><span>{g.ok} de {g.total}</span></div><div className="progress"><i style={{width:`${g.pct}%`}}/></div><b>{g.pct}%</b></div>)}</div><div className="admin-panel-card"><div className="panel-title"><div><span>Últimos registros</span><h2>Pagamentos recentes</h2></div><button className="text-button" onClick={()=>setTab('orders')}>Ver todos</button></div><div className="recent-list">{orders.slice(0,6).map(o=><div key={o.id}><div><strong>{o.responsibleName}</strong><span>{o.students?.map(s=>s.name.split(' ')[0]).join(', ')}</span></div><div><strong>{money(o.total)}</strong><span>{o.status==='paid'?'Confirmado':o.status}</span></div></div>)}{!orders.length&&<p className="empty-state">Nenhum pagamento registrado ainda.</p>}</div></div></div></>}
  {tab==='sale'&&<AdminSale user={user}/>} 
  {tab==='participants'&&<div className="admin-panel-card"><div className="table-filters"><input placeholder="Buscar aluno..." value={search} onChange={e=>setSearch(e.target.value)}/><select value={gradeFilter} onChange={e=>setGradeFilter(e.target.value)}><option value="all">Todas as turmas</option>{GRADES.map(g=><option key={g}>{g}</option>)}</select><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">Todos os status</option><option value="confirmed">Confirmados</option><option value="pending_checkout">Em pagamento</option><option value="available">Não confirmados</option><option value="cancelled">Cancelados</option></select></div><div className="table-wrap"><table><thead><tr><th>Aluno</th><th>Turma</th><th>Equipe</th><th>Status</th><th>Pagamento</th><th>Data</th><th></th></tr></thead><tbody>{filtered.map(s=><tr key={s.id}><td><strong>{s.name}</strong><small>Matrícula {s.id}</small></td><td>{s.grade}</td><td><TeamBadge team={s.team}/></td><td><span className={`status ${s.status}`}>{s.status==='confirmed'?'Confirmado':s.status==='pending_checkout'?'Em pagamento':s.status==='cancelled'?'Cancelado':'Não confirmado'}</span></td><td>{methodLabel(s.record?.paymentMethod)}</td><td>{fmtDate(s.record?.confirmedAt)}</td><td>{s.status==='confirmed'&&<button className="danger-link" onClick={()=>cancel(s)}>Cancelar</button>}</td></tr>)}</tbody></table></div></div>}
  {tab==='orders'&&<div className="admin-panel-card"><div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Responsável</th><th>Alunos</th><th>Origem</th><th>Forma</th><th>Status</th><th>Valor</th><th>Data</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td><code>{o.id}</code></td><td>{o.responsibleName}<small>{o.responsiblePhone}</small></td><td>{o.students?.map(s=><span className="mini-student" key={s.id}>{s.name}</span>)}</td><td>{originLabel(o.origin)}</td><td>{methodLabel(o.captureMethod||o.paymentMethod)}</td><td><span className={`status ${o.status}`}>{o.status==='paid'?'Pago':o.status==='pending'?'Pendente':o.status==='paid_conflict'?'Conflito':o.status}</span></td><td><strong>{money(o.total)}</strong></td><td>{fmtDate(o.createdAt)}</td></tr>)}</tbody></table></div></div>}
  {tab==='tools'&&<AdminTools user={user}/>} 
  </main></div>
}

export default function App() {
  const path = window.location.pathname
  if (path.startsWith('/admin')) return <AdminApp />
  if (path.startsWith('/retorno')) return <ReturnApp />
  return <PublicApp />
}
