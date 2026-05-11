import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

function App() {
  const [name, setName] = useState('')
  const [queue, setQueue] = useState([])
  const [currentGame, setCurrentGame] = useState([])
  const [elapsedTime, setElapsedTime] = useState('0:00')
  const [showResults, setShowResults] = useState(false)

  const myLocalName = localStorage.getItem('fauHoopsName') || ''

  useEffect(() => {
    fetchData()
    const qChannel = supabase.channel('q').on('postgres_changes', { event: '*', schema: 'public', table: 'queue' }, () => fetchData()).subscribe()
    const gChannel = supabase.channel('g').on('postgres_changes', { event: '*', schema: 'public', table: 'current_game' }, () => fetchData()).subscribe()
    return () => { supabase.removeChannel(qChannel); supabase.removeChannel(gChannel); }
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      if (currentGame.length === 2) {
        const startTime = new Date(currentGame[1].joined_at).getTime()
        const now = new Date().getTime()
        const diff = Math.floor((now - startTime) / 1000)
        const mins = Math.floor(diff / 60); const secs = diff % 60
        setElapsedTime(`${mins}:${secs < 10 ? '0' : ''}${secs}`)
      } else { setElapsedTime('0:00') }
    }, 1000)
    return () => clearInterval(interval)
  }, [currentGame])

  const fetchData = async () => {
    const { data: qData } = await supabase.from('queue').select('*').order('created_at', { ascending: true })
    const { data: gData } = await supabase.from('current_game').select('*').order('joined_at', { ascending: true })
    const currentQ = qData || []; const currentG = gData || []
    setQueue(currentQ); setCurrentGame(currentG)

    if (currentG.length < 2 && currentQ.length > 0) {
      const p = currentQ[0]
      try {
        const { error } = await supabase.from('current_game').insert([{ player_name: p.name }])
        if (!error) await supabase.from('queue').delete().eq('id', p.id)
      } catch (e) { console.log("Handled") }
    }
  }

  // --- NEW: WAIT TIME LOGIC ---
  const getWaitTime = () => {
    const myIndex = queue.findIndex(p => p.name === myLocalName)
    if (myIndex === -1) return null // Not in queue

    const AVG_GAME = 12
    const currentMinsRemaining = 6 // Estimate remaining in current game
    return currentMinsRemaining + (myIndex * AVG_GAME)
  }

  const joinQueue = async (e) => {
    e.preventDefault(); const cleanName = name.trim()
    if (!cleanName) return
    const { error } = await supabase.from('queue').insert([{ name: cleanName }])
    if (!error) { localStorage.setItem('fauHoopsName', cleanName); setName('') }
  }

  const resolveGame = async (winnerId, loserId) => {
    const winner = currentGame.find(p => p.id === winnerId)
    await supabase.from('current_game').update({ streak: (winner.streak || 0) + 1 }).eq('id', winnerId)
    await supabase.from('current_game').delete().eq('id', loserId)
    setShowResults(false)
  }

  const amIInGame = currentGame.some(p => p.player_name === myLocalName)
  const isRegistered = amIInGame || queue.some(p => p.name === myLocalName)
  const waitTime = getWaitTime()

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #001f3f 0%, #003366 100%)', padding: '20px 10px', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto' }}>
        <header style={{ textAlign: 'center', padding: '20px 0' }}>
          <h1 style={{ margin: 0, fontSize: '26px', fontWeight: '900' }}>FAU <span style={{ color: '#CC0000' }}>HOOPS</span></h1>
        </header>

        {/* ESTIMATED WAIT BADGE */}
        {waitTime !== null && (
          <div style={{ background: '#CC0000', color: 'white', padding: '8px', borderRadius: '10px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', marginBottom: '15px', animation: 'pulse 2s infinite' }}>
            ⏳ EST. WAIT TIME: ~{waitTime} MINS
          </div>
        )}

        {/* COURT SECTION */}
        <div style={{ background: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(10px)', padding: '25px', borderRadius: '24px', border: '2px solid #CC0000', marginBottom: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '10px', fontWeight: '900', color: '#CC0000', letterSpacing: '2px', marginBottom: '15px' }}>ON COURT</div>
          <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '15px' }}>
            {currentGame.map(p => (
              <div key={p.id}>
                <div style={{ fontSize: '18px', fontWeight: '700' }}>{p.player_name} {p.streak >= 2 && `🔥${p.streak}`}</div>
                {p.player_name === myLocalName && <div style={{ fontSize: '10px', color: '#CC0000', fontWeight: 'bold' }}>YOU</div>}
              </div>
            ))}
          </div>
          <div style={{ fontSize: '36px', fontWeight: '800', marginBottom: '20px' }}>{elapsedTime}</div>
          {amIInGame && currentGame.length === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {!showResults ? <button onClick={() => setShowResults(true)} style={{ width: '100%', padding: '15px', background: '#CC0000', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 'bold' }}>FINISH GAME</button> :
              <div style={{ display: 'flex', gap: '8px' }}>
                {currentGame.map(p => (
                  <button key={p.id} onClick={() => resolveGame(p.id, currentGame.find(o => o.id !== p.id).id)} style={{ flex: 1, padding: '12px', background: p.player_name === myLocalName ? '#28a745' : '#444', color: '#fff', border: 'none', borderRadius: '10px' }}>
                    {p.player_name === myLocalName ? "I Won" : `${p.player_name} Won`}
                  </button>
                ))}
              </div>}
            </div>
          )}
        </div>

        {/* JOIN SECTION */}
        {!isRegistered ? (
          <form onSubmit={joinQueue} style={{ display: 'flex', gap: '10px', marginBottom: '25px' }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Handle..." style={{ flex: 1, padding: '15px', borderRadius: '12px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff' }} />
            <button type="submit" style={{ padding: '0 25px', background: '#CC0000', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 'bold' }}>JOIN</button>
          </form>
        ) : (
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '15px', textAlign: 'center', marginBottom: '20px' }}>
            <div style={{ fontSize: '14px' }}>You are {amIInGame ? "PLAYING" : "IN LINE"}</div>
          </div>
        )}

        {/* LIST SECTION */}
        <div style={{ padding: '0 5px' }}>
          <h3 style={{ fontSize: '14px', opacity: 0.6, marginBottom: '10px' }}>WAITLIST ({queue.length})</h3>
          {queue.map((p, i) => (
            <div key={p.id} style={{ padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '15px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
              <span>{i + 1}. {p.name}</span>
              {p.name === myLocalName && <span style={{ color: '#CC0000', fontWeight: 'bold' }}>YOU</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default App