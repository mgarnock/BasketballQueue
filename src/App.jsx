import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

function App() {
  const [name, setName] = useState('')
  const [queue, setQueue] = useState([])
  const [currentGame, setCurrentGame] = useState([])
  const [elapsedTime, setElapsedTime] = useState('0:00')
  const [showResults, setShowResults] = useState(false)
  const [avgGameTime, setAvgGameTime] = useState(12) // Default average

  const myLocalName = localStorage.getItem('fauHoopsName') || ''

  useEffect(() => {
    fetchData()
    fetchAvgTime()

    const queueChannel = supabase.channel('q-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue' }, () => fetchData())
      .subscribe()

    const gameChannel = supabase.channel('g-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'current_game' }, () => {
        fetchData()
        fetchAvgTime() // Refresh average when games end
      })
      .subscribe()

    return () => {
      supabase.removeChannel(queueChannel)
      supabase.removeChannel(gameChannel)
    }
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      if (currentGame.length === 2) {
        const startTime = new Date(currentGame[1].joined_at).getTime()
        const now = new Date().getTime()
        const diff = Math.floor((now - startTime) / 1000)

        if (diff > 0) {
          const mins = Math.floor(diff / 60)
          const secs = diff % 60
          setElapsedTime(`${mins}:${secs < 10 ? '0' : ''}${secs}`)
        } else {
          setElapsedTime('0:00')
        }
      } else {
        setElapsedTime('0:00')
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [currentGame])

  const fetchAvgTime = async () => {
    const { data } = await supabase.from('game_history').select('duration_minutes').order('created_at', { ascending: false }).limit(10)
    if (data && data.length > 0) {
      const sum = data.reduce((acc, curr) => acc + curr.duration_minutes, 0)
      setAvgGameTime(Math.round(sum / data.length))
    }
  }

  const fetchData = async () => {
    const { data: qData } = await supabase.from('queue').select('*').order('created_at', { ascending: true })
    const { data: gData } = await supabase.from('current_game').select('*').order('joined_at', { ascending: true })

    const currentQ = qData || []
    const currentG = gData || []

    setQueue(currentQ)
    setCurrentGame(currentG)

    const stillInSystem = currentQ.some(p => p.name === myLocalName) || currentG.some(p => p.player_name === myLocalName)
    if (!stillInSystem && myLocalName) {
      localStorage.removeItem('fauHoopsName')
      localStorage.removeItem('fauHoopsJoined')
    }

    if (currentG.length < 2 && currentQ.length > 0) {
      const nextPlayer = currentQ[0]
      try {
        const { error: insertError } = await supabase.from('current_game').insert([{ player_name: nextPlayer.name }])
        if (!insertError) {
          await supabase.from('queue').delete().eq('id', nextPlayer.id)
        }
      } catch (e) {
        console.log("Promotion handled by another client.")
      }
    }
  }

  const joinQueue = async (e) => {
    e.preventDefault()
    const cleanName = name.trim()
    if (!cleanName || isRegistered) return // CRITICAL LOCK

    const exists = queue.some(p => p.name.toLowerCase() === cleanName.toLowerCase()) ||
                   currentGame.some(p => p.player_name.toLowerCase() === cleanName.toLowerCase())

    if (exists) {
      alert("This name is already on the list!")
      return
    }

    const { error } = await supabase.from('queue').insert([{ name: cleanName }])

    if (error) {
      if (error.code === '23505') alert("Name already in use!")
      else alert("Error: " + error.message)
    } else {
      localStorage.setItem('fauHoopsName', cleanName)
      localStorage.setItem('fauHoopsJoined', 'true')
      setName('')
    }
  }

  const leaveEverything = async () => {
    if (!window.confirm("Leave the court/line?")) return
    await supabase.from('queue').delete().eq('name', myLocalName)
    await supabase.from('current_game').delete().eq('player_name', myLocalName)
    localStorage.removeItem('fauHoopsName')
    localStorage.removeItem('fauHoopsJoined')
    setShowResults(false)
  }

  const resolveGame = async (winnerId, loserId) => {
    // Save duration to history before deleting
    const gameDurationMins = Math.floor(parseInt(elapsedTime.split(':')[0])) || 1
    await supabase.from('game_history').insert([{ duration_minutes: gameDurationMins > 0 ? gameDurationMins : 1 }])

    const winner = currentGame.find(p => p.id === winnerId)
    const newStreak = (winner.streak || 0) + 1
    await supabase.from('current_game').update({ streak: newStreak }).eq('id', winnerId)
    const { error } = await supabase.from('current_game').delete().eq('id', loserId)
    if (!error) setShowResults(false)
  }

  const amIInGame = currentGame.some(p => p.player_name === myLocalName)
  const isRegistered = amIInGame || queue.some(p => p.name === myLocalName)

  // Wait Time Calculation
  const getWaitTime = () => {
    const myPos = queue.findIndex(p => p.name === myLocalName)
    if (myPos === -1) return null
    return (avgGameTime / 2) + (myPos * avgGameTime) // Current game (avg half left) + players ahead
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #001f3f 0%, #003366 100%)', padding: '20px 10px', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto' }}>

        <header style={{ textAlign: 'center', padding: '20px 0' }}>
          <h1 style={{ margin: 0, fontSize: '26px', fontWeight: '900' }}>FAU <span style={{ color: '#CC0000' }}>HOOPS</span></h1>
          <div style={{ fontSize: '10px', opacity: 0.5 }}>BOCA RATON • RECREATION</div>
          {isRegistered && !amIInGame && getWaitTime() && (
            <div style={{ marginTop: '10px', color: '#FFD700', fontSize: '13px', fontWeight: 'bold' }}>
               ⏳ EST. WAIT: ~{getWaitTime()} MINS
            </div>
          )}
        </header>

        <div style={{ background: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(10px)', padding: '25px', borderRadius: '24px', border: '2px solid #CC0000', marginBottom: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '10px', fontWeight: '900', color: '#CC0000', letterSpacing: '2px', marginBottom: '15px' }}>ON COURT</div>

          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', marginBottom: '15px' }}>
            {currentGame.map(p => (
              <div key={p.id} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '18px', fontWeight: '700' }}>
                  {p.player_name}
                  {p.streak >= 2 && (
                    <span style={{ marginLeft: '5px' }}>🔥<span style={{ color: '#FFD700', fontSize: '14px' }}>{p.streak}</span></span>
                  )}
                </div>
                {p.player_name === myLocalName && <div style={{ fontSize: '10px', color: '#CC0000', fontWeight: 'bold' }}>YOU</div>}
              </div>
            ))}
            {currentGame.length < 2 && <div style={{ opacity: 0.3 }}>Waiting for opponent...</div>}
          </div>

          <div style={{ fontSize: '36px', fontWeight: '800', marginBottom: '20px', fontFamily: 'monospace' }}>{elapsedTime}</div>

          {amIInGame && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {currentGame.length === 2 && (
                <>
                  {!showResults ? (
                    <button onClick={() => setShowResults(true)} style={{ width: '100%', padding: '15px', background: '#CC0000', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>FINISH GAME</button>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <p style={{ fontSize: '12px' }}>Winner stays, loser leaves:</p>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {currentGame.map(p => (
                          <button key={p.id} onClick={() => resolveGame(p.id, currentGame.find(o => o.id !== p.id).id)} style={{ flex: 1, padding: '12px', background: p.player_name === myLocalName ? '#28a745' : '#444', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 'bold' }}>
                            {p.player_name === myLocalName ? "I Won" : `${p.player_name} Won`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              <button onClick={leaveEverything} style={{ background: 'none', border: 'none', color: '#666', fontSize: '11px', textDecoration: 'underline', marginTop: '5px' }}>Leave Court</button>
            </div>
          )}
        </div>

        {isRegistered ? (
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '20px', textAlign: 'center', marginBottom: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>You are <span style={{ color: '#CC0000' }}>{amIInGame ? "PLAYING" : "IN LINE"}</span></div>
            {!amIInGame && <button onClick={leaveEverything} style={{ background: 'none', border: 'none', color: '#888', fontSize: '12px', textDecoration: 'underline', marginTop: '8px' }}>Leave List</button>}
          </div>
        ) : (
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '24px', marginBottom: '25px' }}>
            <form onSubmit={joinQueue} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ fontSize: '10px', fontWeight: 'bold', opacity: 0.5 }}>PLAYER NAME</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Handle..." style={{ flex: 1, padding: '15px', borderRadius: '12px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', outline: 'none' }} />
                <button type="submit" style={{ padding: '0 25px', background: '#CC0000', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 'bold' }}>JOIN</button>
              </div>
            </form>
          </div>
        )}

        <div style={{ padding: '0 5px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', opacity: 0.6 }}>
            <h3 style={{ fontSize: '14px', margin: 0 }}>WAITLIST</h3>
            <span style={{ fontSize: '14px' }}>{queue.length} Players</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {queue.map((p, i) => (
              <div key={p.id} style={{ padding: '15px 20px', background: 'rgba(255,255,255,0.05)', borderRadius: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '600' }}>{i + 1}. {p.name}</span>
                {p.name === myLocalName && <span style={{ fontSize: '10px', color: '#CC0000', fontWeight: 'bold' }}>YOU</span>}
              </div>
            ))}
          </div>
        </div>

        <footer onClick={async () => { if (window.confirm("Admin: Clear everything?")) { await supabase.from('queue').delete().neq('id', '00000000-0000-0000-0000-000000000000'); await supabase.from('current_game').delete().neq('id', '00000000-0000-0000-0000-000000000000'); localStorage.clear(); window.location.reload(); } }} style={{ textAlign: 'center', opacity: 0.1, fontSize: '10px', padding: '50px 0', cursor: 'pointer' }}>
          FAU HOOPS • ADMIN RESET
        </footer>

      </div>
    </div>
  )
}

export default App