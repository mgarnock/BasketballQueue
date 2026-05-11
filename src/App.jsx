import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

function App() {
  const [name, setName] = useState('')
  const [queue, setQueue] = useState([])
  const [currentGame, setCurrentGame] = useState([])
  const [elapsedTime, setElapsedTime] = useState('0:00')
  const [showResults, setShowResults] = useState(false)

  const myLocalName = localStorage.getItem('fauHoopsName') || ''
  const hasJoined = localStorage.getItem('fauHoopsJoined') === 'true'

  useEffect(() => {
    fetchData()
    const qChannel = supabase.channel('q-sync').on('postgres_changes', { event: '*', schema: 'public', table: 'queue' }, () => fetchData()).subscribe()
    const gChannel = supabase.channel('g-sync').on('postgres_changes', { event: '*', schema: 'public', table: 'current_game' }, () => fetchData()).subscribe()

    return () => {
      supabase.removeChannel(qChannel)
      supabase.removeChannel(gChannel)
    }
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      if (currentGame.length === 2) {
        const startTime = new Date(currentGame[1].joined_at).getTime()
        const now = new Date().getTime()
        const diff = Math.floor((now - startTime) / 1000)
        if (diff > 0) {
          const mins = Math.floor(diff / 60); const secs = diff % 60
          setElapsedTime(`${mins}:${secs < 10 ? '0' : ''}${secs}`)
        }
      } else { setElapsedTime('0:00') }
    }, 1000)
    return () => clearInterval(interval)
  }, [currentGame])

  const fetchData = async () => {
    const { data: qData } = await supabase.from('queue').select('*').order('created_at', { ascending: true })
    const { data: gData } = await supabase.from('current_game').select('*').order('joined_at', { ascending: true })

    const currentQ = qData || []; const currentG = gData || []
    setQueue(currentQ); setCurrentGame(currentG)

    // Sync Local Storage
    const stillInSystem = currentQ.some(p => p.name === myLocalName) || currentG.some(p => p.player_name === myLocalName)
    if (!stillInSystem && myLocalName) {
      localStorage.removeItem('fauHoopsName'); localStorage.removeItem('fauHoopsJoined')
    }

    // Auto-Promote Logic
    if (currentG.length < 2 && currentQ.length > 0) {
      const p = currentQ[0]
      try {
        const { error } = await supabase.from('current_game').insert([{ player_name: p.name }])
        if (!error) await supabase.from('queue').delete().eq('id', p.id)
      } catch (e) { console.log("Handled") }
    }
  }

  const getWaitTime = () => {
    const myIndex = queue.findIndex(p => p.name === myLocalName)
    if (myIndex === -1) return null
    return 6 + (myIndex * 12)
  }

  const joinQueue = async (e) => {
    e.preventDefault(); const cleanName = name.trim()
    if (!cleanName || isRegistered) return
    const { error } = await supabase.from('queue').insert([{ name: cleanName }])
    if (!error) {
      localStorage.setItem('fauHoopsName', cleanName)
      localStorage.setItem('fauHoopsJoined', 'true')
      setName('')
    }
  }

  const leaveEverything = async () => {
    if (!window.confirm("Leave the court/line?")) return
    await supabase.from('queue').delete().eq('name', myLocalName)
    await supabase.from('current_game').delete().eq('player_name', myLocalName)
    localStorage.clear(); window.location.reload()
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
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #001f3f 0%, #003366 100%)',
      padding: '20px 10px',
      fontFamily: '"Inter", sans-serif',
      color: '#fff'
    }}>
      <div style={{ maxWidth: '480px', margin: '0 auto' }}>

        <header style={{ textAlign: 'center', padding: '30px 0 20px' }}>
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>🏀</div>
          <h1 style={{ margin: 0, fontSize: '32px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '-1px' }}>
            Fau <span style={{ color: '#CC0000' }}>Hoops</span>
          </h1>
          <p style={{ opacity: 0.5, fontSize: '12px', marginTop: '5px', fontWeight: '600', letterSpacing: '1px' }}>LIVE COURT QUEUE • BOCA RATON</p>
        </header>

        {/* NEW: Wait Time Badge */}
        {waitTime !== null && (
          <div style={{
            background: 'rgba(204, 0, 0, 0.2)',
            border: '1px solid #CC0000',
            padding: '12px',
            borderRadius: '16px',
            textAlign: 'center',
            fontSize: '13px',
            fontWeight: 'bold',
            marginBottom: '20px',
            boxShadow: '0 0 20px rgba(204, 0, 0, 0.2)'
          }}>
            ⏳ ESTIMATED WAIT: ~{waitTime} MINS
          </div>
        )}

        {/* ON COURT - Glassmorphism Card */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(12px)',
          padding: '25px',
          borderRadius: '28px',
          border: '2px solid #CC0000',
          marginBottom: '25px',
          textAlign: 'center',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
        }}>
          <div style={{ fontSize: '11px', fontWeight: '900', color: '#CC0000', letterSpacing: '3px', marginBottom: '20px' }}>ON COURT</div>

          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', marginBottom: '25px' }}>
            {currentGame.length > 0 ? currentGame.map(p => (
              <div key={p.id}>
                <div style={{ fontSize: '20px', fontWeight: '800' }}>
                  {p.player_name}
                  {p.streak >= 2 && <span style={{ marginLeft: '6px' }}>🔥<span style={{ color: '#FFD700', fontSize: '14px' }}>{p.streak}</span></span>}
                </div>
                {p.player_name === myLocalName && <div style={{ fontSize: '10px', color: '#CC0000', fontWeight: '900', marginTop: '4px' }}>YOU</div>}
              </div>
            )) : <div style={{ opacity: 0.3, fontWeight: '500' }}>Waiting for ballers...</div>}
          </div>

          <div style={{ fontSize: '42px', fontWeight: '900', marginBottom: '25px', fontFamily: 'monospace', letterSpacing: '2px' }}>{elapsedTime}</div>

          {amIInGame && currentGame.length === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {!showResults ? (
                <button onClick={() => setShowResults(true)} style={{ padding: '18px', backgroundColor: '#CC0000', color: 'white', border: 'none', borderRadius: '16px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 10px 20px rgba(204, 0, 0, 0.3)' }}>
                  FINISH GAME
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <p style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Winner stays on court:</p>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {currentGame.map(p => (
                      <button key={p.id} onClick={() => resolveGame(p.id, currentGame.find(o => o.id !== p.id).id)} style={{ flex: 1, padding: '15px', background: p.player_name === myLocalName ? '#28a745' : '#444', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                        {p.player_name === myLocalName ? "I WON" : `${p.player_name} WON`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={leaveEverything} style={{ background: 'none', border: 'none', color: '#666', fontSize: '12px', textDecoration: 'underline', cursor: 'pointer', marginTop: '8px' }}>Leave Court</button>
            </div>
          )}
        </div>

        {/* INPUT SECTION */}
        {!isRegistered ? (
          <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '25px', borderRadius: '24px', marginBottom: '30px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <form onSubmit={joinQueue} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <label style={{ fontSize: '11px', fontWeight: '800', color: '#aaa', textTransform: 'uppercase', marginLeft: '5px' }}>Your Handle</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. BocaSniper" style={{ flex: 1, padding: '18px', borderRadius: '16px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'white', fontWeight: '600', outline: 'none' }} />
                <button type="submit" style={{ padding: '0 25px', backgroundColor: '#CC0000', color: 'white', border: 'none', borderRadius: '16px', fontWeight: '800', cursor: 'pointer' }}>JOIN</button>
              </div>
            </form>
          </div>
        ) : (
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '20px', textAlign: 'center', marginBottom: '30px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: '15px', fontWeight: '700' }}>Status: <span style={{ color: '#CC0000' }}>{amIInGame ? "READY TO PLAY" : "SECURED IN LINE"}</span></div>
            {!amIInGame && <button onClick={leaveEverything} style={{ background: 'none', border: 'none', color: '#888', fontSize: '12px', textDecoration: 'underline', marginTop: '10px', cursor: 'pointer' }}>Remove me from list</button>}
          </div>
        )}

        {/* WAITLIST */}
        <div style={{ padding: '0 5px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>WAITLIST</h3>
            <span style={{ fontSize: '12px', background: 'rgba(255,255,255,0.1)', padding: '5px 12px', borderRadius: '10px', color: '#aaa', fontWeight: 'bold' }}>{queue.length} PLAYERS</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {queue.map((p, i) => (
              <div key={p.id} style={{
                padding: '20px',
                background: i === 0 ? 'linear-gradient(90deg, rgba(204, 0, 0, 0.15) 0%, rgba(255, 255, 255, 0.05) 100%)' : 'rgba(255, 255, 255, 0.05)',
                borderRadius: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                border: i === 0 ? '1px solid rgba(204, 0, 0, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: i === 0 ? '#CC0000' : 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 'bold' }}>{i + 1}</div>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '17px' }}>{p.name}</div>
                    {i === 0 && <div style={{ fontSize: '9px', color: '#CC0000', fontWeight: '900', letterSpacing: '1px' }}>UP NEXT</div>}
                  </div>
                </div>
                {p.name === myLocalName && <span style={{ color: '#CC0000', fontSize: '11px', fontWeight: '900' }}>YOU</span>}
              </div>
            ))}
          </div>
        </div>

        <footer onClick={async () => { if (window.confirm("Admin: Wipe all data?")) { await supabase.from('queue').delete().neq('id', '00000000-0000-0000-0000-000000000000'); await supabase.from('current_game').delete().neq('id', '00000000-0000-0000-0000-000000000000'); localStorage.clear(); window.location.reload(); } }} style={{ textAlign: 'center', opacity: 0.1, fontSize: '10px', padding: '60px 0', cursor: 'pointer' }}>
          FAU HOOPS • ADMIN RESET
        </footer>

      </div>
    </div>
  )
}

export default App