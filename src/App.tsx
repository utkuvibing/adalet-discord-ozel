import React from 'react';

function App(): React.JSX.Element {
  return (
    <div
      style={{
        backgroundColor: '#0d0d0d',
        color: '#e0e0e0',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
      }}
    >
      <div>
        <h1 style={{ color: '#7fff00' }}>Sex Dungeon</h1>
        <p>Loading...</p>
      </div>
    </div>
  );
}

export default App;
