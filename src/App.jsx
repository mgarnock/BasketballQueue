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
    const queueChannel = supabase.channel('q').on('postgres_changes', { event: '*', schema: 'public', table: 'queue' }, () => fetchData()).subscribe()
    const gameChannel = supabase.channel('g').on('postgres_changes', { event: '*', schema: 'public', table: 'current_game' }, () => fetchData()).subscribe()

    return () => {
      supabase.removeChannel(queueChannel)
      supabase.removeChannel(gameChannel)
    }
  }, [])

  // Persistent Timer: Calculates time based on DB timestamp
  useEffect(() => {
    const interval = setInterval(() => {
      if (currentGame.length === 2) {
        const startTime = new Date(currentGame[1].joined_at).getTime() // Use the 2nd person's join time
        const now = new Date().getTime()
        const diff = Math.floor((now - startTime) / 1000)
        if (diff > 0) {
          const mins = Math.floor(diff / 60)
          const secs = diff % 60
          setElapsedTime(`${mins}:${secs < 10 ? '0' : ''}${secs}`)
        }
      } else {
        setElapsedTime('0:00')
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [currentGame])

  const fetchData = async () => {
    const { data: qData } = await supabase.from('queue').select('*').order('created_at', { ascending: true })
    const { data: gData } = await supabase.from('current_game').select('*').order('joined_at', { ascending: true })

    const currentQ = qData || []
    const currentG = gData || []

    setQueue(currentQ)
    setCurrentGame(currentG)

    // Check if I'm still in the system at all
    const stillInSystem = currentQ.some(p => p.name === myLocalName) || currentG.some(p => p.player_name === myLocalName)
    if (!stillInSystem && myLocalName) {
      localStorage.removeItem('fauHoopsName')
      localStorage.removeItem('fauHoopsJoined')
    }

    // Auto-promote if court is open
    if (currentG.length < 2 && currentQ.length > 0) {
      const p = currentQ[0]
      await supabase.from('current_game').insert([{ player_name: p.name }])
      await supabase.from('queue').delete().eq('id', p.id)
    }
  }

  const joinQueue = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    const { error } = await supabase.from('queue').insert([{ name: name.trim() }])
    if (!error) {
      localStorage.setItem('fauHoopsName', name.trim())
      localStorage.setItem('fauHoopsJoined', 'true')
      setName('')
    }
  }

  const leaveEverything = async () => {
    // Search both tables for my name and delete
    await supabase.from('queue').delete().eq('name', myLocalName)
    await supabase.from('current_game').delete().eq('player_name', myLocalName)
    localStorage.removeItem('fauHoopsName')
    localStorage.removeItem('fauHoopsJoined')
    setShowResults(false)
  }

  const resolveGame = async (winnerId, loserId) => {
    await supabase.from('current_game').delete().eq('id', loserId)
    setShowResults(false)
  }

  // Derived States for UI
  const amIInGame = currentGame.some(p => p.player_name === myLocalName)
  const amIInQueue = queue.some(p => p.name === myLocalName)
  const isLocked = amIInGame || amIInQueue

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #001f3f 0%, #003366 100%)', padding: '20px 10px', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto' }}>

        <header style={{ textAlign: 'center', padding: '20px 0' }}>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '900' }}>FAU <span style={{ color: '#CC0000' }}>HOOPS</span></h1>
        </header>

        {/* COURT SECTION */}
        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '20px', border: '2px solid #CC0000', marginBottom: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '10px', fontWeight: 'bold', letterSpacing: '2px', color: '#CC0000', marginBottom: '15px' }}>ON COURT</div>

          <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '15px' }}>
            {currentGame.map(p => (
              <div key={p.id} style={{ fontWeight: 'bold' }}>
                {p.player_name} {p.player_name === myLocalName && "(YOU)"}
              </div>
            ))}
            {currentGame.length < 2 && <div style={{ opacity: 0.3 }}>Waiting...</div>}
          </div>

          <div style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '15px' }}>{elapsedTime}</div>

          {amIInGame && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {!showResults ? (
                <button onClick={() => setShowResults(true)} style={{ padding: '12px', background: '#CC0000', border: 'none', color: '#fff', borderRadius: '10px', fontWeight: 'bold' }}>FINISH GAME</button>
              ) : (
                <div style={{ display: 'flex', gap: '5px' }}>
                  {currentGame.map(p => (
                    <button key={p.id} onClick={() => resolveGame(p.id, currentGame.find(o => o.id !== p.id).id)} style={{ flex: 1, padding: '10px', background: p.player_name === myLocalName ? '#28a745' : '#444', border: 'none', color: '#fff', borderRadius: '8px' }}>
                      {p.player_name === myLocalName ? "I WON" : `${p.player_name} WON`}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={leaveEverything} style={{ fontSize: '12px', background: 'none', border: 'none', color: '#666', textDecoration: 'underline' }}>Leave Court</button>
            </div>
          )}
        </div>

        {/* JOIN / STATUS SECTION */}
        {isLocked ? (
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '15px', textAlign: 'center', marginBottom: '20px' }}>
            <div style={{ color: '#CC0000', fontWeight: 'bold' }}>YOU ARE REGISTERED</div>
            {!amIInGame && <button onClick={leaveEverything} style={{ marginTop: '5px', background: 'none', border: 'none', color: '#888', textDecoration: 'underline' }}>Remove me from queue</button>}
          </div>
        ) : (
          <form onSubmit={joinQueue} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Name..." style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff' }} />
            <button type="submit" style={{ padding: '12px 20px', background: '#CC0000', border: 'none', color: '#fff', borderRadius: '10px', fontWeight: 'bold' }}>JOIN</button>
          </form>
        )}

        {/* QUEUE SECTION */}
        <div style={{ padding: '0 5px' }}>
          <h3 style={{ fontSize: '14px', opacity: 0.6 }}>WAITLIST ({queue.length})</h3>
          {queue.map((p, i) => (
            <div key={p.id} style={{ padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
              <span>{i + 1}. {p.name}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}

export default App