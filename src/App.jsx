import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

function App() {
  const [name, setName] = useState('')
  const [queue, setQueue] = useState([])
  const [hasJoined, setHasJoined] = useState(localStorage.getItem('fauHoopsJoined') === 'true')
  // We need to keep track of the local name to check ownership
  const [myLocalName, setMyLocalName] = useState(localStorage.getItem('fauHoopsName') || '')

  useEffect(() => {
    fetchQueue()

    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'queue' },
        () => fetchQueue()
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  const fetchQueue = async () => {
    const { data } = await supabase
      .from('queue')
      .select('*')
      .order('created_at', { ascending: true })

    const currentQueue = data || []
    setQueue(currentQueue)

    const storedName = localStorage.getItem('fauHoopsName')
    const stillInQueue = currentQueue.some(player => player.name === storedName)

    if (!stillInQueue && hasJoined) {
      setHasJoined(false)
      setMyLocalName('')
      localStorage.removeItem('fauHoopsJoined')
      localStorage.removeItem('fauHoopsName')
    }
  }

  const joinQueue = async (e) => {
    e.preventDefault()
    if (!name.trim() || hasJoined) return

    const { error } = await supabase
      .from('queue')
      .insert([{ name: name.trim() }])

    if (error) {
      alert("Error joining queue!")
    } else {
      const joinedName = name.trim()
      setHasJoined(true)
      setMyLocalName(joinedName)
      localStorage.setItem('fauHoopsJoined', 'true')
      localStorage.setItem('fauHoopsName', joinedName)
      setName('')
    }
  }

  const leaveQueue = async (id, playerName) => {
    // SECURITY CHECK: Only allow delete if the name matches the device
    if (playerName !== localStorage.getItem('fauHoopsName')) {
      alert("You can only remove yourself!")
      return
    }

    const { error } = await supabase
      .from('queue')
      .delete()
      .eq('id', id)

    if (error) {
      alert("Error deleting entry.")
    } else {
      setHasJoined(false)
      setMyLocalName('')
      localStorage.removeItem('fauHoopsJoined')
      localStorage.removeItem('fauHoopsName')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #001f3f 0%, #003366 100%)',
      padding: '20px 10px',
      fontFamily: '"Inter", -apple-system, sans-serif',
      color: '#fff'
    }}>
      <div style={{ maxWidth: '480px', margin: '0 auto' }}>

        <header style={{ textAlign: 'center', padding: '40px 0 20px' }}>
          <div style={{ fontSize: '50px', marginBottom: '10px' }}>🏀</div>
          <h1 style={{
            margin: 0,
            fontSize: '32px',
            fontWeight: '800',
            letterSpacing: '-1px',
            textTransform: 'uppercase'
          }}>
            Fau <span style={{ color: '#CC0000' }}>Hoops</span>
          </h1>
          <p style={{ opacity: 0.6, fontSize: '14px', marginTop: '5px', fontWeight: '500' }}>
            LIVE COURT QUEUE • BOCA RATON
          </p>
        </header>

        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(10px)',
          padding: '25px',
          borderRadius: '24px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          marginBottom: '25px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
        }}>
          {hasJoined ? (
            <div style={{ textAlign: 'center', padding: '10px' }}>
              <div style={{ color: '#CC0000', fontWeight: 'bold', fontSize: '18px', marginBottom: '5px' }}>YOU'RE IN LINE: {myLocalName}</div>
              <p style={{ color: '#aaa', fontSize: '14px', margin: 0 }}>Good luck on the court!</p>
            </div>
          ) : (
            <form onSubmit={joinQueue} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#aaa', textTransform: 'uppercase', marginLeft: '5px' }}>
                Player Name
              </label>
              <input
                type="text"
                placeholder="Enter your handle..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  padding: '18px',
                  fontSize: '16px',
                  borderRadius: '16px',
                  border: 'none',
                  outline: 'none',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  color: 'white',
                  fontWeight: '500'
                }}
              />
              <button type="submit" style={{
                padding: '18px',
                backgroundColor: '#CC0000',
                color: 'white',
                border: 'none',
                borderRadius: '16px',
                fontSize: '18px',
                fontWeight: '800',
                cursor: 'pointer',
                boxShadow: '0 10px 20px rgba(204, 0, 0, 0.3)'
              }}>
                CLAIM NEXT SPOT
              </button>
            </form>
          )}
        </div>

        <div style={{ marginBottom: '40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', padding: '0 10px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700' }}>Current Waitlist</h2>
            <span style={{ fontSize: '12px', backgroundColor: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '10px', color: '#aaa' }}>
              {queue.length} PLAYERS
            </span>
          </div>

          {queue.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '24px',
              border: '2px dashed rgba(255,255,255,0.1)'
            }}>
              <p style={{ color: '#666', fontWeight: '500' }}>Court is open. No one in line.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {queue.map((player, index) => (
                <div key={player.id} style={{
                  padding: '20px',
                  borderRadius: '20px',
                  background: index === 0
                    ? 'linear-gradient(90deg, rgba(204, 0, 0, 0.2) 0%, rgba(255, 255, 255, 0.05) 100%)'
                    : 'rgba(255, 255, 255, 0.05)',
                  border: index === 0 ? '1px solid rgba(204, 0, 0, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{
                      width: '35px',
                      height: '35px',
                      borderRadius: '50%',
                      backgroundColor: index === 0 ? '#CC0000' : 'rgba(255,255,255,0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                      fontWeight: 'bold'
                    }}>
                      {index + 1}
                    </div>
                    <div>
                      <div style={{ fontSize: '18px', fontWeight: '700', color: index === 0 ? '#fff' : '#ddd' }}>
                        {player.name}
                      </div>
                    </div>
                  </div>

                  {/* ONLY SHOW X IF IT IS YOUR NAME */}
                  {player.name === myLocalName && (
                    <button
                      onClick={() => leaveQueue(player.id, player.name)}
                      style={{
                        background: 'rgba(255, 0, 0, 0.2)',
                        border: '1px solid rgba(255, 0, 0, 0.3)',
                        color: '#fff',
                        width: '30px',
                        height: '30px',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <footer style={{ textAlign: 'center', opacity: 0.3, fontSize: '12px', paddingBottom: '20px' }}>
          FAU Basketball Community App
        </footer>
      </div>
    </div>
  )
}

export default App