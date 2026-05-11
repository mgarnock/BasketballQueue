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

  // Timer Logic
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

    setQueue(qData || [])
    setCurrentGame(gData || [])

    // Automatic Promotion: If less than 2 players on court and people are in queue
    if ((gData?.length || 0) < 2 && (qData?.length || 0) > 0) {
      promotePlayer(qData[0])
    }
  }

  const promotePlayer = async (player) => {
    await supabase.from('current_game').insert([{ player_name: player.name }])
    await supabase.from('queue').delete().eq('id', player.id)
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
      window.location.reload() // Hard refresh to sync state
    }
  }

  const handleFinish = () => setShowResults(true)

  const resolveGame = async (winnerName, loserId) => {
    // Delete the loser from current_game
    await supabase.from('current_game').delete().eq('id', loserId)
    setShowResults(false)
  }

  const amIInGame = currentGame.some(p => p.player_name === myLocalName)

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #001f3f 0%, #003366 100%)', padding: '20px 10px', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto' }}>

        {/* CURRENT GAME SECTION */}
        <div style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '25px', borderRadius: '24px', border: '2px solid #CC0000', marginBottom: '20px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '14px', color: '#CC0000', fontWeight: '900', letterSpacing: '2px', marginBottom: '15px' }}>ON COURT</h2>

          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', marginBottom: '20px' }}>
            {currentGame.length > 0 ? currentGame.map(p => (
              <div key={p.id}>
                <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{p.player_name}</div>
                {p.player_name === myLocalName && <div style={{ fontSize: '10px', color: '#CC0000' }}>YOU</div>}
              </div>
            )) : <div style={{ opacity: 0.5 }}>Waiting for players...</div>}
          </div>

          {currentGame.length === 2 && (
            <>
              <div style={{ fontSize: '32px', fontWeight: '800', marginBottom: '20px', fontFamily: 'monospace' }}>{formatTime(gameTime)}</div>

              {amIInGame && !showResults && (
                <button onClick={handleFinish} style={{ width: '100%', padding: '15px', backgroundColor: '#CC0000', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold' }}>FINISH GAME</button>
              )}

              {showResults && amIInGame && (
                <div style={{ display: 'flex', gap: '10px' }}>
                  {currentGame.map(p => (
                    <button
                      key={p.id}
                      onClick={() => resolveGame(p.player_name, currentGame.find(other => other.id !== p.id).id)}
                      style={{ flex: 1, padding: '15px', backgroundColor: p.player_name === myLocalName ? '#28a745' : '#555', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold' }}
                    >
                      {p.player_name === myLocalName ? "I WON" : `${p.player_name} WON`}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* JOIN SECTION */}
        {!hasJoined && !amIInGame && (
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '24px', marginBottom: '20px' }}>
            <form onSubmit={joinQueue} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Enter handle..." style={{ padding: '15px', borderRadius: '12px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'white' }} />
              <button type="submit" style={{ padding: '15px', backgroundColor: '#CC0000', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold' }}>JOIN QUEUE</button>
            </form>
          </div>
        )}

        {/* WAITLIST SECTION */}
        <h3 style={{ fontSize: '18px', padding: '0 10px' }}>Next in Line ({queue.length})</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {queue.map((p, i) => (
            <div key={p.id} style={{ padding: '15px 20px', background: 'rgba(255,255,255,0.05)', borderRadius: '15px', display: 'flex', justifyContent: 'space-between' }}>
              <span>{i + 1}. {p.name}</span>
              {p.name === myLocalName && <span style={{ color: '#CC0000', fontSize: '12px', fontWeight: 'bold' }}>YOU</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default App