import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

function App() {
  const [name, setName] = useState('')
  const [queue, setQueue] = useState([])

  // 1. Load initial data and set up Real-time listener
  useEffect(() => {
    fetchQueue()

    // This "subscribes" to changes. If the database changes, the app updates instantly!
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'queue' },
        () => fetchQueue()
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  // 2. Fetch the list from Supabase
  const fetchQueue = async () => {
    const { data } = await supabase
      .from('queue')
      .select('*')
      .order('created_at', { ascending: true })
    setQueue(data || [])
  }

  // 3. Add a name to the list
  const joinQueue = async (e) => {
    e.preventDefault()
    if (!name.trim()) return

    const { error } = await supabase
      .from('queue')
      .insert([{ name: name.trim() }])

    if (error) {
      alert("Error joining queue! Check your Supabase Policies.")
    } else {
      setName('') // Clear input
    }
  }

  // 4. Remove a name (Admin/Delete function)
  const leaveQueue = async (id) => {
    const { error } = await supabase
      .from('queue')
      .delete()
      .eq('id', id)

    if (error) alert("Error deleting entry.")
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f0f2f5',
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{ maxWidth: '500px', margin: '0 auto' }}>

        {/* Header - FAU Blue */}
        <header style={{
          backgroundColor: '#003366',
          padding: '30px 20px',
          borderRadius: '20px',
          color: 'white',
          textAlign: 'center',
          marginBottom: '20px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
        }}>
          <h1 style={{ margin: 0, fontSize: '24px' }}>🏀 Boca Baller Queue</h1>
          <p style={{ margin: '5px 0 0', opacity: 0.8, fontSize: '14px' }}>FAU Campus Recreation</p>
        </header>

        {/* Input Card */}
        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '20px',
          marginBottom: '20px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
        }}>
          <form onSubmit={joinQueue} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input
              type="text"
              placeholder="Enter your name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                padding: '15px',
                fontSize: '16px',
                borderRadius: '12px',
                border: '1px solid #ddd',
                outline: 'none',
                backgroundColor: '#f9f9f9'
              }}
            />
            <button type="submit" style={{
              padding: '15px',
              backgroundColor: '#CC0000', // FAU Red
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'transform 0.1s'
            }}>
              Join the Court
            </button>
          </form>
        </div>

        {/* List Card */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ padding: '15px 20px', borderBottom: '1px solid #f0f0f0', backgroundColor: '#fafafa' }}>
            <h2 style={{ margin: 0, fontSize: '16px', color: '#555' }}>Waitlist</h2>
          </div>

          {queue.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#aaa' }}>
              No one is waiting. Hop on!
            </div>
          ) : (
            <div>
              {queue.map((player, index) => (
                <div key={player.id} style={{
                  padding: '15px 20px',
                  borderBottom: index === queue.length - 1 ? 'none' : '1px solid #f0f0f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: index === 0 ? '#fffef0' : 'transparent'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{
                      fontWeight: 'bold',
                      color: index === 0 ? '#003366' : '#888',
                      fontSize: '18px'
                    }}>
                      {index + 1}
                    </span>
                    <span style={{
                      fontSize: '18px',
                      fontWeight: index === 0 ? '700' : '400',
                      color: '#333'
                    }}>
                      {player.name}
                    </span>
                    {index === 0 && (
                      <span style={{
                        fontSize: '10px',
                        backgroundColor: '#FFD700',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: 'bold'
                      }}>NEXT UP</span>
                    )}
                  </div>

                  {/* Delete Button */}
                  <button
                    onClick={() => leaveQueue(player.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ccc',
                      cursor: 'pointer',
                      fontSize: '18px',
                      padding: '5px'
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <p style={{ textAlign: 'center', color: '#999', fontSize: '12px', marginTop: '20px' }}>
          Tap ✕ to remove yourself or the current player.
        </p>
      </div>
    </div>
  )
}

export default App