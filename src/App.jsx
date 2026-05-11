import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

function App() {
  const [name, setName] = useState('')
  const [queue, setQueue] = useState([])
  const [currentGame, setCurrentGame] = useState([])
  const [gameTime, setGameTime] = useState(0)
  const [showResults, setShowResults] = useState(false)

  const myLocalName = localStorage.getItem('fauHoopsName') || ''
  const hasJoined = localStorage.getItem('fauHoopsJoined') === 'true'

  useEffect(() => {
    fetchData()

    const queueChannel = supabase.channel('queue-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'queue' }, () => fetchData()).subscribe()
    const gameChannel = supabase.channel('game-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'current_game' }, () => fetchData()).subscribe()

    return () => {
      supabase.removeChannel(queueChannel)
      supabase.removeChannel(gameChannel)
    }
  }, [])

  // Live Timer logic
  useEffect(() => {
    let interval
    if (currentGame.length === 2) {
      interval = setInterval(() => setGameTime(prev => prev + 1), 1000)
    } else {
      setGameTime(0)
    }
    return () => clearInterval(interval)
  }, [currentGame])

  const fetchData = async () => {
    const { data: qData } = await supabase.from('queue').select('*').order('created_at', { ascending: true })
    const { data: gData } = await supabase.from('current_game').select('*').order('joined_at', { ascending: true })

    const currentQ = qData || []
    const currentG = gData || []

    setQueue(currentQ)
    setCurrentGame(currentG)

    // AUTO-PROMOTION: If court has space and queue has people
    if (currentG.length < 2 && currentQ.length > 0) {
      const playerToPromote = currentQ[0]
      await supabase.from('current_game').insert([{ player_name: playerToPromote.name }])
      await supabase.from('queue').delete().eq('id', playerToPromote.id)
    }

    // LOCALSTORAGE SYNC: If you were removed from both tables, unlock your phone
    const inQueue = currentQ.some(p => p.name === myLocalName)
    const inGame = currentG.some(p => p.player_name === myLocalName)
    if (!inQueue && !inGame && hasJoined) {
      localStorage.removeItem('fauHoopsJoined')
      localStorage.removeItem('fauHoopsName')
      window.location.reload()
    }
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }

  const joinQueue = async (e) => {
    e.preventDefault()
    if (!name.trim() || hasJoined) return
    const { error } = await supabase.from('queue').insert([{ name: name.trim() }])
    if (!error) {
      localStorage.setItem('fauHoopsJoined', 'true')
      localStorage.setItem('fauHoopsName', name.trim())
      setName('')
    }
  }

  const leaveQueue = async (id, playerName, isFromGameTable = false) => {
    if (playerName !== myLocalName) return // SELF-REMOVE ONLY

    const table = isFromGameTable ? 'current_game' : 'queue'
    const { error } = await supabase.from(table).delete().eq('id', id)

    if (!error) {
      localStorage.removeItem('fauHoopsJoined')
      localStorage.removeItem('fauHoopsName')
      setShowResults(false)
    }
  }

  const resolveGame = async (winnerId, loserId) => {
    // Loser is removed, winner stays. The fetch function will auto-pull the next player.
    await supabase.from('current_game').delete().eq('id', loserId)
    setShowResults(false)
  }

  const amIInGame = currentGame.some(p => p.player_name === myLocalName)

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #001f3f 0%, #003366 100%)', padding: '20px 10px', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto' }}>

        <header style={{ textAlign: 'center', padding: '30px 0' }}>
          <div style={{ fontSize: '40px' }}>🏀</div>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: '800', textTransform: 'uppercase' }}>
            Fau <span style={{ color: '#CC0000' }}>Hoops</span>
          </h1>
        </header>

        {/* ON COURT SECTION */}
        <div style={{ background: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(10px)', padding: '25px', borderRadius: '24px', border: '2px solid #CC0000', marginBottom: '20px', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
          <h2 style={{ fontSize: '12px', color: '#CC0000', fontWeight: '900', letterSpacing: '2px', marginBottom: '15px' }}>LIVE ON COURT</h2>

          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', marginBottom: '20px', gap: '10px' }}>
            {currentGame.map((p, idx) => (
              <div key={p.id} style={{ flex: 1 }}>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: p.player_name === myLocalName ? '#CC0000' : '#fff' }}>{p.player_name}</div>
                {p.player_name === myLocalName && (
                  <button onClick={() => leaveQueue(p.id, p.player_name, true)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '12px' }}>[Leave Court]</button>
                )}
              </div>
            ))}
            {currentGame.length < 2 && <div style={{ opacity: 0.3 }}>Waiting for opponent...</div>}
          </div>

          {currentGame.length === 2 && (
            <>
              <div style={{ fontSize: '36px', fontWeight: '800', marginBottom: '20px', color: '#fff' }}>{formatTime(gameTime)}</div>

              {amIInGame && !showResults && (
                <button onClick={() => setShowResults(true)} style={{ width: '100%', padding: '15px', backgroundColor: '#CC0000', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>FINISH GAME</button>
              )}

              {showResults && amIInGame && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <p style={{ fontSize: '14px', fontWeight: 'bold' }}>Who won?</p>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {currentGame.map(p => (
                      <button
                        key={p.id}
                        onClick={() => resolveGame(p.id, currentGame.find(other => other.id !== p.id).id)}
                        style={{ flex: 1, padding: '12px', backgroundColor: p.player_name === myLocalName ? '#28a745' : '#444', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer' }}
                      >
                        {p.player_name === myLocalName ? "I Won" : `${p.player_name} Won`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* JOIN SECTION */}
        {!hasJoined && (
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '24px', marginBottom: '20px' }}>
            <form onSubmit={joinQueue} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Enter handle..." style={{ padding: '15px', borderRadius: '12px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'white', outline: 'none' }} />
              <button type="submit" style={{ padding: '15px', backgroundColor: '#CC0000', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>JOIN THE LIST</button>
            </form>
          </div>
        )}

        {/* WAITLIST SECTION */}
        <div style={{ padding: '0 10px' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '15px', opacity: 0.7 }}>NEXT UP ({queue.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {queue.map((p, i) => (
              <div key={p.id} style={{ padding: '18px', background: 'rgba(255,255,255,0.05)', borderRadius: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '600' }}>{i + 1}. {p.name}</span>
                {p.name === myLocalName && (
                  <button onClick={() => leaveQueue(p.id, p.name, false)} style={{ backgroundColor: 'rgba(255,0,0,0.2)', border: 'none', color: 'white', padding: '5px 12px', borderRadius: '8px', cursor: 'pointer' }}>✕</button>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

export default App